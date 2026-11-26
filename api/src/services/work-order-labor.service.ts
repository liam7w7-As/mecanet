import { randomUUID } from 'node:crypto';
import path from 'node:path';

import {
  WORK_ORDER_OBSERVATION_FILE_MIME_TYPES,
  WORK_ORDER_OBSERVATION_MAX_FILES,
  pauseWorkshopTimerSchema,
  type CreateWorkOrderObservationInput,
  type ItemOperationalStatus,
  type Role as RoleName,
} from '@unithor/shared';
import { Op, Transaction } from 'sequelize';

import { enqueueWorkOrderProgress } from './customer-email-queue.service.js';
import { readStoredFile, removeStoredFile, storeFile } from './file-storage.service.js';
import {
  minutesToHours,
  recordItemProgressEvent,
  roundHours,
  toDateOnly,
} from './work-order-labor-events.js';
import { closeSession, getSessionMinutes, getSessionMinutesInRange, recalculateItemHours } from './work-order-labor-sessions.js';
import { invalidateItemQuality } from './work-order-quality-state.js';
import { isAssignedToItem, getAssignedOrderIds } from './work-order-team-access.js';
import { replaceItemTeam } from './work-order-team.service.js';
import {
  assertWorkOrderAccess,
  consumeCompletedPartStock,
  syncMirrorQuotationFromWorkOrder,
} from './work-order.service.js';
import { getWorkerShift, getWorkshopDayRange } from './workshop-personnel.service.js';
import { settleExpiredLaborSessions } from './workshop-shift-worker.service.js';
import { withWorkshopTransaction } from './workshop-transaction.js';
import { CatalogItem } from '../models/CatalogItem.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { Vehicle } from '../models/Vehicle.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderDpStage } from '../models/WorkOrderDpStage.js';
import { WorkOrderEvent } from '../models/WorkOrderEvent.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
import { WorkOrderItemAssignment } from '../models/WorkOrderItemAssignment.js';
import { WorkOrderItemProgressEvent } from '../models/WorkOrderItemProgressEvent.js';
import { WorkOrderItemSession } from '../models/WorkOrderItemSession.js';
import { WorkOrderObservation } from '../models/WorkOrderObservation.js';
import { WorkOrderObservationFile } from '../models/WorkOrderObservationFile.js';
import { WorkOrderProgressReport } from '../models/WorkOrderProgressReport.js';
import { WorkOrderRequest } from '../models/WorkOrderRequest.js';
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

const assertItemAccess = async (
  item: WorkOrderItem,
  workOrder: WorkOrder,
  role: RoleName,
  userId: number,
  transaction?: Transaction,
): Promise<void> => {
  if (role !== 'mecanico') return;
  if (!(await isAssignedToItem(item, workOrder, userId, transaction))) {
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
  if (lock && item.expressStockReturnedAt) {
    throw ApiError.badRequest('El accesorio fue enviado al stock general. Su historial se conserva y no puede reabrirse en esta OT');
  }
  return item;
};

export interface WorksheetItem {
  expressStockReturnedAt?: Date | null;
  qualityStatus: 'pendiente' | 'aprobado' | 'rechazado';
  qualityReviewedAt: Date | null;
  qualityReviewedBy: number | null;
  qualityNote: string | null;

  assignments: Array<{ id: number; userId: number; userName: string; specialtyId: number | null; specialtyName: string | null; costHourly?: number | null; saleHourly?: number | null; estimatedHours: number | null; originalEstimatedHours: number | null; completedAt: Date | null; active: boolean }>;
  activeSessions: NonNullable<WorksheetItem['activeSession']>[];
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
  canWork: boolean;
  awaitingWarehouseDelivery: boolean;
  canReceiveCustody?: boolean;
  division?: string;
  subtipo?: string | null;
  esAPedido?: boolean;
  precioUnitario?: number;
  custodyBodegueroId?: number | null;
  custodyBodegueroDeliveredAt?: Date | null;
  custodyArmadorId?: number | null;
  custodyArmadorReceivedAt?: Date | null;
  custodyArmadorNote?: string | null;
  ccfStatus?: string;
  ccfNote?: string | null;
  ccfCheckedAt?: Date | null;
  dpStages?: Array<{
    id: number;
    stageKey: string;
    stageLabel: string;
    stageOrder: number;
    assignedUserId: number | null;
    assignedUserName: string | null;
    status: string;
    startedAt: Date | null;
    completedAt: Date | null;
    mechanicNote: string | null;
  }>;
  sessions: Array<{ id: number; userName: string | null; startedAt: Date; endedAt: Date | null; reportedDate?: string | null; minutes: number; kind: string; note: string | null }>;
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
    assignedMechanicId: number | null;
  qualityApprovedAt: Date | null;
  qualityApprovedBy: number | null;
  qualityApprovalNote: string | null;

    fechaEntrega: Date | null;
    createdAt: Date;
    updatedAt: Date;
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
  requests: Array<{
    pendingPriceApproval: boolean;
    id: number; tipo: WorkOrderRequest['tipo']; estado: WorkOrderRequest['estado']; catalogItemId: number | null;
    workOrderItemId: number | null; workOrderItem: { id: number; descripcion: string } | null;
    cantidad: number | null; motivo: string; createdAt: Date;
    catalogItem: { id: number; nombre: string; codigo: string | null } | null;
    requester: { id: number; nombre: string } | null;
  }>;
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
  await settleExpiredLaborSessions();
  const { workOrder, role } = await getLaborContext(workOrderId, userId);
  const assignments = await WorkOrderItemAssignment.findAll({ where: { workOrderId }, order: [['id', 'ASC']] });
  const [vehicle, items, sessions, observations, progressReports, requests] = await Promise.all([
    workOrder.vehicleId === null
      ? Promise.resolve(null)
      : Vehicle.findByPk(workOrder.vehicleId, {
          attributes: ['id', 'patente', 'marca', 'modelo'],
        }),
    WorkOrderItem.findAll({
      where: { workOrderId },
      include: [
        { model: User, as: 'assignedUser', attributes: ['id', 'nombre'] },
        { model: WorkOrderDpStage, as: 'dpStages' },
      ],
      order: [
        ['id', 'ASC'],
        [{ model: WorkOrderDpStage, as: 'dpStages' }, 'stageIndex', 'ASC'],
      ],
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
    WorkOrderRequest.findAll({
      where: {
        workOrderId,
        ...(role === 'mecanico' ? { [Op.or]: [{ tipo: 'repuesto' }, { tipo: 'aumento_precio', requestedBy: userId }] } : {}),
      },
      attributes: ['id', 'tipo', 'estado', 'catalogItemId', 'workOrderItemId', 'cantidad', 'motivo', 'createdAt', 'requestedBy', 'precioAprobado'],
      include: [{ model: CatalogItem, as: 'catalogItem', attributes: ['id', 'nombre', 'codigo'] }, { model: User, as: 'requester', attributes: ['id', 'nombre'] }, { model: WorkOrderItem, as: 'workOrderItem', attributes: ['id', 'descripcion'] }],
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

  const permitted = (item: WorkOrderItem): boolean => item.division === 'DP'
    ? (item.dpStages ?? []).some((stage) => stage.assignedUserId === userId)
    : item.teamManaged
    ? assignments.some((a) => a.workOrderItemId === item.id && a.active && a.userId === userId)
    : (item.assignedUserId ?? workOrder.assignedMechanicId) === userId;
  const visibleItems = items;

  const itemDtos: WorksheetItem[] = visibleItems.map((item) => {
    const itemSessions = sessionsByItem.get(item.id) ?? [];
    const openSessions = itemSessions.filter((session) => session.status === 'abierta');
    const activeSession = openSessions.find((session) => session.userId === userId) ?? openSessions[0] ?? null;
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
      itemSessions.length ? minutesToHours(totalMinutes)
        : item.horasHombreReales === null ? null : toNumber(item.horasHombreReales);

    return {
      assignments: assignments.filter((a) => a.workOrderItemId === item.id && a.active).map((a) => ({ id: a.id, userId: a.userId, userName: a.userName, specialtyId: a.specialtyId, specialtyName: a.specialtyName, ...(SUPERVISOR_ROLES.includes(role) ? { costHourly: a.costHourly === null ? null : Number(a.costHourly), saleHourly: a.saleHourly === null ? null : Number(a.saleHourly) } : {}), estimatedHours: a.estimatedHours === null ? null : Number(a.estimatedHours), originalEstimatedHours: a.originalEstimatedHours === null ? null : Number(a.originalEstimatedHours), completedAt: a.completedAt, active: a.active })),
      activeSessions: openSessions.map((s) => ({ id: s.id, userId: s.userId, userName: s.userName, startedAt: s.startedAt, elapsedMinutes: getSessionMinutes(s, now), mine: s.userId === userId })),
      id: item.id,
      descripcion: item.descripcion,
      qualityStatus: item.qualityStatus ?? 'pendiente', qualityReviewedAt: item.qualityReviewedAt ?? null, qualityReviewedBy: item.qualityReviewedBy ?? null, qualityNote: item.qualityNote ?? null,
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
      canWork: !item.expressStockReturnedAt && workOrder.estado !== 'entregada' && workOrder.estado !== 'cancelada' && (role !== 'mecanico' || permitted(item)),
      expressStockReturnedAt: item.expressStockReturnedAt ?? null,
      awaitingWarehouseDelivery: item.tipoLinea === 'parte' && !item.stockConsumido && requests.some(
        (request) => request.tipo === 'repuesto' && request.estado === 'aprobada' && request.workOrderItemId === item.id,
      ),
      division: item.division ?? (item.tipoLinea === 'parte' ? 'ACC' : 'MEC'),
      canReceiveCustody: !item.expressStockReturnedAt && role === 'mecanico' && (items.some((line) => line.division === 'DP')
        ? items.some((line) => line.dpStages?.some((stage) => stage.assignedUserId === userId && ['armador_desarme', 'armador_montaje'].includes(stage.stageKey)))
        : items.some(permitted)),
      subtipo: item.subtipo ?? null,
      esAPedido: item.esAPedido ?? false,
      ...(SUPERVISOR_ROLES.includes(role) ? { precioUnitario: Number(item.precioUnitario ?? 0) } : {}),
      dpStages: (item.dpStages ?? []).map((stage) => ({
        id: stage.id,
        stageKey: stage.stageKey,
        stageLabel: stage.stageLabel,
        stageIndex: stage.stageIndex,
        stageOrder: stage.stageIndex,
        assignedUserId: stage.assignedUserId ?? null,
        assignedUserName: stage.assignedUserName ?? null,
        status: stage.status,
        startedAt: stage.startedAt ? new Date(stage.startedAt) : null,
        completedAt: stage.completedAt ? new Date(stage.completedAt) : null,
        note: stage.note ?? null,
        mechanicNote: stage.note ?? null,
      })),
      custodyBodegueroId: item.bodegueroUserId ?? null,
      custodyBodegueroDeliveredAt: item.entregadoBodegaAt ?? null,
      custodyArmadorId: item.armadorUserId ?? null,
      custodyArmadorReceivedAt: item.recibidoTallerAt ?? null,
      custodyArmadorNote: item.notaEntrega ?? null,
      ccfStatus: item.ccfStatus ?? 'pendiente',
      ccfNote: item.ccfNotes ?? null,
      ccfCheckedAt: item.ccfReviewedAt ?? null,
      sessions: itemSessions.map((session) => ({ id: session.id, userName: session.userName, startedAt: session.startedAt, endedAt: session.endedAt, reportedDate: session.reportedDate ?? null, minutes: getSessionMinutes(session, now), kind: session.kind, note: session.note })),
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
      assignedMechanicId: workOrder.assignedMechanicId,
      qualityApprovedAt: workOrder.qualityApprovedAt ?? null,
      qualityApprovedBy: workOrder.qualityApprovedBy ?? null,
      qualityApprovalNote: workOrder.qualityApprovalNote ?? null,
      fechaEntrega: workOrder.fechaEntrega,
      createdAt: workOrder.createdAt,
      updatedAt: workOrder.updatedAt,
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
    requests: requests.map((request) => ({ pendingPriceApproval: request.tipo === 'aumento_precio' && request.estado === 'aprobada' && request.precioAprobado === null, id: request.id, tipo: request.tipo, estado: request.estado, catalogItemId: request.catalogItemId, workOrderItemId: request.workOrderItemId, workOrderItem: request.workOrderItem ? { id: request.workOrderItem.id, descripcion: request.workOrderItem.descripcion } : null, cantidad: request.cantidad === null ? null : Number(request.cantidad), motivo: request.motivo, createdAt: request.createdAt, catalogItem: request.catalogItem ? { id: request.catalogItem.id, nombre: request.catalogItem.nombre, codigo: request.catalogItem.codigo } : null, requester: request.requester ? { id: request.requester.id, nombre: request.requester.nombre } : null })),
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

  await settleExpiredLaborSessions();
  const orderIds = await getAssignedOrderIds(userId);

  const orders = await WorkOrder.findAll({
    where: {
      id: { [Op.in]: orderIds },
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
  await settleExpiredLaborSessions();
  const pausedOtherItems = await withWorkshopTransaction(async (transaction) => {
    await User.findByPk(userId, { transaction, lock: Transaction.LOCK.UPDATE });
    const { workOrder, role } = await getLaborContext(workOrderId, userId, transaction);
    assertEditable(workOrder);
    const item = await findItem(workOrderId, itemId, transaction, true);
    await assertItemAccess(item, workOrder, role, userId, transaction);
    if (item.tipoLinea === 'parte') throw ApiError.badRequest('Solo se pueden cronometrar servicios');
    if (item.division === 'DP') throw ApiError.badRequest('Registra las horas de tu etapa D&P desde Registro Diario');
    if (workOrder.estado === 'finalizada' || ['completado', 'omitido'].includes(item.estadoOperativo)) {
      throw ApiError.badRequest('El jefe debe reabrir el trabajo antes de iniciar otro cronómetro');
    }
    if (item.qualityStatus === 'aprobado') throw ApiError.badRequest('El servicio ya fue aprobado en calidad. El jefe debe reabrirlo para corregirlo');

    const openItemSession = await WorkOrderItemSession.findOne({
      where: { workOrderItemId: item.id, userId, status: 'abierta' },
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });
    if (openItemSession) {
      return 0;
    }

    const shift = await getWorkerShift(userId, new Date(), transaction);
    if (shift.configured && (!shift.start || !shift.end || Date.now() < shift.start.getTime() || Date.now() >= shift.end.getTime())) {
      const lunch = shift.intervals?.some((segment, index, intervals) => {
        const next = intervals[index + 1];
        return next && Date.now() >= segment.end.getTime() && Date.now() < next.start.getTime();
      });
      if (lunch) throw ApiError.badRequest('El taller está en horario de almuerzo. Reanuda el cronómetro al terminar el descanso');
      throw ApiError.badRequest('Estás fuera de la jornada configurada. El jefe debe registrar el tiempo adicional con su motivo');
    }
    const assignment = await WorkOrderItemAssignment.findOne({ where: { workOrderItemId: item.id, userId, active: true }, transaction });
    if (assignment?.completedAt) throw ApiError.badRequest('Tu parte de este servicio ya está terminada');
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
        assignmentId: assignment?.id ?? null,
        scheduledEndAt: shift.end,
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
  note?: string,
): Promise<WorkOrderWorksheet> => {
  const parsed = note === undefined ? undefined : pauseWorkshopTimerSchema.safeParse({ note });
  if (parsed && !parsed.success) throw ApiError.badRequest('Indica un motivo de pausa válido (máximo 2000 caracteres)');
  await withWorkshopTransaction(async (transaction) => {
    await User.findByPk(userId, { transaction, lock: Transaction.LOCK.UPDATE });
    const { workOrder, role } = await getLaborContext(workOrderId, userId, transaction);
    assertEditable(workOrder);
    const item = await findItem(workOrderId, itemId, transaction, true);
    await assertItemAccess(item, workOrder, role, userId, transaction);

    const session = await WorkOrderItemSession.findOne({
      where: { workOrderItemId: item.id, status: 'abierta', userId },
      transaction,
      lock: Transaction.LOCK.UPDATE,
    }) ?? (role !== 'mecanico' && !item.teamManaged ? await WorkOrderItemSession.findOne({
      where: { workOrderItemId: item.id, status: 'abierta' }, transaction, lock: Transaction.LOCK.UPDATE,
    }) : null);
    if (!session) return;
    if (session.userId !== null && session.userId !== userId && role === 'mecanico') {
      throw ApiError.forbidden('Solo quien inició el cronómetro puede pausarlo');
    }

    await closeSession(session, 'pausa', transaction, parsed?.success ? parsed.data.note : undefined);
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
  await withWorkshopTransaction(async (transaction) => {
    await User.findByPk(userId, { transaction, lock: Transaction.LOCK.UPDATE });
    const { workOrder, role } = await getLaborContext(workOrderId, userId, transaction);
    assertEditable(workOrder);
    const item = await findItem(workOrderId, itemId, transaction, true);
    await assertItemAccess(item, workOrder, role, userId, transaction);
    if (item.division === 'DP') throw ApiError.badRequest('Completa tu etapa D&P desde Gestionar trabajo o Registro Diario');
    if (item.qualityStatus === 'aprobado') {
      if (notasOperativas !== undefined && notasOperativas !== item.notasOperativas) throw ApiError.badRequest('El jefe debe reabrir el servicio aprobado antes de modificarlo');
      return;
    }

    if (!item.stockConsumido) {
      const pendingWarehouseDelivery = await WorkOrderRequest.findOne({
        where: {
          workOrderId,
          workOrderItemId: item.id,
          tipo: 'repuesto',
          estado: 'aprobada',
        },
        transaction,
      });
      if (pendingWarehouseDelivery) {
        throw ApiError.badRequest(
          `Bodega debe entregar el repuesto "${item.descripcion}" antes de marcarlo como completado`,
        );
      }
    }

    const team = await WorkOrderItemAssignment.findAll({ where: { workOrderItemId: item.id, active: true }, transaction, lock: Transaction.LOCK.UPDATE });
    if (item.teamManaged && !team.some((member) => member.userId === userId)) {
      throw ApiError.forbidden('Solo puedes terminar tu propia parte del equipo');
    }
    const sessions = await WorkOrderItemSession.findAll({
      where: { workOrderItemId: item.id, status: 'abierta', ...(role === 'mecanico' || item.teamManaged ? { userId } : {}) },
      transaction, lock: Transaction.LOCK.UPDATE,
    });
    for (const open of sessions) await closeSession(open, 'completado', transaction);
    const session = sessions[0] ?? null;
    for (const member of team) if (member.userId === userId && !member.completedAt) await member.update({ completedAt: new Date() }, { transaction });
    const complete = team.length === 0 || team.every((member) => member.completedAt !== null);
    if (!complete) {
      if (notasOperativas !== undefined) await item.update({ notasOperativas }, { transaction });
      await recalculateItemHours(item, transaction);
      return;
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
    await invalidateItemQuality(item, userId, 'Servicio terminado, pendiente de control de calidad', transaction);
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
    if (previousStatus !== 'completado') await enqueueWorkOrderProgress(workOrderId, userId, transaction, `completed:${item.id}:${randomUUID()}`);
  });

  return getWorkOrderWorksheet(workOrderId, userId);
};

export const assignWorkOrderItem = async (
  workOrderId: number,
  itemId: number,
  assignedUserId: number | null,
  actorUserId: number,
): Promise<WorkOrderWorksheet> => {
  await withWorkshopTransaction(async (transaction) => {
    await assertSupervisor(actorUserId, transaction);
    const workOrder = await findWorkOrderForLabor(workOrderId, transaction);
    assertEditable(workOrder);
    const item = await findItem(workOrderId, itemId, transaction, true);

    await replaceItemTeam(workOrder, item, { members: assignedUserId === null ? [] : [{ userId: assignedUserId, estimatedHours: item.horasHombreEstimadas === null ? null : Number(item.horasHombreEstimadas) * Number(item.cantidad) }], motivo: 'Asignación del responsable del trabajo' }, actorUserId, transaction);
    if (assignedUserId === null) await item.update({ teamManaged: false }, { transaction });
  });

  return getWorkOrderWorksheet(workOrderId, actorUserId);
};

export const updateItemEstimate = async (
  workOrderId: number,
  itemId: number,
  horasHombreEstimadas: number | null,
  actorUserId: number,
  motivo?: string,
): Promise<WorkOrderWorksheet> => {
  await withWorkshopTransaction(async (transaction) => {
    await assertSupervisor(actorUserId, transaction);
    const workOrder = await findWorkOrderForLabor(workOrderId, transaction);
    assertEditable(workOrder);
    const item = await findItem(workOrderId, itemId, transaction, true);
    if (item.teamManaged && await WorkOrderItemAssignment.count({ where: { workOrderItemId: item.id, active: true }, transaction })) throw ApiError.badRequest('Edita las horas estimadas de cada integrante en el equipo del servicio');
    const previous = item.horasHombreEstimadas;
    if (previous !== null && Number(previous) !== horasHombreEstimadas && !motivo?.trim()) throw ApiError.badRequest("Indica el motivo del cambio del tiempo estimado");
    await WorkOrderEvent.create({ workOrderId, actorUserId, tipo: "actualizacion", descripcion: "Tiempo estimado actualizado", metadata: { itemId, before: previous, after: horasHombreEstimadas, motivo: motivo ?? "Estimación inicial" } }, { transaction });
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
  await withWorkshopTransaction(async (transaction) => {
    await assertSupervisor(actorUserId, transaction);
    const workOrder = await findWorkOrderForLabor(workOrderId, transaction);
    assertEditable(workOrder);
    const item = await findItem(workOrderId, itemId, transaction, true);
    if (item.estadoOperativo !== 'completado' && item.horasHombreReales === null) {
      throw ApiError.badRequest(
        'Solo se pueden ajustar horas de un trabajo completado o con horas registradas',
      );
    }

    const team = await WorkOrderItemAssignment.findAll({ where: { workOrderItemId: item.id, active: true }, transaction });
    if (team.length > 1) throw ApiError.badRequest('Selecciona al trabajador en Jornada y horas para registrar o corregir sus horas');
    const workerId = team[0]?.userId ?? item.assignedUserId ?? workOrder.assignedMechanicId ?? actorUserId;
    const sessions = await WorkOrderItemSession.findAll({ where: { workOrderItemId: item.id }, transaction });
    if (sessions.reduce((sum, session) => sum + getSessionMinutes(session), 0) + minutos < 0) throw ApiError.badRequest('El ajuste no puede dejar horas negativas');
    const now = new Date();
    await WorkOrderItemSession.create(
      {
        workOrderId,
        workOrderItemId: item.id,
        userId: workerId,
        userName: (await User.findByPk(workerId, { attributes: ['nombre'], transaction }))?.nombre ?? null,
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
  await withWorkshopTransaction(async (transaction) => {
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
    await withWorkshopTransaction(async (transaction) => {
      const { workOrder, role } = await getLaborContext(workOrderId, userId, transaction);
      assertEditable(workOrder);

      if (data.workOrderItemId !== undefined && data.workOrderItemId !== null) {
        const item = await findItem(workOrderId, data.workOrderItemId, transaction);
        await assertItemAccess(item, workOrder, role, userId, transaction);
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

export { listPriceSuggestions, createPriceSuggestion, reviewPriceSuggestion } from './work-order-commercial.service.js';
export type { PriceSuggestionPublic } from './work-order-commercial.service.js';

export interface DailyReportUser {
  id: number;
  nombre: string;
  rol: string;
  minutos: number;
  horas: number;
  horasExtra: number;
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
    overtime: boolean;
    startedAt: string;
    endedAt: string | null;
    reportedDate?: string | null;
    note: string | null;
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
  totalHorasExtra: number;
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
  const { start: dayStart, end: dayEnd } = await getWorkshopDayRange(day);
  const now = new Date();

  const users = await User.findAll({
    attributes: ['id', 'nombre', 'activo', 'deletedAt'],
    paranoid: false,
    include: [{ model: Role, as: 'role', attributes: ['nombre'], required: true,
      where: { nombre: { [Op.in]: ['mecanico', 'jefe'] } } }],
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
        supersededAt: null,
        startedAt: { [Op.lt]: dayEnd },
        [Op.or]: [{ reportedDate: day }, { endedAt: { [Op.gt]: dayStart } }, ...(now > dayStart ? [{ status: 'abierta' as const }] : []),
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
  const overtimeMinutes = new Map<number, number>();
  const ensureReportUser = (userId: number, snapshotName?: string | null): DailyReportUser | undefined => {
    const existing = reportUsers.get(userId);
    if (existing) return existing;
    const user = usersById.get(userId);
    if (!user) return undefined;
    const entry: DailyReportUser = {
      id: user.id,
      nombre: snapshotName || user.nombre,
      rol: user.role?.nombre ?? '',
      minutos: 0,
      horas: 0,
      horasExtra: 0,
      sesiones: 0,
      itemsCompletados: 0,
      eventos: 0,
      enCurso: false,
      detalle: [],
    };
    reportUsers.set(user.id, entry);
    return entry;
  };
  for (const user of trackedUsers) {
    if (user.activo && !user.deletedAt) ensureReportUser(user.id);
  }

  for (const session of sessions) {
    if (session.userId === null || session.supersededAt) continue;
    const entry = ensureReportUser(session.userId, session.userName);
    if (!entry) continue;
    const minutes = getSessionMinutesInRange(session, dayStart, dayEnd, now);
    entry.minutos += minutes;
    if (session.overtime) {
      overtimeMinutes.set(session.userId, (overtimeMinutes.get(session.userId) ?? 0) + minutes);
    }
    entry.sesiones += 1;
    if (session.status === 'abierta' && now >= dayStart && now < dayEnd) entry.enCurso = true;
    if (session.workOrderId) orderIdsWithActivity.add(session.workOrderId);
    entry.detalle.push({
      workOrderId: session.workOrderId,
      workOrderCodigo: session.workOrder?.codigo ?? `OT ${session.workOrderId}`,
      itemDescripcion: session.item?.descripcion ?? 'Trabajo eliminado',
      minutos: minutes,
      estado: session.status,
      overtime: session.overtime ?? false,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
      reportedDate: session.reportedDate ?? null,
      note: session.note,
    });
  }

  for (const event of events) {
    if (event.performedByUserId === null) continue;
    const entry = ensureReportUser(event.performedByUserId);
    if (!entry) continue;
    entry.eventos += 1;
    if (event.toStatus === 'completado' && event.fromStatus !== 'completado') {
      entry.itemsCompletados += 1;
    }
    orderIdsWithActivity.add(event.workOrderId);
  }

  for (const entry of reportUsers.values()) {
    entry.horas = minutesToHours(entry.minutos);
    entry.horasExtra = minutesToHours(overtimeMinutes.get(entry.id) ?? 0);
  }

  const orderReports: DailyReportOrder[] = orders
    .filter((order) => orderIdsWithActivity.has(order.id))
    .map((order) => {
      const orderSessions = sessions.filter((session) => session.workOrderId === order.id && !session.supersededAt);
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
    totalHorasExtra: minutesToHours([...overtimeMinutes.values()].reduce((sum, minutes) => sum + minutes, 0)),
    totalItemsCompletados: [...reportUsers.values()].reduce(
      (sum, entry) => sum + entry.itemsCompletados,
      0,
    ),
    totalSesiones: [...reportUsers.values()].reduce((sum, entry) => sum + entry.sesiones, 0),
    usuarios: [...reportUsers.values()],
    ordenes: orderReports,
  };
};

export const assignWorkOrderTeam = async (workOrderId: number, itemId: number, data: import('@unithor/shared').AssignWorkOrderTeamInput, actorUserId: number): Promise<WorkOrderWorksheet> => {
  await withWorkshopTransaction(async (transaction) => {
    await assertSupervisor(actorUserId, transaction);
    const workOrder = await findWorkOrderForLabor(workOrderId, transaction);
    const item = await findItem(workOrderId, itemId, transaction, true);
    await replaceItemTeam(workOrder, item, data, actorUserId, transaction);
    await syncMirrorQuotationFromWorkOrder(workOrderId, transaction, true);
  });
  return getWorkOrderWorksheet(workOrderId, actorUserId);
};
