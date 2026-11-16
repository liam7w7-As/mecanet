import {
  createWorkshopTimeRequestSchema,
  reviewWorkshopTimeRequestSchema,
  workshopTimeQuerySchema,
} from '@unithor/shared';
import { Op, Transaction } from 'sequelize';

import { recordItemProgressEvent, roundHours } from './work-order-labor-events.js';
import {
  getSessionMinutes,
  getSessionMinutesInRange,
  recalculateItemHours,
} from './work-order-labor-sessions.js';
import { getAssignedOrderIds, isAssignedToItem } from './work-order-team-access.js';
import { syncMirrorQuotationFromWorkOrder } from './work-order.service.js';
import { getWorkerShift, getWorkshopDayRange } from './workshop-personnel.service.js';
import { settleExpiredLaborSessions } from './workshop-shift-worker.service.js';
import { withWorkshopTransaction } from './workshop-transaction.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
import { WorkOrderItemSession } from '../models/WorkOrderItemSession.js';
import { WorkshopTimeRequest } from '../models/WorkshopTimeRequest.js';
import { ApiError } from '../utils/ApiError.js';
import { exactIntervalMinutes } from '../utils/workshop-session-time.js';

import type {
  CreateWorkshopTimeRequestInput,
  ReviewWorkshopTimeRequestInput,
  WorkshopTimeEligibleItem,
  WorkshopTimeEntry,
  WorkshopTimeJournal,
  WorkshopTimeQueryInput,
  WorkshopTimeRequestRecord,
  WorkshopTimeWorker,
} from '@unithor/shared';
import type { WhereOptions } from 'sequelize';

export interface WorkshopTimeActor {
  id: number;
  role: string;
}
const SUPERVISORS = new Set(['admin', 'desarrollador', 'jefe']);
const assertActor = (actor: WorkshopTimeActor): void => {
  if (actor.role !== 'mecanico' && !SUPERVISORS.has(actor.role)) {
    throw ApiError.forbidden('No tienes acceso al diario de taller');
  }
};
const scopeUserId = (actor: WorkshopTimeActor, userId?: number): number | undefined => {
  assertActor(actor);
  if (!SUPERVISORS.has(actor.role) && userId !== undefined) {
    throw ApiError.forbidden('Solo el jefe puede filtrar por trabajador');
  }
  return SUPERVISORS.has(actor.role) ? userId : actor.id;
};
const intervalMinutes = (start: Date, end: Date, rangeStart: Date, rangeEnd: Date): number =>
  exactIntervalMinutes(start, end, rangeStart, rangeEnd);

const workshopDateAt = async (at: Date, transaction: Transaction): Promise<string> => {
  const date = at.toISOString().slice(0, 10);
  const range = await getWorkshopDayRange(date, transaction);
  const civil = new Date(`${date}T00:00:00Z`);
  if (at < range.start) civil.setUTCDate(civil.getUTCDate() - 1);
  else if (at >= range.end) civil.setUTCDate(civil.getUTCDate() + 1);
  return civil.toISOString().slice(0, 10);
};

// Every writer takes this lock before any order/item/request/session lock. The timer
// start path uses the same User lock, including when a worker has no sessions yet.
const lockWorker = async (userId: number, transaction: Transaction): Promise<User> => {
  const worker = await User.findByPk(userId, {
    attributes: ['id', 'nombre', 'activo', 'deletedAt'],
    paranoid: false,
    transaction,
    lock: Transaction.LOCK.UPDATE,
  });
  if (!worker) throw ApiError.notFound('Trabajador no encontrado');
  return worker;
};

const findContext = async (workOrderId: number, itemId: number, transaction: Transaction) => {
  const workOrder = await WorkOrder.findByPk(workOrderId, {
    transaction,
    lock: Transaction.LOCK.UPDATE,
  });
  if (!workOrder) throw ApiError.notFound('Orden de trabajo no encontrada');
  const item = await WorkOrderItem.findOne({
    where: { id: itemId, workOrderId },
    transaction,
    lock: Transaction.LOCK.UPDATE,
  });
  if (!item) throw ApiError.notFound('Servicio no encontrado');
  if (item.tipoLinea === 'parte')
    throw ApiError.badRequest('Solo se pueden registrar horas en servicios');
  return { workOrder, item };
};

const assertAssigned = async (
  item: WorkOrderItem,
  workOrder: WorkOrder,
  userId: number,
  transaction: Transaction,
): Promise<void> => {
  if (!(await isAssignedToItem(item, workOrder, userId, transaction))) {
    throw ApiError.forbidden('El servicio no está asignado a este trabajador');
  }
};

const findCorrectionSource = async (
  sourceSessionId: number,
  userId: number,
  transaction: Transaction,
): Promise<WorkOrderItemSession> => {
  const source = await WorkOrderItemSession.findOne({
    where: { id: sourceSessionId, userId },
    transaction,
    lock: Transaction.LOCK.UPDATE,
  });
  if (!source) throw ApiError.notFound('Registro de tiempo propio no encontrado');
  if (
    source.status !== 'cerrada' ||
    !source.endedAt ||
    source.supersededAt ||
    source.kind === 'ajuste'
  ) {
    throw ApiError.badRequest(
      'Solo se puede solicitar corrección de un intervalo cerrado y vigente',
    );
  }
  return source;
};

const assertNoOverlap = async (
  userId: number,
  startedAt: Date,
  endedAt: Date,
  transaction: Transaction,
  sourceSessionId?: number | null,
  requestId?: number,
): Promise<void> => {
  const sessions = await WorkOrderItemSession.findAll({
    attributes: ['id', 'startedAt', 'endedAt', 'scheduledEndAt'],
    where: {
      userId,
      supersededAt: null,
      kind: { [Op.ne]: 'ajuste' },
      ...(sourceSessionId ? { id: { [Op.ne]: sourceSessionId } } : {}),
      startedAt: { [Op.lt]: endedAt },
      [Op.or]: [{ endedAt: null }, { endedAt: { [Op.gt]: startedAt } }],
    },
    transaction,
    lock: Transaction.LOCK.UPDATE,
  });
  const overlaps = sessions.some(
    (session) =>
      startedAt.getTime() <
      Math.min(
        session.endedAt?.getTime() ?? Date.now(),
        session.scheduledEndAt?.getTime() ?? Infinity,
      ),
  );
  if (overlaps)
    throw ApiError.conflict(
      'El intervalo se superpone con horas registradas o un cronómetro en curso',
    );
  const pending = await WorkshopTimeRequest.findOne({
    attributes: ['id'],
    where: {
      userId,
      status: 'pendiente',
      ...(requestId ? { id: { [Op.ne]: requestId } } : {}),
      [Op.or]: [
        { startedAt: { [Op.lt]: endedAt }, endedAt: { [Op.gt]: startedAt } },
        ...(sourceSessionId ? [{ sourceSessionId }] : []),
      ],
    },
    transaction,
    lock: Transaction.LOCK.UPDATE,
  });
  if (pending)
    throw ApiError.conflict('Ya existe una solicitud pendiente para ese intervalo o registro');
};

const toRequestRecord = (
  request: WorkshopTimeRequest,
  workOrder?: WorkOrder,
  item?: WorkOrderItem,
  range?: { start: Date; end: Date },
): WorkshopTimeRequestRecord => ({
  id: request.id,
  kind: request.kind,
  status: request.status,
  workOrderId: request.workOrderId,
  workOrderCode: workOrder?.codigo ?? `OT ${request.workOrderId}`,
  itemId: request.workOrderItemId,
  description: item?.descripcion ?? 'Servicio histórico',
  userId: request.userId,
  userName: request.userName,
  sourceSessionId: request.sourceSessionId,
  replacementSessionId: request.replacementSessionId,
  startedAt: request.startedAt.toISOString(),
  endedAt: request.endedAt.toISOString(),
  durationMinutes: request.durationMinutes,
  minutesOnDate: range
    ? intervalMinutes(request.startedAt, request.endedAt, range.start, range.end)
    : request.durationMinutes,
  note: request.note,
  createdBy: request.createdBy,
  createdAt: request.createdAt.toISOString(),
  reviewedBy: request.reviewedBy,
  reviewedAt: request.reviewedAt?.toISOString() ?? null,
  reviewNote: request.reviewNote,
});

const acceptRequest = async (
  request: WorkshopTimeRequest,
  worker: User,
  actor: WorkshopTimeActor,
  reviewNote: string,
  context: Awaited<ReturnType<typeof findContext>>,
  transaction: Transaction,
  source?: WorkOrderItemSession,
): Promise<void> => {
  const { workOrder, item } = context;
  const previousHours = await recalculateItemHours(item, transaction);
  if (source) {
    // Do not rewrite the original interval, minutes, note, attribution or status.
    await source.update({ supersededAt: new Date() }, { transaction });
  }
  const { WorkOrderItemAssignment } = await import('../models/WorkOrderItemAssignment.js');
  const assignment = source
    ? null
    : await WorkOrderItemAssignment.findOne({
        attributes: ['id'],
        where: { workOrderItemId: item.id, userId: request.userId, active: true },
        transaction,
        lock: Transaction.LOCK.UPDATE,
      });
  const session = await WorkOrderItemSession.create(
    {
      workOrderId: workOrder.id,
      workOrderItemId: item.id,
      userId: request.userId,
      userName: worker.nombre,
      kind: 'manual',
      status: 'cerrada',
      startedAt: request.startedAt,
      endedAt: request.endedAt,
      durationMinutes: request.durationMinutes,
      note: request.note,
      closeReason: 'cierre_manual',
      createdBy: actor.id,
      supersededAt: null,
      scheduledEndAt: null,
      assignmentId: source ? (source.assignmentId ?? null) : (assignment?.id ?? null),
    },
    { transaction },
  );
  await request.update(
    {
      status: 'aprobada',
      replacementSessionId: session.id,
      reviewedBy: actor.id,
      reviewedAt: new Date(),
      reviewNote,
    },
    { transaction },
  );
  const hours = await recalculateItemHours(item, transaction);
  // An approved change invalidates a previous whole-item hours validation.
  await item.update(
    { laborValidatedBy: null, laborValidatedAt: null, laborValidationNote: null },
    { transaction },
  );
  await recordItemProgressEvent(
    {
      workOrderId: workOrder.id,
      workOrderItemId: item.id,
      itemDescripcion: item.descripcion,
      fromStatus: item.estadoOperativo,
      toStatus: item.estadoOperativo,
      performedByUserId: actor.id,
      assignedUserId: request.userId,
      horasEstimadas:
        item.horasHombreEstimadas === null
          ? null
          : roundHours(Number(item.horasHombreEstimadas) * Number(item.cantidad)),
      horasReales: hours,
      horasDelta: roundHours((hours ?? 0) - (previousHours ?? 0)),
      fechaEfectiva: await workshopDateAt(request.startedAt, transaction),
      sessionId: session.id,
      source: 'ajuste',
      note: `${request.kind === 'correction' ? `Corrección del registro #${request.sourceSessionId}` : 'Registro manual'}: ${request.note}\nValidación: ${reviewNote}`,
    },
    transaction,
  );
  await syncMirrorQuotationFromWorkOrder(workOrder.id, transaction, true);
};

export const createWorkshopTimeRequest = async (
  actor: WorkshopTimeActor,
  input: CreateWorkshopTimeRequestInput,
): Promise<WorkshopTimeRequestRecord> => {
  assertActor(actor);
  const parsed = createWorkshopTimeRequestSchema.safeParse(input);
  if (!parsed.success)
    throw ApiError.badRequest(parsed.error.issues[0]?.message ?? 'Intervalo inválido');
  const data = parsed.data;
  const correction = 'sourceSessionId' in data;
  if (!correction && data.userId !== undefined && !SUPERVISORS.has(actor.role)) {
    throw ApiError.forbidden('Solo el jefe puede registrar horas para otro trabajador');
  }
  const userId = correction ? actor.id : (data.userId ?? actor.id);
  return withWorkshopTransaction(async (transaction) => {
    const worker = await lockWorker(userId, transaction);
    if (!worker.activo || worker.deletedAt)
      throw ApiError.badRequest('El trabajador está inactivo');
    const source = correction
      ? await findCorrectionSource(data.sourceSessionId, actor.id, transaction)
      : undefined;
    const context = await findContext(
      source?.workOrderId ?? (correction ? 0 : data.workOrderId),
      source?.workOrderItemId ?? (correction ? 0 : data.itemId),
      transaction,
    );
    if (!correction) {
      if (['entregada', 'cancelada'].includes(context.workOrder.estado))
        throw ApiError.badRequest('La orden de trabajo está cerrada');
      await assertAssigned(context.item, context.workOrder, userId, transaction);
    }
    const startedAt = new Date(data.startedAt);
    const endedAt = new Date(data.endedAt);
    if (
      source &&
      source.startedAt.getTime() === startedAt.getTime() &&
      source.endedAt?.getTime() === endedAt.getTime()
    ) {
      throw ApiError.badRequest('La corrección debe cambiar el intervalo original');
    }
    await assertNoOverlap(userId, startedAt, endedAt, transaction, source?.id);
    const request = await WorkshopTimeRequest.create(
      {
        kind: correction ? 'correction' : 'manual',
        status: 'pendiente',
        workOrderId: context.workOrder.id,
        workOrderItemId: context.item.id,
        userId,
        userName: worker.nombre,
        sourceSessionId: source?.id ?? null,
        replacementSessionId: null,
        startedAt,
        endedAt,
        durationMinutes: Math.floor((endedAt.getTime() - startedAt.getTime()) / 60_000),
        note: data.note,
        createdBy: actor.id,
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
      },
      { transaction },
    );
    // A mechanic's entry remains visible as a pending request, with no real session.
    // The chief's mandatory note is also the reason for retroactive/overtime work.
    if (!correction && SUPERVISORS.has(actor.role)) {
      await acceptRequest(request, worker, actor, data.note, context, transaction);
    }
    return toRequestRecord(request, context.workOrder, context.item);
  });
};

export const reviewWorkshopTimeRequest = async (
  actor: WorkshopTimeActor,
  requestId: number,
  input: ReviewWorkshopTimeRequestInput,
): Promise<WorkshopTimeRequestRecord> => {
  assertActor(actor);
  if (!SUPERVISORS.has(actor.role))
    throw ApiError.forbidden('La revisión requiere al jefe de taller');
  const parsed = reviewWorkshopTimeRequestSchema.safeParse(input);
  if (!parsed.success) throw ApiError.badRequest('Debe indicar el motivo de la revisión');
  // Read only the worker ID before the transaction so the first acquired lock is
  // always the worker; re-read the request under lock before using its contents.
  const candidate = await WorkshopTimeRequest.findByPk(requestId, { attributes: ['userId'] });
  if (!candidate) throw ApiError.notFound('Solicitud no encontrada');
  return withWorkshopTransaction(async (transaction) => {
    const worker = await lockWorker(candidate.userId, transaction);
    const request = await WorkshopTimeRequest.findByPk(requestId, {
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });
    if (!request || request.userId !== worker.id)
      throw ApiError.notFound('Solicitud no encontrada');
    if (request.status !== 'pendiente') throw ApiError.conflict('La solicitud ya fue revisada');
    const context = await findContext(request.workOrderId, request.workOrderItemId, transaction);
    if (!parsed.data.approve) {
      await request.update(
        {
          status: 'rechazada',
          reviewedBy: actor.id,
          reviewedAt: new Date(),
          reviewNote: parsed.data.note,
        },
        { transaction },
      );
    } else {
      const source =
        request.kind === 'correction'
          ? await findCorrectionSource(request.sourceSessionId ?? 0, request.userId, transaction)
          : undefined;
      if (
        source &&
        (source.workOrderId !== request.workOrderId ||
          source.workOrderItemId !== request.workOrderItemId)
      ) {
        throw ApiError.conflict('El registro original no corresponde a esta solicitud');
      }
      await assertNoOverlap(
        request.userId,
        request.startedAt,
        request.endedAt,
        transaction,
        source?.id,
        request.id,
      );
      // Assignment was verified on submission. Reassignment/delivery must not
      // prevent the chief from validating that worker's already submitted hours.
      await acceptRequest(request, worker, actor, parsed.data.note, context, transaction, source);
    }
    return toRequestRecord(request, context.workOrder, context.item);
  });
};

export const getWorkshopTimeEligibleItems = async (
  actor: WorkshopTimeActor,
  selectedUserId?: number,
): Promise<WorkshopTimeEligibleItem[]> => {
  const userId = scopeUserId(actor, selectedUserId) ?? actor.id;
  const orderIds = await getAssignedOrderIds(userId);
  if (!orderIds.length) return [];
  const orders = await WorkOrder.findAll({
    attributes: ['id', 'codigo', 'estado', 'assignedMechanicId'],
    where: { id: { [Op.in]: orderIds }, estado: { [Op.notIn]: ['entregada', 'cancelada'] } },
  });
  if (!orders.length) return [];
  const items = await WorkOrderItem.findAll({
    attributes: ['id', 'workOrderId', 'descripcion', 'tipoLinea', 'assignedUserId', 'teamManaged'],
    where: {
      workOrderId: { [Op.in]: orders.map((order) => order.id) },
      tipoLinea: { [Op.ne]: 'parte' },
    },
    order: [
      ['workOrderId', 'DESC'],
      ['id', 'ASC'],
    ],
  });
  if (!items.length) return [];
  const byOrder = new Map(orders.map((order) => [order.id, order]));
  const eligible: WorkshopTimeEligibleItem[] = [];
  for (const item of items) {
    const order = byOrder.get(item.workOrderId);
    if (order && (await isAssignedToItem(item, order, userId))) {
      eligible.push({
        workOrderId: order.id,
        workOrderCode: order.codigo,
        itemId: item.id,
        description: item.descripcion,
        userId,
      });
    }
  }
  return eligible;
};

export const getWorkshopTimeJournal = async (
  actor: WorkshopTimeActor,
  input: WorkshopTimeQueryInput,
): Promise<WorkshopTimeJournal> => {
  const parsed = workshopTimeQuerySchema.safeParse(input);
  if (!parsed.success) throw ApiError.badRequest('Fecha o trabajador inválido');
  const userId = scopeUserId(actor, parsed.data.userId);
  await settleExpiredLaborSessions();
  const range = await getWorkshopDayRange(parsed.data.fecha);
  const now = new Date();
  const userWhere = userId === undefined ? { userId: { [Op.ne]: null } } : { userId };
  const sessions = await WorkOrderItemSession.findAll({
    where: {
      ...userWhere,
      startedAt: { [Op.lt]: range.end },
      [Op.or]: [
        { endedAt: { [Op.gt]: range.start } },
        { endedAt: null },
        { kind: 'ajuste', startedAt: { [Op.gte]: range.start } },
      ],
    },
    order: [
      ['startedAt', 'ASC'],
      ['id', 'ASC'],
    ],
  });
  // A correction belongs to both the proposed day and the original day. Include
  // the latter too so moving an interval never hides its pending/history record.
  const sessionIds = sessions.map((session) => session.id);
  const requestWhere: WhereOptions = {
    ...userWhere,
    [Op.or]: [
      { startedAt: { [Op.lt]: range.end }, endedAt: { [Op.gt]: range.start } },
      ...(sessionIds.length ? [{ sourceSessionId: { [Op.in]: sessionIds } }] : []),
    ],
  };
  const requests = await WorkshopTimeRequest.findAll({
    where: requestWhere,
    order: [
      ['createdAt', 'DESC'],
      ['id', 'DESC'],
    ],
  });
  const orderIds = [...new Set([...sessions, ...requests].map((entry) => entry.workOrderId))];
  const itemIds = [...new Set([...sessions, ...requests].map((entry) => entry.workOrderItemId))];
  const orders = orderIds.length
    ? await WorkOrder.findAll({
        attributes: ['id', 'codigo'],
        where: { id: { [Op.in]: orderIds } },
      })
    : [];
  const items = itemIds.length
    ? await WorkOrderItem.findAll({
        attributes: ['id', 'descripcion'],
        where: { id: { [Op.in]: itemIds } },
      })
    : [];
  const byOrder = new Map(orders.map((order) => [order.id, order]));
  const byItem = new Map(items.map((item) => [item.id, item]));
  let workers: WorkshopTimeWorker[];
  if (SUPERVISORS.has(actor.role)) {
    const active = await User.findAll({
      attributes: ['id', 'nombre'],
      where: { activo: true },
      include: [{ model: Role, as: 'role', attributes: [], where: { nombre: 'mecanico' } }],
      order: [['nombre', 'ASC']],
    });
    const known = new Map<number, WorkshopTimeWorker>(
      active.map((worker) => [worker.id, { id: worker.id, nombre: worker.nombre }]),
    );
    const historicalIds = [
      ...new Set(
        [...sessions, ...requests].flatMap((entry) =>
          entry.userId === null ? [] : [entry.userId],
        ),
      ),
    ];
    if (userId !== undefined) historicalIds.push(userId);
    const missing = historicalIds.filter((id) => !known.has(id));
    if (missing.length) {
      const historical = await User.findAll({
        attributes: ['id', 'nombre'],
        paranoid: false,
        where: { id: { [Op.in]: missing } },
      });
      for (const worker of historical)
        known.set(worker.id, { id: worker.id, nombre: worker.nombre });
    }
    workers = [...known.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  } else {
    const worker = await User.findByPk(actor.id, { attributes: ['id', 'nombre'] });
    workers = worker ? [{ id: worker.id, nombre: worker.nombre }] : [];
  }
  const entries: WorkshopTimeEntry[] = sessions.flatMap((session) =>
    session.userId === null
      ? []
      : [
          {
            id: session.id,
            workOrderId: session.workOrderId,
            workOrderCode: byOrder.get(session.workOrderId)?.codigo ?? `OT ${session.workOrderId}`,
            itemId: session.workOrderItemId,
            description: byItem.get(session.workOrderItemId)?.descripcion ?? 'Servicio histórico',
            userId: session.userId,
            userName: session.userName,
            kind: session.kind,
            status: session.status,
            startedAt: session.startedAt.toISOString(),
            endedAt: session.endedAt?.toISOString() ?? null,
            // Preserve the replaced record's original audit metadata. Effective
            // totals exclude it; current clocks expose their exact elapsed time.
            durationMinutes: session.supersededAt
              ? session.durationMinutes ?? 0
              : getSessionMinutes(session, now),
            minutesOnDate: session.supersededAt
              ? 0
              : getSessionMinutesInRange(session, range.start, range.end, now),
            note: session.note,
            supersededAt: session.supersededAt?.toISOString() ?? null,
            scheduledEndAt: session.scheduledEndAt?.toISOString() ?? null,
          },
        ],
  );
  const requestRecords = requests.map((request) =>
    toRequestRecord(
      request,
      byOrder.get(request.workOrderId),
      byItem.get(request.workOrderItemId),
      range,
    ),
  );
  const registeredMinutes = entries.reduce((sum, entry) => sum + entry.minutesOnDate, 0);
  const pendingMinutes = requestRecords.reduce(
    (sum, request) => sum + (request.status === 'pendiente' ? request.minutesOnDate : 0),
    0,
  );
  let scheduledMinutes: number | null = 0;
  let unregisteredMinutes: number | null = 0;
  const scheduledWorkers =
    userId === undefined ? workers : workers.filter((worker) => worker.id === userId);
  if (!scheduledWorkers.length) {
    scheduledMinutes = null;
    unregisteredMinutes = null;
  }
  for (const worker of scheduledWorkers) {
    const shift = await getWorkerShift(worker.id, range.start);
    if (!shift.configured) {
      scheduledMinutes = null;
      unregisteredMinutes = null;
      break;
    }
    if (!shift.start || !shift.end) continue;
    const start = new Date(Math.max(new Date(shift.start).getTime(), range.start.getTime()));
    const end = new Date(Math.min(new Date(shift.end).getTime(), range.end.getTime()));
    const scheduled = intervalMinutes(start, end, start, end);
    const covered = sessions.reduce(
      (sum, session) =>
        sum +
        (session.userId === worker.id && !session.supersededAt && session.kind !== 'ajuste'
          ? intervalMinutes(
              session.startedAt,
              new Date(
                Math.min(
                  session.endedAt?.getTime() ?? now.getTime(),
                  now.getTime(),
                  session.scheduledEndAt?.getTime() ?? Infinity,
                ),
              ),
              start,
              end,
            )
          : 0),
      0,
    );
    scheduledMinutes = (scheduledMinutes ?? 0) + scheduled;
    unregisteredMinutes = (unregisteredMinutes ?? 0) + Math.max(0, scheduled - covered);
  }
  return {
    entries,
    requests: requestRecords,
    workers,
    totals: { registeredMinutes, pendingMinutes, scheduledMinutes, unregisteredMinutes },
    date: parsed.data.fecha,
  };
};
