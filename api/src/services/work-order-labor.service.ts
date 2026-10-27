import { randomUUID } from 'node:crypto';
import path from 'node:path';

import {
  WORK_ORDER_OBSERVATION_FILE_MIME_TYPES,
  WORK_ORDER_OBSERVATION_MAX_FILES,
  WORK_ORDER_PRICE_SUGGESTION_SCOPES,
  type CreateWorkOrderObservationInput,
  type CreateWorkOrderPriceSuggestionInput,
  type ItemOperationalStatus,
  type ReviewWorkOrderPriceSuggestionInput,
  type Role as RoleName,
  type WorkOrderPriceSuggestionScope,
  type WorkOrderPriceSuggestionStatus,
} from '@unithor/shared';
import { Op, Transaction } from 'sequelize';

import { readStoredFile, removeStoredFile, storeFile } from './file-storage.service.js';
import { notifyUsers } from './notification.service.js';
import {
  minutesToHours,
  recordItemProgressEvent,
  roundHours,
  toDateOnly,
} from './work-order-labor-events.js';
import { closeSession, getSessionMinutes, getSessionMinutesInRange, recalculateItemHours } from './work-order-labor-sessions.js';
import {
  assertWorkOrderAccess,
  consumeCompletedPartStock,
  syncMirrorQuotationFromWorkOrder,
} from './work-order.service.js';
import { sequelize } from '../config/database.js';
import { CatalogItem } from '../models/CatalogItem.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { Vehicle } from '../models/Vehicle.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
import { WorkOrderItemProgressEvent } from '../models/WorkOrderItemProgressEvent.js';
import { WorkOrderItemSession } from '../models/WorkOrderItemSession.js';
import { WorkOrderObservation } from '../models/WorkOrderObservation.js';
import { WorkOrderObservationFile } from '../models/WorkOrderObservationFile.js';
import { WorkOrderPriceSuggestion } from '../models/WorkOrderPriceSuggestion.js';
import { WorkOrderProgressReport } from '../models/WorkOrderProgressReport.js';
import { ApiError } from '../utils/ApiError.js';

const SUPERVISOR_ROLES: RoleName[] = ['desarrollador', 'admin', 'jefe'];
const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

const toNumber = (value: number | string | null | undefined): number =>
  value === null || value === undefined ? 0 : Number(value);

const getActorRole = async (
  userId: number,
  transaction?: Transaction,
): Promise<RoleName> => {
  const user = await User.findByPk(userId, {
    attributes: ['id'],
    include: [{ model: Role, as: 'role', attributes: ['nombre'] }],
    transaction,
  });
  if (!user?.role) {
    throw ApiError.forbidden('El usuario no tiene un rol activo');
  }
  return user.role.nombre;
};

const assertSupervisor = async (userId: number, transaction?: Transaction): Promise<RoleName> => {
  const role = await getActorRole(userId, transaction);
  if (!SUPERVISOR_ROLES.includes(role)) {
    throw ApiError.forbidden('Esta acción requiere autorización del jefe de taller');
  }
  return role;
};

const assertEditable = (workOrder: WorkOrder): void => {
  if (workOrder.estado === 'entregada' || workOrder.estado === 'cancelada') {
    throw ApiError.badRequest('La orden de trabajo está cerrada');
  }
};

const assertItemAccess = (
  item: WorkOrderItem,
  workOrder: WorkOrder,
  role: RoleName,
  userId: number,
): void => {
  if (role !== 'mecanico') return;
  if (item.assignedUserId !== null && item.assignedUserId !== userId) {
    throw ApiError.forbidden('Este trabajo está asignado a otro mecánico');
  }
  if (item.assignedUserId === null && workOrder.assignedMechanicId !== userId) {
    throw ApiError.forbidden('Este trabajo no está asignado a ti');
  }
};

const findWorkOrderForLabor = async (
  workOrderId: number,
  transaction?: Transaction,
): Promise<WorkOrder> => {
  const workOrder = await WorkOrder.findByPk(workOrderId, {
    transaction,
    ...(transaction ? { lock: Transaction.LOCK.UPDATE } : {}),
  });
  if (!workOrder) {
    throw ApiError.notFound('Orden de trabajo no encontrada');
  }
  return workOrder;
};

const getLaborContext = async (
  workOrderId: number,
  userId: number,
  transaction?: Transaction,
): Promise<{ workOrder: WorkOrder; role: RoleName }> => {
  await assertWorkOrderAccess(workOrderId, userId, transaction);
  const [workOrder, role] = await Promise.all([
    findWorkOrderForLabor(workOrderId, transaction),
    getActorRole(userId, transaction),
  ]);
  if (role !== 'mecanico' && !SUPERVISOR_ROLES.includes(role)) {
    throw ApiError.forbidden('No tienes acceso a la ficha de taller');
  }
  return { workOrder, role };
};

const findItem = async (
  workOrderId: number,
  itemId: number,
  transaction?: Transaction,
  lock = false,
): Promise<WorkOrderItem> => {
  const item = await WorkOrderItem.findOne({
    where: { id: itemId, workOrderId },
    transaction,
    ...(lock ? { lock: Transaction.LOCK.UPDATE } : {}),
  });
  if (!item) {
    throw ApiError.notFound('Trabajo no encontrado en esta orden');
  }
  return item;
};

export interface WorksheetItem {
  id: number;
  descripcion: string;
  tipoLinea: string;
  unidadMedida: string;
  cantidad: number;
  estadoOperativo: ItemOperationalStatus;
  notasOperativas: string | null;
  horasHombreEstimadas: number | null;
  horasEstimadasTotales: number | null;
  horasHombreReales: number | null;
  excedeEstimado: boolean;
  assignedUser: { id: number; nombre: string } | null;
  laborValidatedAt: Date | null;
  laborValidationNote: string | null;
  activeSession: {
    id: number;
    userId: number | null;
    userName: string | null;
    startedAt: Date;
    elapsedMinutes: number;
    mine: boolean;
  } | null;
  totalMinutes: number;
  observationsCount: number;
}

export interface WorksheetObservationFile {
  id: number;
  nombreOriginal: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
}

export interface WorksheetObservation {
  id: number;
  texto: string | null;
  createdAt: Date;
  authorName: string | null;
  itemId: number | null;
  itemDescripcion: string | null;
  progressReportId: number | null;
  files: WorksheetObservationFile[];
}

export interface WorkOrderWorksheet {
  workOrder: {
    id: number;
    codigo: string;
    estado: string;
    fechaIngreso: Date | null;
    descripcion: string | null;
    vehiculo: {
      id: number | null;
      patente: string | null;
      marca: string | null;
      modelo: string | null;
    };
  };
  items: WorksheetItem[];
  servicios: WorksheetItem[];
  repuestos: WorksheetItem[];
  observations: WorksheetObservation[];
  progressReports: Array<{
    id: number;
    porcentaje: number;
    comentario: string;
    bloqueos: string | null;
    horasCerradas: number | null;
    createdAt: Date;
    mechanic: { id: number; nombre: string } | null;
  }>;
  activeItemId: number | null;
  totals: {
    items: number;
    completados: number;
    enProceso: number;
    pendientes: number;
    horasEstimadas: number;
    horasReales: number;
    minutosReales: number;
  };
  pausedOtherItems: number;
}

const buildObservations = (
  observations: WorkOrderObservation[],
  workOrderId: number,
): WorksheetObservation[] =>
  observations.map((observation) => ({
    id: observation.id,
    texto: observation.texto,
    createdAt: observation.createdAt,
    authorName: observation.authorName ?? observation.author?.nombre ?? null,
    itemId: observation.workOrderItemId,
    itemDescripcion: observation.item?.descripcion ?? null,
    progressReportId: observation.progressReportId,
    files: (observation.files ?? [])
      .slice()
      .sort((left, right) => left.id - right.id)
      .map((file) => ({
        id: file.id,
        nombreOriginal: file.nombreOriginal,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        url: `/api/work-orders/${workOrderId}/observations/${observation.id}/files/${file.id}`,
      })),
  }));

export const getWorkOrderWorksheet = async (
  workOrderId: number,
  userId: number,
  pausedOtherItems = 0,
): Promise<WorkOrderWorksheet> => {
  const { workOrder } = await getLaborContext(workOrderId, userId);
  const [vehicle, items, sessions, observations, progressReports] = await Promise.all([
    workOrder.vehicleId === null
      ? Promise.resolve(null)
      : Vehicle.findByPk(workOrder.vehicleId, {
          attributes: ['id', 'patente', 'marca', 'modelo'],
        }),
    WorkOrderItem.findAll({
      where: { workOrderId },
      include: [{ model: User, as: 'assignedUser', attributes: ['id', 'nombre'] }],
      order: [['id', 'ASC']],
    }),
    WorkOrderItemSession.findAll({
      where: { workOrderId },
      order: [['startedAt', 'DESC']],
    }),
    WorkOrderObservation.findAll({
      where: { workOrderId },
      include: [
        { model: WorkOrderObservationFile, as: 'files' },
        { model: User, as: 'author', attributes: ['id', 'nombre'] },
        { model: WorkOrderItem, as: 'item', attributes: ['id', 'descripcion'] },
      ],
      order: [['createdAt', 'DESC']],
    }),
    WorkOrderProgressReport.findAll({
      where: { workOrderId },
      include: [{ model: User, as: 'mechanic', attributes: ['id', 'nombre'] }],
      order: [['createdAt', 'DESC']],
    }),
  ]);

  const now = new Date();
  const sessionsByItem = new Map<number, WorkOrderItemSession[]>();
  for (const session of sessions) {
    const list = sessionsByItem.get(session.workOrderItemId) ?? [];
    list.push(session);
    sessionsByItem.set(session.workOrderItemId, list);
  }

  const observationsByItem = new Map<number, number>();
  for (const observation of observations) {
    if (observation.workOrderItemId === null) continue;
    observationsByItem.set(
      observation.workOrderItemId,
      (observationsByItem.get(observation.workOrderItemId) ?? 0) + 1,
    );
  }

  const visibleItems = items;

  const itemDtos: WorksheetItem[] = visibleItems.map((item) => {
    const itemSessions = sessionsByItem.get(item.id) ?? [];
    const activeSession = itemSessions.find((session) => session.status === 'abierta') ?? null;
    const totalMinutes = itemSessions.reduce(
      (sum, session) => sum + getSessionMinutes(session, now),
      0,
    );
    const horasHombreEstimadas =
      item.horasHombreEstimadas === null ? null : toNumber(item.horasHombreEstimadas);
    const cantidad = toNumber(item.cantidad);
    const horasEstimadasTotales =
      horasHombreEstimadas === null ? null : roundHours(horasHombreEstimadas * cantidad);
    const horasHombreReales =
      item.horasHombreReales === null ? null : toNumber(item.horasHombreReales);

    return {
      id: item.id,
      descripcion: item.descripcion,
      tipoLinea: item.tipoLinea,
      unidadMedida: item.unidadMedida,
      cantidad,
      estadoOperativo: item.estadoOperativo,
      notasOperativas: item.notasOperativas,
      horasHombreEstimadas,
      horasEstimadasTotales,
      horasHombreReales,
      excedeEstimado:
        horasEstimadasTotales !== null &&
        horasEstimadasTotales > 0 &&
        horasHombreReales !== null &&
        horasHombreReales > horasEstimadasTotales,
      assignedUser: item.assignedUser
        ? { id: item.assignedUser.id, nombre: item.assignedUser.nombre }
        : null,
      laborValidatedAt: item.laborValidatedAt,
      laborValidationNote: item.laborValidationNote,
      activeSession: activeSession
        ? {
            id: activeSession.id,
            userId: activeSession.userId,
            userName: activeSession.userName,
            startedAt: activeSession.startedAt,
            elapsedMinutes: getSessionMinutes(activeSession, now),
            mine: activeSession.userId === userId,
          }
        : null,
      totalMinutes,
      observationsCount: observationsByItem.get(item.id) ?? 0,
    };
  });

  const servicios = itemDtos.filter((item) => item.tipoLinea !== 'parte');
  const repuestos = itemDtos.filter((item) => item.tipoLinea === 'parte');
  const activeItemId =
    itemDtos.find((item) => item.activeSession?.mine)?.id ??
    itemDtos.find((item) => item.activeSession)?.id ??
    null;

  return {
    workOrder: {
      id: workOrder.id,
      codigo: workOrder.codigo,
      estado: workOrder.estado,
      fechaIngreso: workOrder.fechaIngreso,
      descripcion: workOrder.descripcion,
      vehiculo: {
        id: vehicle?.id ?? null,
        patente: vehicle?.patente ?? null,
        marca: vehicle?.marca ?? null,
        modelo: vehicle?.modelo ?? null,
      },
    },
    items: itemDtos,
    servicios,
    repuestos,
    observations: buildObservations(observations, workOrderId),
    progressReports: progressReports.map((report) => ({
      id: report.id,
      porcentaje: report.porcentaje,
      comentario: report.comentario,
      bloqueos: report.bloqueos,
      horasCerradas:
        report.horasCerradas === null || report.horasCerradas === undefined
          ? null
          : toNumber(report.horasCerradas),
      createdAt: report.createdAt,
      mechanic: report.mechanic
        ? { id: report.mechanic.id, nombre: report.mechanic.nombre }
        : null,
    })),
    activeItemId,
    totals: {
      items: itemDtos.length,
      completados: itemDtos.filter((item) => item.estadoOperativo === 'completado').length,
      enProceso: itemDtos.filter((item) => item.estadoOperativo === 'en_proceso').length,
      pendientes: itemDtos.filter((item) => item.estadoOperativo === 'pendiente').length,
      horasEstimadas: roundHours(
        itemDtos.reduce((sum, item) => sum + (item.horasEstimadasTotales ?? 0), 0),
      ),
      horasReales: roundHours(
        itemDtos.reduce((sum, item) => sum + (item.horasHombreReales ?? 0), 0),
      ),
      minutosReales: itemDtos.reduce((sum, item) => sum + item.totalMinutes, 0),
    },
    pausedOtherItems,
  };
};

export interface MyLaborOrder {
  id: number;
  codigo: string;
  estado: string;
  fechaIngreso: Date | null;
  patente: string | null;
  marca: string | null;
  modelo: string | null;
  items: number;
  completados: number;
  enProceso: number;
  horasEstimadas: number;
  horasReales: number;
  activeItemId: number | null;
  activeItemDescripcion: string | null;
  activeSince: Date | null;
}

export const listMyLaborWorkOrders = async (userId: number): Promise<MyLaborOrder[]> => {
  const role = await getActorRole(userId);
  if (!SUPERVISOR_ROLES.includes(role) && role !== 'mecanico') {
    throw ApiError.forbidden('No tienes acceso a la ficha de taller');
  }

  const assignedItemOrders = await WorkOrderItem.findAll({
    attributes: ['workOrderId'],
    where: { assignedUserId: userId },
    group: ['workOrderId'],
    raw: true,
  });
  const orderIds = assignedItemOrders.map((item) => item.workOrderId);

  const orders = await WorkOrder.findAll({
    where: {
      [Op.or]: [{ assignedMechanicId: userId }, { id: { [Op.in]: orderIds } }],
      estado: { [Op.notIn]: ['entregada', 'cancelada'] },
    },
    include: [
      { model: Vehicle, as: 'vehicle', attributes: ['id', 'patente', 'marca', 'modelo'] },
      {
        model: WorkOrderItem,
        as: 'items',
        attributes: [
          'id',
          'descripcion',
          'cantidad',
          'tipoLinea',
          'estadoOperativo',
          'horasHombreEstimadas',
          'horasHombreReales',
        ],
      },
    ],
    order: [['createdAt', 'DESC']],
  });

  const openSessions = await WorkOrderItemSession.findAll({
    where: { userId, status: 'abierta' },
    order: [['startedAt', 'DESC']],
  });
  const openByOrder = new Map(openSessions.map((session) => [session.workOrderId, session]));

  return orders.map((order) => {
    const items = order.items ?? [];
    const session = openByOrder.get(order.id) ?? null;
    const activeItem = session
      ? items.find((item) => item.id === session.workOrderItemId) ?? null
      : null;
    return {
      id: order.id,
      codigo: order.codigo,
      estado: order.estado,
      fechaIngreso: order.fechaIngreso,
      patente: order.vehicle?.patente ?? null,
      marca: order.vehicle?.marca ?? null,
      modelo: order.vehicle?.modelo ?? null,
      items: items.length,
      completados: items.filter((item) => item.estadoOperativo === 'completado').length,
      enProceso: items.filter((item) => item.estadoOperativo === 'en_proceso').length,
      horasEstimadas: roundHours(
        items.reduce(
          (sum, item) =>
            sum +
            (item.horasHombreEstimadas === null
              ? 0
              : toNumber(item.horasHombreEstimadas) * toNumber(item.cantidad)),
          0,
        ),
      ),
      horasReales: roundHours(
        items.reduce(
          (sum, item) =>
            sum + (item.horasHombreReales === null ? 0 : toNumber(item.horasHombreReales)),
          0,
        ),
      ),
      activeItemId: activeItem?.id ?? null,
      activeItemDescripcion: activeItem?.descripcion ?? null,
      activeSince: session?.startedAt ?? null,
    };
  });
};

export const startItemTimer = async (
  workOrderId: number,
  itemId: number,
  userId: number,
): Promise<WorkOrderWorksheet> => {
  const pausedOtherItems = await sequelize.transaction(async (transaction) => {
    const { workOrder, role } = await getLaborContext(workOrderId, userId, transaction);
    assertEditable(workOrder);
    const item = await findItem(workOrderId, itemId, transaction, true);
    assertItemAccess(item, workOrder, role, userId);

    const openItemSession = await WorkOrderItemSession.findOne({
      where: { workOrderItemId: item.id, status: 'abierta' },
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });
    if (openItemSession) {
      if (openItemSession.userId === userId) return 0;
      throw ApiError.badRequest('Otro mecánico tiene este trabajo en curso');
    }

    let paused = 0;
    const otherSessions = await WorkOrderItemSession.findAll({
      where: { userId, status: 'abierta' },
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });
    for (const other of otherSessions) {
      await closeSession(other, 'pausa', transaction);
      const otherItem = await WorkOrderItem.findByPk(other.workOrderItemId, { transaction });
      if (otherItem) await recalculateItemHours(otherItem, transaction);
      paused += 1;
    }

    const session = await WorkOrderItemSession.create(
      {
        workOrderId,
        workOrderItemId: item.id,
        userId,
        userName: (await User.findByPk(userId, { attributes: ['nombre'], transaction }))?.nombre ?? null,
        kind: 'cronometro',
        status: 'abierta',
        startedAt: new Date(),
        endedAt: null,
        durationMinutes: null,
        closeReason: null,
        note: null,
        createdBy: userId,
      },
      { transaction },
    );

    const previousStatus = item.estadoOperativo;
    await item.update(
      {
        estadoOperativo: 'en_proceso',
        assignedUserId: item.assignedUserId ?? userId,
      },
      { transaction },
    );

    if (previousStatus !== 'en_proceso') {
      await recordItemProgressEvent(
        {
          workOrderId,
          workOrderItemId: item.id,
          itemDescripcion: item.descripcion,
          fromStatus: previousStatus,
          toStatus: 'en_proceso',
          performedByUserId: userId,
          assignedUserId: item.assignedUserId ?? userId,
          horasEstimadas:
            item.horasHombreEstimadas === null
              ? null
              : toNumber(item.horasHombreEstimadas) * toNumber(item.cantidad),
          horasReales:
            item.horasHombreReales === null ? null : toNumber(item.horasHombreReales),
          sessionId: session.id,
          source: 'check',
        },
        transaction,
      );
    }
    await syncMirrorQuotationFromWorkOrder(workOrderId, transaction, true);
    return paused;
  });

  return getWorkOrderWorksheet(workOrderId, userId, pausedOtherItems);
};

export const pauseItemTimer = async (
  workOrderId: number,
  itemId: number,
  userId: number,
): Promise<WorkOrderWorksheet> => {
  await sequelize.transaction(async (transaction) => {
    const { workOrder, role } = await getLaborContext(workOrderId, userId, transaction);
    assertEditable(workOrder);
    const item = await findItem(workOrderId, itemId, transaction, true);
    assertItemAccess(item, workOrder, role, userId);

    const session = await WorkOrderItemSession.findOne({
      where: { workOrderItemId: item.id, status: 'abierta' },
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });
    if (!session) return;
    if (session.userId !== null && session.userId !== userId && role === 'mecanico') {
      throw ApiError.forbidden('Solo quien inició el cronómetro puede pausarlo');
    }

    await closeSession(session, 'pausa', transaction);
    await recalculateItemHours(item, transaction);
  });

  return getWorkOrderWorksheet(workOrderId, userId);
};

export const completeItemTimer = async (
  workOrderId: number,
  itemId: number,
  userId: number,
  notasOperativas?: string | null,
): Promise<WorkOrderWorksheet> => {
  await sequelize.transaction(async (transaction) => {
    const { workOrder, role } = await getLaborContext(workOrderId, userId, transaction);
    assertEditable(workOrder);
    const item = await findItem(workOrderId, itemId, transaction, true);
    assertItemAccess(item, workOrder, role, userId);

    const session = await WorkOrderItemSession.findOne({
      where: { workOrderItemId: item.id, status: 'abierta' },
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });
    if (session) {
      if (session.userId !== null && session.userId !== userId && role === 'mecanico') {
        throw ApiError.forbidden('Solo quien inició el cronómetro puede completarlo');
      }
      await closeSession(session, 'completado', transaction);
    }

    const previousStatus = item.estadoOperativo;
    await item.update(
      {
        estadoOperativo: 'completado',
        notasOperativas:
          notasOperativas === undefined ? item.notasOperativas : notasOperativas,
        laborValidatedBy: null,
        laborValidatedAt: null,
        laborValidationNote: null,
      },
      { transaction },
    );
    const horasReales = await recalculateItemHours(item, transaction);
    await consumeCompletedPartStock([item], transaction, {
      userId,
      referencia: workOrder.codigo,
    });

    await recordItemProgressEvent(
      {
        workOrderId,
        workOrderItemId: item.id,
        itemDescripcion: item.descripcion,
        fromStatus: previousStatus,
        toStatus: 'completado',
        performedByUserId: userId,
        assignedUserId: item.assignedUserId,
        horasEstimadas:
          item.horasHombreEstimadas === null
            ? null
            : toNumber(item.horasHombreEstimadas) * toNumber(item.cantidad),
        horasReales,
        sessionId: session?.id ?? null,
        source: 'check',
      },
      transaction,
    );
    await syncMirrorQuotationFromWorkOrder(workOrderId, transaction, true);
  });

  return getWorkOrderWorksheet(workOrderId, userId);
};

export const assignWorkOrderItem = async (
  workOrderId: number,
  itemId: number,
  assignedUserId: number | null,
  actorUserId: number,
): Promise<WorkOrderWorksheet> => {
  await sequelize.transaction(async (transaction) => {
    await assertSupervisor(actorUserId, transaction);
    const workOrder = await findWorkOrderForLabor(workOrderId, transaction);
    assertEditable(workOrder);
    const item = await findItem(workOrderId, itemId, transaction, true);

    if (assignedUserId !== null) {
      const assignee = await User.findOne({
        where: { id: assignedUserId, activo: true },
        include: [{ model: Role, as: 'role', attributes: ['nombre'] }],
        transaction,
      });
      if (!assignee) {
        throw ApiError.badRequest('El responsable seleccionado no existe o no está activo');
      }
      if (assignee.id !== actorUserId) {
        await notifyUsers(
          [assignee.id],
          {
            tipo: 'mecanico_asignado',
            titulo: `Te asignaron un trabajo en ${workOrder.codigo}`,
            mensaje: `${item.descripcion} quedó a tu cargo en el taller.`,
            href: `/work-orders/${workOrderId}/ficha`,
            workOrderId,
            actorId: actorUserId,
          },
          transaction,
        );
      }
    }

    await item.update({ assignedUserId }, { transaction });
  });

  return getWorkOrderWorksheet(workOrderId, actorUserId);
};

export const updateItemEstimate = async (
  workOrderId: number,
  itemId: number,
  horasHombreEstimadas: number | null,
  actorUserId: number,
): Promise<WorkOrderWorksheet> => {
  await sequelize.transaction(async (transaction) => {
    await assertSupervisor(actorUserId, transaction);
    const workOrder = await findWorkOrderForLabor(workOrderId, transaction);
    assertEditable(workOrder);
    const item = await findItem(workOrderId, itemId, transaction, true);
    const previous = item.horasHombreEstimadas;
    await item.update({ horasHombreEstimadas }, { transaction });

    await recordItemProgressEvent(
      {
        workOrderId,
        workOrderItemId: item.id,
        itemDescripcion: item.descripcion,
        fromStatus: item.estadoOperativo,
        toStatus: item.estadoOperativo,
        performedByUserId: actorUserId,
        assignedUserId: item.assignedUserId,
        horasEstimadas:
          horasHombreEstimadas === null
            ? null
            : roundHours(horasHombreEstimadas * toNumber(item.cantidad)),
        horasReales:
          item.horasHombreReales === null ? null : toNumber(item.horasHombreReales),
        source: 'ajuste',
        note:
          previous === null
            ? 'Tiempo estimado definido'
            : 'Tiempo estimado actualizado',
      },
      transaction,
    );
  });

  return getWorkOrderWorksheet(workOrderId, actorUserId);
};

export const adjustItemHours = async (
  workOrderId: number,
  itemId: number,
  minutos: number,
  motivo: string,
  actorUserId: number,
): Promise<WorkOrderWorksheet> => {
  await sequelize.transaction(async (transaction) => {
    await assertSupervisor(actorUserId, transaction);
    const workOrder = await findWorkOrderForLabor(workOrderId, transaction);
    assertEditable(workOrder);
    const item = await findItem(workOrderId, itemId, transaction, true);
    if (item.estadoOperativo !== 'completado' && item.horasHombreReales === null) {
      throw ApiError.badRequest(
        'Solo se pueden ajustar horas de un trabajo completado o con horas registradas',
      );
    }

    const now = new Date();
    await WorkOrderItemSession.create(
      {
        workOrderId,
        workOrderItemId: item.id,
        userId: actorUserId,
        userName: (await User.findByPk(actorUserId, { attributes: ['nombre'], transaction }))?.nombre ?? null,
        kind: 'ajuste',
        status: 'cerrada',
        startedAt: now,
        endedAt: now,
        durationMinutes: minutos,
        closeReason: 'cierre_manual',
        note: motivo,
        createdBy: actorUserId,
      },
      { transaction },
    );
    const horasReales = await recalculateItemHours(item, transaction);

    await recordItemProgressEvent(
      {
        workOrderId,
        workOrderItemId: item.id,
        itemDescripcion: item.descripcion,
        fromStatus: item.estadoOperativo,
        toStatus: item.estadoOperativo,
        performedByUserId: actorUserId,
        assignedUserId: item.assignedUserId,
        horasEstimadas:
          item.horasHombreEstimadas === null
            ? null
            : roundHours(toNumber(item.horasHombreEstimadas) * toNumber(item.cantidad)),
        horasReales,
        horasDelta: roundHours(minutos / 60),
        source: 'ajuste',
        note: motivo,
      },
      transaction,
    );
  });

  return getWorkOrderWorksheet(workOrderId, actorUserId);
};

export const validateItemHours = async (
  workOrderId: number,
  itemId: number,
  comentario: string | null | undefined,
  actorUserId: number,
): Promise<WorkOrderWorksheet> => {
  await sequelize.transaction(async (transaction) => {
    await assertSupervisor(actorUserId, transaction);
    const item = await findItem(workOrderId, itemId, transaction, true);
    if (item.horasHombreReales === null) {
      throw ApiError.badRequest('El trabajo aún no tiene horas reales registradas');
    }

    await item.update(
      {
        laborValidatedBy: actorUserId,
        laborValidatedAt: new Date(),
        laborValidationNote: comentario ?? null,
      },
      { transaction },
    );
  });

  return getWorkOrderWorksheet(workOrderId, actorUserId);
};

const assertObservationFiles = (files: Express.Multer.File[]): void => {
  if (files.length > WORK_ORDER_OBSERVATION_MAX_FILES) {
    throw ApiError.badRequest(
      `Cada observación admite hasta ${WORK_ORDER_OBSERVATION_MAX_FILES} archivos`,
    );
  }
  for (const file of files) {
    if (!(WORK_ORDER_OBSERVATION_FILE_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      throw ApiError.badRequest('Formato de archivo no permitido');
    }
    if (file.size <= 0) {
      throw ApiError.badRequest('El archivo adjunto está vacío');
    }
  }
};

export const createObservation = async (
  workOrderId: number,
  data: CreateWorkOrderObservationInput,
  files: Express.Multer.File[],
  userId: number,
): Promise<WorkOrderWorksheet> => {
  assertObservationFiles(files);
  const texto = data.texto?.trim() ? data.texto.trim() : null;
  if (!texto && files.length === 0) {
    throw ApiError.badRequest('La observación debe incluir un texto o al menos un archivo');
  }

  const storedKeys: string[] = [];
  try {
    await sequelize.transaction(async (transaction) => {
      const { workOrder, role } = await getLaborContext(workOrderId, userId, transaction);
      assertEditable(workOrder);

      if (data.workOrderItemId !== undefined && data.workOrderItemId !== null) {
        const item = await findItem(workOrderId, data.workOrderItemId, transaction);
        assertItemAccess(item, workOrder, role, userId);
      }
      if (data.progressReportId !== undefined && data.progressReportId !== null) {
        const report = await WorkOrderProgressReport.count({
          where: { id: data.progressReportId, workOrderId },
          transaction,
        });
        if (report === 0) {
          throw ApiError.badRequest('El reporte de avance no pertenece a esta orden');
        }
      }

      const author = await User.findByPk(userId, { attributes: ['nombre'], transaction });
      const observation = await WorkOrderObservation.create(
        {
          workOrderId,
          workOrderItemId: data.workOrderItemId ?? null,
          progressReportId: data.progressReportId ?? null,
          authorId: userId,
          authorName: author?.nombre ?? null,
          texto,
        },
        { transaction },
      );

      for (const file of files) {
        const extension = MIME_EXTENSIONS[file.mimetype] ?? 'bin';
        const storageKey = path.posix.join(
          'work-orders',
          String(workOrderId),
          'observations',
          `${randomUUID()}.${extension}`,
        );
        await storeFile(storageKey, file.buffer, file.mimetype);
        storedKeys.push(storageKey);
        await WorkOrderObservationFile.create(
          {
            observationId: observation.id,
            storageKey,
            nombreOriginal: file.originalname.slice(0, 255) || `adjunto.${extension}`,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            uploadedBy: userId,
          },
          { transaction },
        );
      }
    });
  } catch (error) {
    await Promise.all(storedKeys.map((key) => removeStoredFile(key, false)));
    throw error;
  }

  return getWorkOrderWorksheet(workOrderId, userId);
};

export interface ObservationFileDownload {
  nombreOriginal: string;
  mimeType: string;
  bytes: Buffer;
}

export const getObservationFile = async (
  workOrderId: number,
  observationId: number,
  fileId: number,
  userId: number,
): Promise<ObservationFileDownload> => {
  await getLaborContext(workOrderId, userId);
  const file = await WorkOrderObservationFile.findOne({
    where: { id: fileId, observationId },
    include: [
      {
        model: WorkOrderObservation,
        as: 'observation',
        attributes: ['id', 'workOrderId'],
        where: { workOrderId },
        required: true,
      },
    ],
  });
  if (!file) {
    throw ApiError.notFound('Archivo de observación no encontrado');
  }
  return {
    nombreOriginal: file.nombreOriginal,
    mimeType: file.mimeType,
    bytes: await readStoredFile(file.storageKey, 'Archivo de observación no encontrado'),
  };
};

export interface PriceSuggestionPublic {
  id: number;
  workOrderId: number;
  workOrderItemId: number | null;
  itemDescripcion: string | null;
  horasEstimadas: number | null;
  horasReales: number | null;
  precioActualOt: number | null;
  precioActualCatalogo: number | null;
  precioSugerido: number;
  alcance: WorkOrderPriceSuggestionScope;
  motivo: string;
  estado: WorkOrderPriceSuggestionStatus;
  createdByName: string | null;
  reviewNote: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

const toPriceSuggestionPublic = (
  suggestion: WorkOrderPriceSuggestion,
): PriceSuggestionPublic => ({
  id: suggestion.id,
  workOrderId: suggestion.workOrderId,
  workOrderItemId: suggestion.workOrderItemId,
  itemDescripcion: suggestion.item?.descripcion ?? null,
  horasEstimadas:
    suggestion.horasEstimadas === null ? null : toNumber(suggestion.horasEstimadas),
  horasReales: suggestion.horasReales === null ? null : toNumber(suggestion.horasReales),
  precioActualOt:
    suggestion.precioActualOt === null ? null : toNumber(suggestion.precioActualOt),
  precioActualCatalogo:
    suggestion.precioActualCatalogo === null
      ? null
      : toNumber(suggestion.precioActualCatalogo),
  precioSugerido: toNumber(suggestion.precioSugerido),
  alcance: suggestion.alcance,
  motivo: suggestion.motivo,
  estado: suggestion.estado,
  createdByName: suggestion.createdByName ?? suggestion.creator?.nombre ?? null,
  reviewNote: suggestion.reviewNote,
  reviewedAt: suggestion.reviewedAt,
  createdAt: suggestion.createdAt,
});

export const listPriceSuggestions = async (
  workOrderId: number,
  userId: number,
): Promise<PriceSuggestionPublic[]> => {
  await assertSupervisor(userId);
  const suggestions = await WorkOrderPriceSuggestion.findAll({
    where: { workOrderId },
    include: [
      { model: WorkOrderItem, as: 'item', attributes: ['id', 'descripcion'] },
      { model: User, as: 'creator', attributes: ['id', 'nombre'] },
      { model: User, as: 'reviewer', attributes: ['id', 'nombre'] },
    ],
    order: [['createdAt', 'DESC']],
  });
  return suggestions.map(toPriceSuggestionPublic);
};

export const createPriceSuggestion = async (
  workOrderId: number,
  data: CreateWorkOrderPriceSuggestionInput,
  userId: number,
): Promise<PriceSuggestionPublic> => {
  const created = await sequelize.transaction(async (transaction) => {
    await assertSupervisor(userId, transaction);
    const workOrder = await findWorkOrderForLabor(workOrderId, transaction);
    assertEditable(workOrder);
    const item = await findItem(workOrderId, data.workOrderItemId, transaction, true);
    const catalogItem =
      item.catalogItemId === null
        ? null
        : await CatalogItem.findByPk(item.catalogItemId, { transaction });
    const creator = await User.findByPk(userId, { attributes: ['nombre'], transaction });

    if (!WORK_ORDER_PRICE_SUGGESTION_SCOPES.includes(data.alcance)) {
      throw ApiError.badRequest('Alcance de la sugerencia inválido');
    }

    return WorkOrderPriceSuggestion.create(
      {
        workOrderId,
        workOrderItemId: item.id,
        catalogItemId: item.catalogItemId,
        createdBy: userId,
        createdByName: creator?.nombre ?? null,
        horasEstimadas:
          item.horasHombreEstimadas === null
            ? null
            : roundHours(toNumber(item.horasHombreEstimadas) * toNumber(item.cantidad)),
        horasReales:
          item.horasHombreReales === null ? null : toNumber(item.horasHombreReales),
        precioActualOt: toNumber(item.precioUnitario),
        precioActualCatalogo: catalogItem ? toNumber(catalogItem.precio) : null,
        precioSugerido: data.precioSugerido,
        alcance: data.alcance,
        motivo: data.motivo,
        estado: 'pendiente',
        reviewedBy: null,
        reviewNote: null,
        reviewedAt: null,
      },
      { transaction },
    );
  });

  return toPriceSuggestionPublic(created);
};

export const reviewPriceSuggestion = async (
  workOrderId: number,
  suggestionId: number,
  data: ReviewWorkOrderPriceSuggestionInput,
  userId: number,
): Promise<PriceSuggestionPublic> => {
  const updated = await sequelize.transaction(async (transaction) => {
    const role = await getActorRole(userId, transaction);
    if (role !== 'admin' && role !== 'desarrollador') {
      throw ApiError.forbidden('Solo administración puede aprobar sugerencias de precio');
    }
    const suggestion = await WorkOrderPriceSuggestion.findOne({
      where: { id: suggestionId, workOrderId },
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });
    if (!suggestion) {
      throw ApiError.notFound('Sugerencia de precio no encontrada');
    }
    if (suggestion.estado !== 'pendiente') {
      throw ApiError.badRequest('La sugerencia ya fue revisada');
    }

    if (data.decision === 'aprobar') {
      const applyToOrder = suggestion.alcance === 'ot' || suggestion.alcance === 'ambos';
      const applyToCatalog =
        (suggestion.alcance === 'catalogo' || suggestion.alcance === 'ambos') &&
        suggestion.catalogItemId !== null;

      if (applyToOrder && suggestion.workOrderItemId !== null) {
        const item = await WorkOrderItem.findOne({
          where: { id: suggestion.workOrderItemId, workOrderId },
          transaction,
          lock: Transaction.LOCK.UPDATE,
        });
        if (item) {
          const precio = toNumber(suggestion.precioSugerido);
          await item.update(
            { precioUnitario: precio, subtotal: roundHours(precio * toNumber(item.cantidad)) },
            { transaction },
          );
        }
      }
      if (applyToCatalog && suggestion.catalogItemId !== null) {
        const catalogItem = await CatalogItem.findByPk(suggestion.catalogItemId, { transaction });
        if (catalogItem) {
          await catalogItem.update(
            { precio: toNumber(suggestion.precioSugerido) },
            { transaction },
          );
        }
      }

      await syncMirrorQuotationFromWorkOrder(workOrderId, transaction);    }

    await suggestion.update(
      {
        estado: data.decision === 'aprobar' ? 'aprobada' : 'rechazada',
        reviewedBy: userId,
        reviewNote: data.comentario ?? null,
        reviewedAt: new Date(),
      },
      { transaction },
    );

    return suggestion;
  });

  return toPriceSuggestionPublic(updated);
};

export interface DailyReportUser {
  id: number;
  nombre: string;
  rol: string;
  minutos: number;
  horas: number;
  sesiones: number;
  itemsCompletados: number;
  eventos: number;
  enCurso: boolean;
  detalle: Array<{
    workOrderId: number;
    workOrderCodigo: string;
    itemDescripcion: string;
    minutos: number;
    estado: string;
  }>;
}

export interface DailyReportOrder {
  id: number;
  codigo: string;
  patente: string | null;
  estado: string;
  horas: number;
  completados: number;
  enProceso: number;
  mecanicos: string[];
}

export interface WorkshopDailyReport {
  fecha: string;
  generadoEn: Date;
  totalHoras: number;
  totalItemsCompletados: number;
  totalSesiones: number;
  usuarios: DailyReportUser[];
  ordenes: DailyReportOrder[];
}

export const getWorkshopDailyReport = async (
  fecha: string | undefined,
  userId: number,
): Promise<WorkshopDailyReport> => {
  await assertSupervisor(userId);
  const day = fecha ?? toDateOnly();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw ApiError.badRequest('La fecha debe tener formato YYYY-MM-DD');
  }
  const dayStart = new Date(`${day}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const now = new Date();

  const users = await User.findAll({
    where: { activo: true },
    include: [{ model: Role, as: 'role', attributes: ['nombre'], required: true }],
    order: [['nombre', 'ASC']],
  });
  const trackedUsers = users.filter((user) =>
    ['mecanico', 'jefe'].includes(user.role?.nombre ?? ''),
  );
  const trackedIds = trackedUsers.map((user) => user.id);

  const [sessions, events, orders] = await Promise.all([
    WorkOrderItemSession.findAll({
      where: {
        userId: { [Op.in]: trackedIds.length > 0 ? trackedIds : [-1] },
        startedAt: { [Op.lt]: dayEnd },
        [Op.or]: [{ endedAt: { [Op.gt]: dayStart } }, ...(now > dayStart ? [{ status: 'abierta' as const }] : []),
          { kind: 'ajuste', startedAt: { [Op.gte]: dayStart } }],
      },
      include: [
        { model: WorkOrder, as: 'workOrder', attributes: ['id', 'codigo'] },
        { model: WorkOrderItem, as: 'item', attributes: ['id', 'descripcion'] },
      ],
      order: [['startedAt', 'ASC']],
    }),
    WorkOrderItemProgressEvent.findAll({
      where: {
        fechaEfectiva: day,
        performedByUserId: { [Op.in]: trackedIds.length > 0 ? trackedIds : [-1] },
      },
      order: [['createdAt', 'ASC']],
    }),
    WorkOrder.findAll({
      include: [
        { model: Vehicle, as: 'vehicle', attributes: ['id', 'patente'] },
        {
          model: WorkOrderItem,
          as: 'items',
          attributes: ['id', 'descripcion', 'estadoOperativo', 'horasHombreReales'],
        },
      ],
      order: [['updatedAt', 'DESC']],
    }),
  ]);

  const orderIdsWithActivity = new Set<number>();
  const usersById = new Map(trackedUsers.map((user) => [user.id, user]));
  const reportUsers = new Map<number, DailyReportUser>();
  for (const user of trackedUsers) {
    reportUsers.set(user.id, {
      id: user.id,
      nombre: user.nombre,
      rol: user.role?.nombre ?? '',
      minutos: 0,
      horas: 0,
      sesiones: 0,
      itemsCompletados: 0,
      eventos: 0,
      enCurso: false,
      detalle: [],
    });
  }

  for (const session of sessions) {
    if (session.userId === null) continue;
    const entry = reportUsers.get(session.userId);
    if (!entry) continue;
    const minutes = getSessionMinutesInRange(session, dayStart, dayEnd, now);
    entry.minutos += minutes;
    entry.sesiones += 1;
    if (session.status === 'abierta' && now >= dayStart && now < dayEnd) entry.enCurso = true;
    if (session.workOrderId) orderIdsWithActivity.add(session.workOrderId);
    entry.detalle.push({
      workOrderId: session.workOrderId,
      workOrderCodigo: session.workOrder?.codigo ?? `OT ${session.workOrderId}`,
      itemDescripcion: session.item?.descripcion ?? 'Trabajo eliminado',
      minutos: minutes,
      estado: session.status,
    });
  }

  for (const event of events) {
    if (event.performedByUserId === null) continue;
    const entry = reportUsers.get(event.performedByUserId);
    if (!entry) continue;
    entry.eventos += 1;
    if (event.toStatus === 'completado' && event.fromStatus !== 'completado') {
      entry.itemsCompletados += 1;
    }
    orderIdsWithActivity.add(event.workOrderId);
  }

  for (const entry of reportUsers.values()) {
    entry.horas = minutesToHours(entry.minutos);
  }

  const orderReports: DailyReportOrder[] = orders
    .filter((order) => orderIdsWithActivity.has(order.id))
    .map((order) => {
      const orderSessions = sessions.filter((session) => session.workOrderId === order.id);
      const orderEvents = events.filter((event) => event.workOrderId === order.id);
      const mechanics = [
        ...new Set(
          orderSessions
            .map((session) => session.userName ?? (session.userId ? usersById.get(session.userId)?.nombre : null))
            .filter((name): name is string => Boolean(name)),
        ),
      ];
      return {
        id: order.id,
        codigo: order.codigo,
        patente: order.vehicle?.patente ?? null,
        estado: order.estado,
        horas: minutesToHours(
          orderSessions.reduce((sum, session) => sum + getSessionMinutesInRange(session, dayStart, dayEnd, now), 0),
        ),
        completados: orderEvents.filter(
          (event) => event.toStatus === 'completado' && event.fromStatus !== 'completado',
        ).length,
        enProceso: orderEvents.filter((event) => event.toStatus === 'en_proceso').length,
        mecanicos: mechanics,
      };
    });

  return {
    fecha: day,
    generadoEn: new Date(),
    totalHoras: roundHours(
      [...reportUsers.values()].reduce((sum, entry) => sum + entry.horas, 0),
    ),
    totalItemsCompletados: [...reportUsers.values()].reduce(
      (sum, entry) => sum + entry.itemsCompletados,
      0,
    ),
    totalSesiones: sessions.length,
    usuarios: [...reportUsers.values()],
    ordenes: orderReports,
  };
};
