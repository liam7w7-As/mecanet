import {
  DEFAULT_WORKSHOP_TIMEZONE,
  updateWorkshopAlertSettingsSchema,
  workshopAlertQuerySchema,
} from '@unithor/shared';
import { Op, Transaction } from 'sequelize';

import { getAssignedOrderIds } from './work-order-team-access.js';
import { assertWorkOrderAccess } from './work-order.service.js';
import { calculateWorkshopAlerts } from './workshop-alert.calculator.js';
import { getWorkerShift, getWorkshopDayRange } from './workshop-personnel.service.js';
import { withWorkshopTransaction } from './workshop-transaction.js';
import { sequelize } from '../config/database.js';
import { Permission } from '../models/Permission.js';
import { Quotation } from '../models/Quotation.js';
import { QuotationItem } from '../models/QuotationItem.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { WorkerSpecialty } from '../models/WorkerSpecialty.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
import { WorkOrderItemAssignment } from '../models/WorkOrderItemAssignment.js';
import { WorkOrderItemSession } from '../models/WorkOrderItemSession.js';
import { WorkOrderPriceSuggestion } from '../models/WorkOrderPriceSuggestion.js';
import { WorkshopAlertSettings } from '../models/WorkshopAlertSettings.js';
import { WorkshopSchedule } from '../models/WorkshopSchedule.js';
import { WorkshopTimeRequest } from '../models/WorkshopTimeRequest.js';
import { ApiError } from '../utils/ApiError.js';

import type {
  AlertAssignment,
  AlertItem,
  AlertQuotation,
  AlertWorkerDay,
} from './workshop-alert.calculator.js';
import type {
  UpdateWorkshopAlertSettingsInput,
  WorkshopAlertSettingsPublic,
  WorkshopAlertSummary,
} from '@unithor/shared';

const MAX_ORDERS = 500;
const MAX_DETAILS = 10_000;
const MAX_WORKERS = 500;
const bounded = <T>(rows: T[], max = MAX_DETAILS): T[] => {
  if (rows.length > max)
    throw ApiError.badRequest(
      'El panel de alertas supera el límite de registros. Consulta las alertas de una OT individual.',
    );
  return rows;
};

/** Read persisted identity AND permission matrix on every service invocation. */
const requireActor = async (
  userId: number,
  action: 'read' | 'update' = 'read',
  transaction?: Transaction,
) => {
  const user = await User.findOne({
    where: { id: userId, activo: true },
    attributes: ['id', 'nombre', 'roleId'],
    include: [
      {
        model: Role,
        as: 'role',
        attributes: ['nombre'],
        include: [
          { model: Permission, attributes: ['modulo', 'accion'], through: { attributes: [] } },
        ],
      },
    ],
    transaction,
  });
  const role = user?.role?.nombre;
  const roles =
    action === 'update'
      ? ['admin', 'desarrollador']
      : ['admin', 'desarrollador', 'jefe', 'mecanico'];
  if (
    !user ||
    !role ||
    !roles.includes(role) ||
    (!['admin', 'desarrollador'].includes(role) &&
      !user.role?.permissions?.some(
        (grant) => grant.modulo === 'taller' && grant.accion === action,
      ))
  ) {
    throw ApiError.forbidden(
      action === 'update'
        ? 'Solo administración con permiso de actualización de taller puede configurar las alertas.'
        : 'No tienes acceso a las alertas operativas de taller.',
    );
  }
  return { id: user.id, mechanic: role === 'mecanico' };
};
const settingsPublic = (row: WorkshopAlertSettings | null): WorkshopAlertSettingsPublic => ({
  id: 1,
  timeTolerancePercent: Number(row?.timeTolerancePercent ?? 0),
  commercialTolerancePercent: Number(row?.commercialTolerancePercent ?? 0),
  updatedBy: row?.updatedBy ?? null,
  updatedAt: row?.updatedAt?.toISOString() ?? null,
});

export async function getWorkshopAlertSettings(
  userId: number,
): Promise<WorkshopAlertSettingsPublic> {
  await requireActor(userId);
  return settingsPublic(await WorkshopAlertSettings.findByPk(1));
}

export async function updateWorkshopAlertSettings(
  input: UpdateWorkshopAlertSettingsInput,
  userId: number,
): Promise<WorkshopAlertSettingsPublic> {
  const data = updateWorkshopAlertSettingsSchema.parse(input);
  return withWorkshopTransaction(async (transaction) => {
    await requireActor(userId, 'update', transaction);
    await WorkshopAlertSettings.findOrCreate({
      where: { id: 1 },
      defaults: {
        id: 1,
        timeTolerancePercent: 0,
        commercialTolerancePercent: 0,
        updatedBy: userId,
      },
      transaction,
    });
    const row = await WorkshopAlertSettings.findByPk(1, {
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });
    if (!row) throw ApiError.conflict('No se pudo cargar la configuración de alertas');
    await row.update({ ...data, updatedBy: userId }, { transaction });
    return settingsPublic(row);
  });
}

const sessionAttributes = [
  'id',
  'workOrderId',
  'workOrderItemId',
  'userId',
  'userName',
  'assignmentId',
  'kind',
  'status',
  'startedAt',
  'endedAt',
  'scheduledEndAt',
  'durationMinutes',
  'reportedDate',
  'overtime',
  'supersededAt',
];

async function readAlerts(
  fecha: string | undefined,
  userId: number,
  workOrderId?: number,
): Promise<WorkshopAlertSummary> {
  return sequelize.transaction(
    { isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ, readOnly: true },
    async (transaction) => {
      const actor = await requireActor(userId, 'read', transaction);
      if (workOrderId !== undefined) await assertWorkOrderAccess(workOrderId, userId, transaction);
      const now = new Date();
      const schedule = await WorkshopSchedule.findByPk(1, { transaction });
      const date =
        workshopAlertQuerySchema.parse({ fecha }).fecha ??
        new Intl.DateTimeFormat('en-CA', {
          timeZone: schedule?.timezone ?? DEFAULT_WORKSHOP_TIMEZONE,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(now);
      const { start, end } = await getWorkshopDayRange(date, transaction);
      const settingsRow = settingsPublic(await WorkshopAlertSettings.findByPk(1, { transaction }));
      const settings = {
        timeTolerancePercent: settingsRow.timeTolerancePercent,
        commercialTolerancePercent: settingsRow.commercialTolerancePercent,
      };
      const ownOrderIds =
        actor.mechanic && workOrderId === undefined
          ? bounded(
              await getAssignedOrderIds(userId, transaction, {
                activeOnly: true,
                limit: MAX_ORDERS + 1,
              }),
              MAX_ORDERS,
            )
          : undefined;
      const orders = bounded(
        await WorkOrder.findAll({
          attributes: [
            'id',
            'codigo',
            'estado',
            'fechaEntrega',
            'assignedMechanicId',
            'qualityApprovedAt',
          ],
          where:
            workOrderId !== undefined
              ? { id: workOrderId }
              : {
                  estado: { [Op.notIn]: ['entregada', 'cancelada'] },
                  ...(ownOrderIds ? { id: { [Op.in]: ownOrderIds } } : {}),
                },
          order: [['id', 'DESC']],
          limit: MAX_ORDERS + 1,
          transaction,
        }),
        MAX_ORDERS,
      );
      if (workOrderId !== undefined && !orders.length)
        throw ApiError.notFound('Orden de trabajo no encontrada');
      const orderIds = orders
        .filter((order) => !['entregada', 'cancelada'].includes(order.estado))
        .map((order) => order.id);
      const items = orderIds.length
        ? bounded(
            await WorkOrderItem.findAll({
              attributes: [
                'id',
                'workOrderId',
                'descripcion',
                'tipoLinea',
                'unidadMedida',
                'catalogItemId',
                'cantidad',
                'horasHombreEstimadas',
                'estadoOperativo',
                'qualityStatus',
                'assignedUserId',
                'teamManaged',
                ...(!actor.mechanic ? ['precioUnitario', 'horasHombreReales'] : []),
              ],
              where: { workOrderId: { [Op.in]: orderIds } },
              order: [['id', 'ASC']],
              limit: MAX_DETAILS + 1,
              transaction,
            }),
          )
        : [];
      const assignments: AlertAssignment[] = orderIds.length
        ? bounded(
            await WorkOrderItemAssignment.findAll({
              attributes: [
                'id',
                'workOrderId',
                'workOrderItemId',
                'userId',
                'active',
                'estimatedHours',
                ...(!actor.mechanic ? ['saleHourly'] : []),
              ],
              where: { workOrderId: { [Op.in]: orderIds }, ...(actor.mechanic ? { userId } : {}) },
              order: [['id', 'ASC']],
              limit: MAX_DETAILS + 1,
              transaction,
            }),
          )
        : [];
      const orderMap = new Map(orders.map((order) => [order.id, order]));
      const visibleItems: AlertItem[] = actor.mechanic
        ? items.filter((item) =>
            item.teamManaged
              ? assignments.some(
                  (a) =>
                    a.workOrderItemId === item.id &&
                    a.workOrderId === item.workOrderId &&
                    a.active &&
                    a.userId === userId,
                )
              : (item.assignedUserId ?? orderMap.get(item.workOrderId)?.assignedMechanicId) ===
                userId,
          )
        : items;
      const visibleItemIds = visibleItems.map((item) => item.id);
      const sessions = visibleItemIds.length
        ? bounded(
            await WorkOrderItemSession.findAll({
              attributes: sessionAttributes,
              where: {
                workOrderItemId: { [Op.in]: visibleItemIds },
                startedAt: { [Op.lte]: now },
                ...(actor.mechanic ? { userId } : {}),
              },
              order: [['id', 'ASC']],
              limit: MAX_DETAILS + 1,
              transaction,
            }),
          )
        : [];
      const timeRequests = visibleItemIds.length
        ? bounded(
            await WorkshopTimeRequest.findAll({
              attributes: ['id', 'workOrderId', 'workOrderItemId', 'userId'],
              where: {
                workOrderItemId: { [Op.in]: visibleItemIds },
                status: 'pendiente',
                ...(actor.mechanic ? { userId } : {}),
              },
              order: [['id', 'ASC']],
              limit: MAX_DETAILS + 1,
              transaction,
            }),
          )
        : [];
      const priceRequests =
        !actor.mechanic && orderIds.length
          ? bounded(
              await WorkOrderPriceSuggestion.findAll({
                attributes: ['id', 'workOrderId', 'workOrderItemId'],
                where: { workOrderId: { [Op.in]: orderIds }, estado: 'pendiente' },
                order: [['id', 'ASC']],
                limit: MAX_DETAILS + 1,
                transaction,
              }),
            )
          : [];
      const quotations: AlertQuotation[] = [];
      if (!actor.mechanic && orderIds.length) {
        const quotes = bounded(
          await Quotation.findAll({
            attributes: ['id', 'workOrderId', 'total'],
            where: { workOrderId: { [Op.in]: orderIds } },
            order: [['id', 'ASC']],
            limit: MAX_DETAILS + 1,
            transaction,
          }),
        );
        const lines = quotes.length
          ? bounded(
              await QuotationItem.findAll({
                attributes: [
                  'id',
                  'quotationId',
                  'workOrderItemId',
                  'catalogItemId',
                  'descripcion',
                  'tipoLinea',
                  'unidadMedida',
                  'precioUnitario',
                  'subtotal',
                ],
                where: { quotationId: { [Op.in]: quotes.map((quote) => quote.id) } },
                order: [['id', 'ASC']],
                limit: MAX_DETAILS + 1,
                transaction,
              }),
            )
          : [];
        for (const quote of quotes)
          quotations.push({
            id: quote.id,
            workOrderId: quote.workOrderId,
            total: quote.total,
            items: lines.filter((line) => line.quotationId === quote.id),
          });
      }
      const assignedWorkers = new Set(
        assignments
          .filter((a) => a.active && visibleItemIds.includes(a.workOrderItemId))
          .map((a) => a.userId),
      );
      for (const item of visibleItems.filter((item) => !item.teamManaged)) {
        const worker = item.assignedUserId ?? orderMap.get(item.workOrderId)?.assignedMechanicId;
        if (worker) assignedWorkers.add(worker);
      }
      // An overview includes real workers, not every account with a configured role.
      const specialties =
        !actor.mechanic && workOrderId === undefined
          ? bounded(
              await WorkerSpecialty.findAll({
                attributes: ['userId'],
                limit: MAX_DETAILS + 1,
                transaction,
              }),
            )
          : [];
      const eligible = [
        ...new Set([...assignedWorkers, ...specialties.map((entry) => entry.userId)]),
      ];
      const workers = bounded(
        await User.findAll({
          attributes: ['id', 'nombre'],
          include: [{ model: Role, as: 'role', attributes: ['nombre'] }],
          where: {
            activo: true,
            ...(actor.mechanic
              ? { id: userId }
              : workOrderId !== undefined
                ? { id: { [Op.in]: eligible } }
                : { [Op.or]: [{ '$role.nombre$': 'mecanico' }, { id: { [Op.in]: eligible } }] }),
          },
          order: [['id', 'ASC']],
          limit: MAX_WORKERS + 1,
          transaction,
        }),
        MAX_WORKERS,
      );
      const daily = workers.length
        ? bounded(
            await WorkOrderItemSession.findAll({
              attributes: sessionAttributes,
              where: {
                userId: { [Op.in]: workers.map((worker) => worker.id) },
                supersededAt: null,
                startedAt: { [Op.lt]: end, [Op.lte]: now },
                [Op.or]: [
                  { reportedDate: date },
                  { kind: 'ajuste', startedAt: { [Op.gte]: start } },
                  {
                    kind: { [Op.ne]: 'ajuste' },
                    [Op.or]: [{ endedAt: null }, { endedAt: { [Op.gt]: start } }],
                  },
                ],
              },
              order: [['id', 'ASC']],
              limit: MAX_DETAILS + 1,
              transaction,
            }),
          )
        : [];
      const workerDays: AlertWorkerDay[] = [];
      const midpoint = new Date(start.getTime() + (end.getTime() - start.getTime()) / 2);
      for (const worker of workers) {
        const shift = await getWorkerShift(worker.id, midpoint, transaction);
        workerDays.push({
          userId: worker.id,
          name: worker.nombre,
          ...shift,
          dayStart: start,
          dayEnd: end,
          sessions: daily.filter((session) => session.userId === worker.id),
        });
      }
      return calculateWorkshopAlerts(
        {
          orders,
          items: visibleItems,
          assignments,
          sessions,
          quotations,
          timeRequests,
          priceRequests,
          workers: workerDays,
          scheduleConfigured:
            Boolean(schedule?.weekly.length) || workerDays.some((day) => day.configured),
        },
        settings,
        actor,
        now,
        date,
        workOrderId,
      );
    },
  );
}

export async function getWorkOrderAlerts(
  id: number,
  userId: number,
): Promise<WorkshopAlertSummary> {
  if (!Number.isSafeInteger(id) || id <= 0) throw ApiError.badRequest('ID de orden inválido');
  return readAlerts(undefined, userId, id);
}
export async function getWorkshopAlerts(
  fecha: string | undefined,
  userId: number,
): Promise<WorkshopAlertSummary> {
  return readAlerts(fecha, userId);
}
