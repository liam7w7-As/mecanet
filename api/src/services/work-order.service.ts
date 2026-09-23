import {
  isValidWorkOrderTransition,
  VEHICLE_INVENTORY_ITEMS,
  WORK_ORDER_DELIVERY_CHECKLIST,
} from '@unithor/shared';
import { col, Op, Transaction, where as sequelizeWhere } from 'sequelize';

import { sequelize } from '../config/database.js';
import { CatalogItem } from '../models/CatalogItem.js';
import { Client } from '../models/Client.js';
import { Quotation } from '../models/Quotation.js';
import { QuotationItem } from '../models/QuotationItem.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { Vehicle } from '../models/Vehicle.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderDelivery } from '../models/WorkOrderDelivery.js';
import { WorkOrderEvent } from '../models/WorkOrderEvent.js';
import { WorkOrderInspection } from '../models/WorkOrderInspection.js';
import { WorkOrderInspectionPhoto } from '../models/WorkOrderInspectionPhoto.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
import { WorkOrderProgressReport } from '../models/WorkOrderProgressReport.js';
import { WorkOrderRequest } from '../models/WorkOrderRequest.js';
import { ApiError } from '../utils/ApiError.js';
import { generateQuotationCode, generateWorkOrderCode } from '../utils/generateCode.js';
import { getPagination } from '../utils/paginate.js';

import type {
  CreateWorkOrderInput,
  ItemOperationalStatus,
  QuotationStatus,
  UpdateWorkOrderInput,
  WorkOrderItemInput,
  WorkOrderInspectionInput,
  WorkOrderQueryInput,
  WorkOrderStatus,
  UpdateWorkOrderInspectionInput,
  FuelLevel,
  TireCondition,
  VehicleInventoryItem,
  WorkOrderInspectionPhotoSlot,
  CatalogType,
  CreateWorkOrderReentryInput,
  DeliverWorkOrderInput,
  WorkOrderDeliveryChecklistItem,
  WorkOrderEntryType,
  WorkOrderEventType,
  CreateWorkOrderRequestInput,
  ReviewWorkOrderRequestInput,
  Role as RoleName,
  UpdateWorkOrderExecutionInput,
  WorkOrderRequestStatus,
  WorkOrderRequestType,
} from '@unithor/shared';
import type { InferAttributes, WhereOptions } from 'sequelize';

interface WorkOrderClientPublic {
  id: number;
  rut: string | null;
  nombre: string;
  telefono: string | null;
}

interface WorkOrderVehiclePublic {
  id: number;
  patente: string;
  marca: string | null;
  modelo: string | null;
}

interface WorkOrderCreatorPublic {
  id: number;
  nombre: string;
  email: string;
}

interface WorkOrderItemPublic {
  id: number;
  catalogItemId: number | null;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  estadoOperativo: ItemOperationalStatus;
  notasOperativas: string | null;
  stockConsumido: boolean;
  stockConsumidoCantidad: number;
  stockConsumidoAt: Date | null;
  catalogItem?: WorkOrderItemCatalogPublic | null;
}

interface WorkOrderItemCatalogPublic {
  id: number;
  tipo: CatalogType;
  codigo: string | null;
  nombre: string;
  stock: number;
}

interface WorkOrderQuotationPublic {
  id: number;
  codigo: string;
  estadoPago: QuotationStatus;
  total: number;
  pagado: number;
  saldoPendiente: number;
}

interface WorkOrderContactPublic {
  clientId: number | null;
  nombre: string | null;
  rut: string | null;
  telefono: string | null;
  email: string | null;
}

interface WorkOrderBillingPublic extends WorkOrderContactPublic {
  tipo: 'cliente' | 'empresa' | null;
  direccion: string | null;
  region: string | null;
  comuna: string | null;
}

interface WorkOrderInspectionPublic {
  id: number;
  nivelCombustible: FuelLevel | null;
  llantaDelanteraIzquierda: TireCondition | null;
  llantaDelanteraDerecha: TireCondition | null;
  llantaTraseraIzquierda: TireCondition | null;
  llantaTraseraDerecha: TireCondition | null;
  inventario: VehicleInventoryItem[];
  objetosValor: string | null;
  observaciones: string | null;
  inspectedBy: number | null;
  createdAt: Date;
  updatedAt: Date;
  photos: Array<{
    id: number;
    slot: WorkOrderInspectionPhotoSlot;
    mimeType: string;
    sizeBytes: number;
    uploadedBy: number | null;
    createdAt: Date;
    updatedAt: Date;
    url: string;
  }>;
}

interface WorkOrderDeliveryPublic {
  id: number;
  kilometrajeSalida: number;
  receptorNombre: string;
  receptorRut: string | null;
  receptorTelefono: string | null;
  checklist: WorkOrderDeliveryChecklistItem[];
  conformidad: boolean;
  firmaRecepcion: string;
  observaciones: string | null;
  deliveredBy: number | null;
  deliveredAt: Date;
  deliverer?: { id: number; nombre: string } | null;
}

interface WorkOrderRelationPublic {
  id: number;
  codigo: string;
  tipoIngreso: WorkOrderEntryType;
  estado: WorkOrderStatus;
  coberturaGarantia: boolean;
  fechaIngreso: Date | null;
}

interface WorkOrderEventPublic {
  id: number;
  tipo: WorkOrderEventType;
  descripcion: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  actor?: { id: number; nombre: string } | null;
}

interface WorkOrderProgressReportPublic {
  id: number;
  porcentaje: number;
  comentario: string;
  bloqueos: string | null;
  createdAt: Date;
  mechanic?: { id: number; nombre: string } | null;
}

interface WorkOrderRequestPublic {
  id: number;
  workOrderItemId: number | null;
  catalogItemId: number | null;
  tipo: WorkOrderRequestType;
  estado: WorkOrderRequestStatus;
  motivo: string;
  cantidad: number | null;
  precioSugerido: number | null;
  precioAprobado: number | null;
  reviewNote: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  catalogItem?: { id: number; codigo: string | null; nombre: string; precio: number } | null;
  workOrderItem?: { id: number; descripcion: string; precioUnitario: number } | null;
  requester?: { id: number; nombre: string } | null;
  reviewer?: { id: number; nombre: string } | null;
}

export interface WorkOrderMechanicPublic {
  id: number;
  nombre: string;
  email: string;
}

export interface WorkOrderPublic {
  id: number;
  codigo: string;
  tipoIngreso: WorkOrderEntryType;
  sourceWorkOrderId: number | null;
  coberturaGarantia: boolean;
  clientId: number | null;
  contactClientId: number | null;
  billingClientId: number | null;
  vehicleId: number | null;
  estado: WorkOrderStatus;
  descripcion: string | null;
  kilometrajeIngreso: number | null;
  fechaIngreso: Date | null;
  fechaEntrega: Date | null;
  createdBy: number | null;
  assignedMechanicId: number | null;
  createdAt: Date;
  updatedAt: Date;
  client?: WorkOrderClientPublic | null;
  vehicle?: WorkOrderVehiclePublic | null;
  creator?: WorkOrderCreatorPublic | null;
  assignedMechanic?: WorkOrderMechanicPublic | null;
  items?: WorkOrderItemPublic[];
  quotation?: WorkOrderQuotationPublic | null;
  contact: WorkOrderContactPublic | null;
  billing: WorkOrderBillingPublic | null;
  inspection?: WorkOrderInspectionPublic | null;
  delivery?: WorkOrderDeliveryPublic | null;
  sourceWorkOrder?: WorkOrderRelationPublic | null;
  relatedWorkOrders?: WorkOrderRelationPublic[];
  events?: WorkOrderEventPublic[];
  progressReports?: WorkOrderProgressReportPublic[];
  requests?: WorkOrderRequestPublic[];
}

export interface ListWorkOrdersResult {
  items: WorkOrderPublic[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

type WorkOrderWhere = WhereOptions<InferAttributes<WorkOrder>> & {
  [Op.or]?: WhereOptions<InferAttributes<WorkOrder>>[];
};

const clientInclude = {
  model: Client,
  as: 'client',
  attributes: ['id', 'rut', 'nombre', 'telefono'],
};

const vehicleInclude = {
  model: Vehicle,
  as: 'vehicle',
  attributes: ['id', 'patente', 'marca', 'modelo'],
};

const creatorInclude = {
  model: User,
  as: 'creator',
  attributes: ['id', 'nombre', 'email'],
};

const assignedMechanicInclude = {
  model: User,
  as: 'assignedMechanic',
  attributes: ['id', 'nombre', 'email'],
};

const itemsInclude = {
  model: WorkOrderItem,
  as: 'items',
  attributes: [
    'id',
    'catalogItemId',
    'descripcion',
    'cantidad',
    'precioUnitario',
    'subtotal',
    'estadoOperativo',
    'notasOperativas',
    'stockConsumido',
    'stockConsumidoCantidad',
    'stockConsumidoAt',
  ],
  include: [
    {
      model: CatalogItem,
      as: 'catalogItem',
      attributes: ['id', 'tipo', 'codigo', 'nombre', 'stock'],
    },
  ],
};

const quotationInclude = {
  model: Quotation,
  as: 'quotation',
  attributes: ['id', 'codigo', 'estadoPago', 'total', 'pagado'],
};

const inspectionInclude = {
  model: WorkOrderInspection,
  as: 'inspection',
  attributes: [
    'id',
    'nivelCombustible',
    'llantaDelanteraIzquierda',
    'llantaDelanteraDerecha',
    'llantaTraseraIzquierda',
    'llantaTraseraDerecha',
    'inventario',
    'objetosValor',
    'observaciones',
    'inspectedBy',
    'createdAt',
    'updatedAt',
  ],
  include: [
    {
      model: WorkOrderInspectionPhoto,
      as: 'photos',
      attributes: [
        'id',
        'slot',
        'mimeType',
        'sizeBytes',
        'uploadedBy',
        'createdAt',
        'updatedAt',
      ],
    },
  ],
};

const deliveryInclude = {
  model: WorkOrderDelivery,
  as: 'delivery',
  include: [
    {
      model: User,
      as: 'deliverer',
      attributes: ['id', 'nombre'],
    },
  ],
};

const relationAttributes = [
  'id',
  'codigo',
  'tipoIngreso',
  'estado',
  'coberturaGarantia',
  'fechaIngreso',
  'createdAt',
];

const sourceWorkOrderInclude = {
  model: WorkOrder,
  as: 'sourceWorkOrder',
  attributes: relationAttributes,
};

const relatedWorkOrdersInclude = {
  model: WorkOrder,
  as: 'relatedWorkOrders',
  attributes: relationAttributes,
};

const eventsInclude = {
  model: WorkOrderEvent,
  as: 'events',
  include: [
    {
      model: User,
      as: 'actor',
      attributes: ['id', 'nombre'],
    },
  ],
};

const progressReportsInclude = {
  model: WorkOrderProgressReport,
  as: 'progressReports',
  include: [
    {
      model: User,
      as: 'mechanic',
      attributes: ['id', 'nombre'],
    },
  ],
};

const requestsInclude = {
  model: WorkOrderRequest,
  as: 'requests',
  include: [
    {
      model: CatalogItem,
      as: 'catalogItem',
      attributes: ['id', 'codigo', 'nombre', 'precio'],
    },
    {
      model: WorkOrderItem,
      as: 'workOrderItem',
      attributes: ['id', 'descripcion', 'precioUnitario'],
    },
    {
      model: User,
      as: 'requester',
      attributes: ['id', 'nombre'],
    },
    {
      model: User,
      as: 'reviewer',
      attributes: ['id', 'nombre'],
    },
  ],
};

const toNumber = (value: number | string): number => Number(value);

const parseInventory = (value: unknown): VehicleInventoryItem[] => {
  let parsed: unknown = value;

  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(
    (item): item is VehicleInventoryItem =>
      typeof item === 'string' &&
      VEHICLE_INVENTORY_ITEMS.includes(item as VehicleInventoryItem),
  );
};

const parseDeliveryChecklist = (value: unknown): WorkOrderDeliveryChecklistItem[] => {
  let parsed: unknown = value;

  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(
    (item): item is WorkOrderDeliveryChecklistItem =>
      typeof item === 'string' &&
      WORK_ORDER_DELIVERY_CHECKLIST.includes(item as WorkOrderDeliveryChecklistItem),
  );
};

const parseEventMetadata = (value: unknown): Record<string, unknown> | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== 'string') return null;

  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const toDateOrNull = (value: string | null | undefined): Date | null => {
  if (value === undefined || value === null) {
    return null;
  }

  return new Date(value);
};

const toWorkOrderPublic = (workOrder: WorkOrder): WorkOrderPublic => ({
  id: workOrder.id,
  codigo: workOrder.codigo,
  tipoIngreso: workOrder.tipoIngreso,
  sourceWorkOrderId: workOrder.sourceWorkOrderId,
  coberturaGarantia: workOrder.coberturaGarantia,
  clientId: workOrder.clientId,
  contactClientId: workOrder.contactClientId,
  billingClientId: workOrder.billingClientId,
  vehicleId: workOrder.vehicleId,
  estado: workOrder.estado,
  descripcion: workOrder.descripcion,
  kilometrajeIngreso: workOrder.kilometrajeIngreso,
  fechaIngreso: workOrder.fechaIngreso,
  fechaEntrega: workOrder.fechaEntrega,
  createdBy: workOrder.createdBy,
  assignedMechanicId: workOrder.assignedMechanicId,
  createdAt: workOrder.createdAt,
  updatedAt: workOrder.updatedAt,
  contact: workOrder.contactName
    ? {
        clientId: workOrder.contactClientId,
        nombre: workOrder.contactName,
        rut: workOrder.contactRut,
        telefono: workOrder.contactPhone,
        email: workOrder.contactEmail,
      }
    : null,
  billing: workOrder.billingName
    ? {
        clientId: workOrder.billingClientId,
        nombre: workOrder.billingName,
        rut: workOrder.billingRut,
        tipo: workOrder.billingType,
        telefono: workOrder.billingPhone,
        email: workOrder.billingEmail,
        direccion: workOrder.billingAddress,
        region: workOrder.billingRegion,
        comuna: workOrder.billingComuna,
      }
    : null,
  client: workOrder.client
    ? {
        id: workOrder.client.id,
        rut: workOrder.client.rut,
        nombre: workOrder.client.nombre,
        telefono: workOrder.client.telefono,
      }
    : workOrder.clientId === null
      ? null
      : undefined,
  vehicle: workOrder.vehicle
    ? {
        id: workOrder.vehicle.id,
        patente: workOrder.vehicle.patente,
        marca: workOrder.vehicle.marca,
        modelo: workOrder.vehicle.modelo,
      }
    : workOrder.vehicleId === null
      ? null
      : undefined,
  creator: workOrder.creator
    ? {
        id: workOrder.creator.id,
        nombre: workOrder.creator.nombre,
        email: workOrder.creator.email,
      }
    : workOrder.createdBy === null
      ? null
      : undefined,
  assignedMechanic: workOrder.assignedMechanic
    ? {
        id: workOrder.assignedMechanic.id,
        nombre: workOrder.assignedMechanic.nombre,
        email: workOrder.assignedMechanic.email,
      }
    : workOrder.assignedMechanicId === null
      ? null
      : undefined,
  items: workOrder.items
    ?.slice()
    .sort((left, right) => left.id - right.id)
    .map((item) => ({
      id: item.id,
      catalogItemId: item.catalogItemId,
      descripcion: item.descripcion,
      cantidad: toNumber(item.cantidad),
      precioUnitario: toNumber(item.precioUnitario),
      subtotal: toNumber(item.subtotal),
      estadoOperativo: item.estadoOperativo,
      notasOperativas: item.notasOperativas,
      stockConsumido: item.stockConsumido,
      stockConsumidoCantidad: item.stockConsumidoCantidad,
      stockConsumidoAt: item.stockConsumidoAt,
      catalogItem: item.catalogItem
        ? {
            id: item.catalogItem.id,
            tipo: item.catalogItem.tipo,
            codigo: item.catalogItem.codigo,
            nombre: item.catalogItem.nombre,
            stock: item.catalogItem.stock,
          }
        : item.catalogItem === null
          ? null
          : undefined,
    })),
  quotation: workOrder.quotation
    ? {
        id: workOrder.quotation.id,
        codigo: workOrder.quotation.codigo,
        estadoPago: workOrder.quotation.estadoPago,
        total: toNumber(workOrder.quotation.total),
        pagado: toNumber(workOrder.quotation.pagado),
        saldoPendiente: Math.max(
          0,
          toNumber(workOrder.quotation.total) - toNumber(workOrder.quotation.pagado),
        ),
      }
    : workOrder.quotation === null
      ? null
      : undefined,
  inspection: workOrder.inspection
    ? {
        id: workOrder.inspection.id,
        nivelCombustible: workOrder.inspection.nivelCombustible,
        llantaDelanteraIzquierda: workOrder.inspection.llantaDelanteraIzquierda,
        llantaDelanteraDerecha: workOrder.inspection.llantaDelanteraDerecha,
        llantaTraseraIzquierda: workOrder.inspection.llantaTraseraIzquierda,
        llantaTraseraDerecha: workOrder.inspection.llantaTraseraDerecha,
        inventario: parseInventory(workOrder.inspection.getDataValue('inventario')),
        objetosValor: workOrder.inspection.objetosValor,
        observaciones: workOrder.inspection.observaciones,
        inspectedBy: workOrder.inspection.inspectedBy,
        createdAt: workOrder.inspection.createdAt,
        updatedAt: workOrder.inspection.updatedAt,
        photos: (workOrder.inspection.photos ?? [])
          .slice()
          .sort((left, right) => left.slot.localeCompare(right.slot))
          .map((photo) => ({
            id: photo.id,
            slot: photo.slot,
            mimeType: photo.mimeType,
            sizeBytes: photo.sizeBytes,
            uploadedBy: photo.uploadedBy,
            createdAt: photo.createdAt,
            updatedAt: photo.updatedAt,
            url: `/api/work-orders/${workOrder.id}/inspection/photos/${photo.slot}`,
          })),
      }
    : workOrder.inspection === null
      ? null
      : undefined,
  delivery: workOrder.delivery
    ? {
        id: workOrder.delivery.id,
        kilometrajeSalida: workOrder.delivery.kilometrajeSalida,
        receptorNombre: workOrder.delivery.receptorNombre,
        receptorRut: workOrder.delivery.receptorRut,
        receptorTelefono: workOrder.delivery.receptorTelefono,
        checklist: parseDeliveryChecklist(workOrder.delivery.getDataValue('checklist')),
        conformidad: workOrder.delivery.conformidad,
        firmaRecepcion: workOrder.delivery.firmaRecepcion,
        observaciones: workOrder.delivery.observaciones,
        deliveredBy: workOrder.delivery.deliveredBy,
        deliveredAt: workOrder.delivery.deliveredAt,
        deliverer: workOrder.delivery.deliverer
          ? {
              id: workOrder.delivery.deliverer.id,
              nombre: workOrder.delivery.deliverer.nombre,
            }
          : workOrder.delivery.deliveredBy === null
            ? null
            : undefined,
      }
    : workOrder.delivery === null
      ? null
      : undefined,
  sourceWorkOrder: workOrder.sourceWorkOrder
    ? {
        id: workOrder.sourceWorkOrder.id,
        codigo: workOrder.sourceWorkOrder.codigo,
        tipoIngreso: workOrder.sourceWorkOrder.tipoIngreso,
        estado: workOrder.sourceWorkOrder.estado,
        coberturaGarantia: workOrder.sourceWorkOrder.coberturaGarantia,
        fechaIngreso: workOrder.sourceWorkOrder.fechaIngreso,
      }
    : workOrder.sourceWorkOrderId === null
      ? null
      : undefined,
  relatedWorkOrders: workOrder.relatedWorkOrders
    ?.slice()
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map((related) => ({
      id: related.id,
      codigo: related.codigo,
      tipoIngreso: related.tipoIngreso,
      estado: related.estado,
      coberturaGarantia: related.coberturaGarantia,
      fechaIngreso: related.fechaIngreso,
    })),
  events: workOrder.events
    ?.slice()
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map((event) => ({
      id: event.id,
      tipo: event.tipo,
      descripcion: event.descripcion,
      metadata: parseEventMetadata(event.getDataValue('metadata')),
      createdAt: event.createdAt,
      actor: event.actor
        ? { id: event.actor.id, nombre: event.actor.nombre }
        : event.actorUserId === null
          ? null
          : undefined,
    })),
  progressReports: workOrder.progressReports
    ?.slice()
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map((report) => ({
      id: report.id,
      porcentaje: report.porcentaje,
      comentario: report.comentario,
      bloqueos: report.bloqueos,
      createdAt: report.createdAt,
      mechanic: report.mechanic
        ? { id: report.mechanic.id, nombre: report.mechanic.nombre }
        : report.mechanicId === null
          ? null
          : undefined,
    })),
  requests: workOrder.requests
    ?.slice()
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map((request) => ({
      id: request.id,
      workOrderItemId: request.workOrderItemId,
      catalogItemId: request.catalogItemId,
      tipo: request.tipo,
      estado: request.estado,
      motivo: request.motivo,
      cantidad: request.cantidad === null ? null : toNumber(request.cantidad),
      precioSugerido:
        request.precioSugerido === null ? null : toNumber(request.precioSugerido),
      precioAprobado:
        request.precioAprobado === null ? null : toNumber(request.precioAprobado),
      reviewNote: request.reviewNote,
      reviewedAt: request.reviewedAt,
      createdAt: request.createdAt,
      catalogItem: request.catalogItem
        ? {
            id: request.catalogItem.id,
            codigo: request.catalogItem.codigo,
            nombre: request.catalogItem.nombre,
            precio: toNumber(request.catalogItem.precio),
          }
        : request.catalogItemId === null
          ? null
          : undefined,
      workOrderItem: request.workOrderItem
        ? {
            id: request.workOrderItem.id,
            descripcion: request.workOrderItem.descripcion,
            precioUnitario: toNumber(request.workOrderItem.precioUnitario),
          }
        : request.workOrderItemId === null
          ? null
          : undefined,
      requester: request.requester
        ? { id: request.requester.id, nombre: request.requester.nombre }
        : request.requestedBy === null
          ? null
          : undefined,
      reviewer: request.reviewer
        ? { id: request.reviewer.id, nombre: request.reviewer.nombre }
        : request.reviewedBy === null
          ? null
          : undefined,
    })),
});

const recordWorkOrderEvent = async (
  workOrderId: number,
  actorUserId: number | null,
  tipo: WorkOrderEventType,
  descripcion: string,
  metadata: Record<string, unknown> | null,
  transaction: Transaction,
): Promise<void> => {
  await WorkOrderEvent.create(
    { workOrderId, actorUserId, tipo, descripcion, metadata },
    { transaction },
  );
};

const buildItemsPayload = (
  workOrderId: number,
  items: WorkOrderItemInput[],
): Array<{
  workOrderId: number;
  catalogItemId: number | null;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  estadoOperativo: ItemOperationalStatus;
  notasOperativas: string | null;
  stockConsumido: boolean;
  stockConsumidoCantidad: number;
  stockConsumidoAt: null;
}> => {
  return items.map((item) => {
    const cantidad = Number(item.cantidad);
    const precioUnitario = Number(item.precioUnitario);

    return {
      workOrderId,
      catalogItemId: item.catalogItemId ?? null,
      descripcion: item.descripcion,
      cantidad,
      precioUnitario,
      subtotal: cantidad * precioUnitario,
      estadoOperativo: item.estadoOperativo ?? 'pendiente',
      notasOperativas: item.notasOperativas ?? null,
      stockConsumido: false,
      stockConsumidoCantidad: 0,
      stockConsumidoAt: null,
    };
  });
};

const getPartUnitsToConsume = (item: WorkOrderItem): number => {
  const units = toNumber(item.cantidad);

  if (!Number.isInteger(units)) {
    throw ApiError.badRequest(
      `La cantidad del repuesto "${item.descripcion}" debe ser un número entero para descontar stock`,
    );
  }

  return units;
};

const lockCatalogItem = async (
  catalogItemId: number,
  transaction: Transaction,
): Promise<CatalogItem> => {
  const catalogItem = await CatalogItem.findByPk(catalogItemId, {
    transaction,
    lock: Transaction.LOCK.UPDATE,
  });

  if (!catalogItem) {
    throw ApiError.badRequest('Uno o más ítems de catálogo no existen');
  }

  return catalogItem;
};

const restoreConsumedStock = async (
  items: WorkOrderItem[],
  transaction: Transaction,
): Promise<void> => {
  for (const item of items) {
    if (!item.stockConsumido || item.catalogItemId === null || item.stockConsumidoCantidad <= 0) {
      continue;
    }

    const catalogItem = await lockCatalogItem(item.catalogItemId, transaction);
    if (catalogItem.tipo !== 'parte') {
      continue;
    }

    await catalogItem.update(
      { stock: Number(catalogItem.stock) + item.stockConsumidoCantidad },
      { transaction },
    );
  }
};

const consumeCompletedPartStock = async (
  items: WorkOrderItem[],
  transaction: Transaction,
): Promise<void> => {
  for (const item of items) {
    if (
      item.estadoOperativo !== 'completado' ||
      item.catalogItemId === null ||
      item.stockConsumido
    ) {
      continue;
    }

    const catalogItem = await lockCatalogItem(item.catalogItemId, transaction);
    if (catalogItem.tipo !== 'parte') {
      continue;
    }

    const units = getPartUnitsToConsume(item);
    if (Number(catalogItem.stock) < units) {
      throw ApiError.badRequest(
        `Stock insuficiente para ${catalogItem.nombre}. Stock actual: ${catalogItem.stock}, requerido: ${units}`,
      );
    }

    await catalogItem.update({ stock: Number(catalogItem.stock) - units }, { transaction });
    await item.update(
      {
        stockConsumido: true,
        stockConsumidoCantidad: units,
        stockConsumidoAt: new Date(),
      },
      { transaction },
    );
  }
};

const createMirrorQuotation = async (
  workOrder: WorkOrder,
  items: WorkOrderItemInput[],
  userId: number,
  transaction: Transaction,
): Promise<void> => {
  const total = items.reduce(
    (sum, item) => sum + Number(item.cantidad) * Number(item.precioUnitario),
    0,
  );
  const codigo = await generateQuotationCode(transaction);
  const quotation = await Quotation.create(
    {
      codigo,
      workOrderId: workOrder.id,
      clientId: workOrder.clientId,
      vehicleId: workOrder.vehicleId,
      asesorId: userId,
      estadoPago: 'por_pagar',
      subtotal: total,
      total,
      pagado: 0,
      notas: workOrder.descripcion
        ? `Generada automáticamente desde ${workOrder.codigo}\n${workOrder.descripcion}`
        : `Generada automáticamente desde ${workOrder.codigo}`,
    },
    { transaction },
  );

  if (items.length > 0) {
    await QuotationItem.bulkCreate(
      buildItemsPayload(quotation.id, items).map((item) => ({
        quotationId: quotation.id,
        catalogItemId: item.catalogItemId,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        subtotal: item.subtotal,
        estadoOperativo: item.estadoOperativo,
        notasOperativas: item.notasOperativas,
      })),
      { transaction },
    );
  }
};

const assertClientExists = async (
  clientId: number,
  transaction: Transaction,
  errorMessage = 'El cliente especificado no existe',
): Promise<Client> => {
  const client = await Client.findByPk(clientId, { transaction });
  if (!client) {
    throw ApiError.badRequest(errorMessage);
  }

  return client;
};

type ContactSnapshotPayload = Pick<
  WorkOrder,
  'contactClientId' | 'contactName' | 'contactRut' | 'contactPhone' | 'contactEmail'
>;

type BillingSnapshotPayload = Pick<
  WorkOrder,
  | 'billingClientId'
  | 'billingName'
  | 'billingRut'
  | 'billingType'
  | 'billingPhone'
  | 'billingEmail'
  | 'billingAddress'
  | 'billingRegion'
  | 'billingComuna'
>;

const buildContactSnapshot = (client: Client | null): ContactSnapshotPayload => ({
  contactClientId: client?.id ?? null,
  contactName: client?.nombre ?? null,
  contactRut: client?.rut ?? null,
  contactPhone: client?.telefono ?? null,
  contactEmail: client?.email ?? null,
});

const buildBillingSnapshot = (client: Client | null): BillingSnapshotPayload => ({
  billingClientId: client?.id ?? null,
  billingName: client?.nombre ?? null,
  billingRut: client?.rut ?? null,
  billingType: client?.tipo ?? null,
  billingPhone: client?.telefono ?? null,
  billingEmail: client?.email ?? null,
  billingAddress: client?.direccion ?? null,
  billingRegion: client?.region ?? null,
  billingComuna: client?.comuna ?? null,
});

const resolveSnapshotClient = async (
  clientId: number | null,
  errorMessage: string,
  transaction: Transaction,
): Promise<Client | null> => {
  if (clientId === null) {
    return null;
  }

  return assertClientExists(clientId, transaction, errorMessage);
};

const createInspection = async (
  workOrderId: number,
  inspection: WorkOrderInspectionInput,
  userId: number,
  transaction: Transaction,
): Promise<void> => {
  await WorkOrderInspection.create(
    {
      workOrderId,
      nivelCombustible: inspection.nivelCombustible ?? null,
      llantaDelanteraIzquierda: inspection.llantaDelanteraIzquierda ?? null,
      llantaDelanteraDerecha: inspection.llantaDelanteraDerecha ?? null,
      llantaTraseraIzquierda: inspection.llantaTraseraIzquierda ?? null,
      llantaTraseraDerecha: inspection.llantaTraseraDerecha ?? null,
      inventario: inspection.inventario,
      objetosValor: inspection.objetosValor ?? null,
      observaciones: inspection.observaciones ?? null,
      inspectedBy: userId,
    },
    { transaction },
  );
};

const upsertInspection = async (
  workOrderId: number,
  inspection: UpdateWorkOrderInspectionInput,
  userId: number,
  transaction: Transaction,
): Promise<void> => {
  const existing = await WorkOrderInspection.findOne({ where: { workOrderId }, transaction });

  if (!existing) {
    await createInspection(
      workOrderId,
      {
        ...inspection,
        inventario: inspection.inventario ?? [],
      },
      userId,
      transaction,
    );
    return;
  }

  const updatePayload: Partial<
    Pick<
      WorkOrderInspection,
      | 'nivelCombustible'
      | 'llantaDelanteraIzquierda'
      | 'llantaDelanteraDerecha'
      | 'llantaTraseraIzquierda'
      | 'llantaTraseraDerecha'
      | 'inventario'
      | 'objetosValor'
      | 'observaciones'
      | 'inspectedBy'
    >
  > = { inspectedBy: userId };

  if (inspection.nivelCombustible !== undefined) {
    updatePayload.nivelCombustible = inspection.nivelCombustible;
  }
  if (inspection.llantaDelanteraIzquierda !== undefined) {
    updatePayload.llantaDelanteraIzquierda = inspection.llantaDelanteraIzquierda;
  }
  if (inspection.llantaDelanteraDerecha !== undefined) {
    updatePayload.llantaDelanteraDerecha = inspection.llantaDelanteraDerecha;
  }
  if (inspection.llantaTraseraIzquierda !== undefined) {
    updatePayload.llantaTraseraIzquierda = inspection.llantaTraseraIzquierda;
  }
  if (inspection.llantaTraseraDerecha !== undefined) {
    updatePayload.llantaTraseraDerecha = inspection.llantaTraseraDerecha;
  }
  if (inspection.inventario !== undefined) {
    updatePayload.inventario = inspection.inventario;
  }
  if (inspection.objetosValor !== undefined) {
    updatePayload.objetosValor = inspection.objetosValor;
  }
  if (inspection.observaciones !== undefined) {
    updatePayload.observaciones = inspection.observaciones;
  }

  await existing.update(updatePayload, { transaction });
};

const assertVehicleExists = async (
  vehicleId: number,
  transaction: Transaction,
): Promise<Vehicle> => {
  const vehicle = await Vehicle.findByPk(vehicleId, { transaction });
  if (!vehicle) {
    throw ApiError.badRequest('El vehículo especificado no existe');
  }

  return vehicle;
};

const assertClientMatchesVehicle = (clientId: number | null, vehicle: Vehicle | null): void => {
  if (clientId !== null && vehicle !== null && vehicle.clientId !== null && vehicle.clientId !== clientId) {
    throw ApiError.badRequest('El vehículo pertenece a un cliente distinto al seleccionado');
  }
};

const assertCatalogItemsExist = async (
  items: WorkOrderItemInput[],
  transaction: Transaction,
): Promise<void> => {
  const catalogItemIds = [
    ...new Set(
      items
        .map((item) => item.catalogItemId)
        .filter((catalogItemId): catalogItemId is number => catalogItemId !== undefined && catalogItemId !== null),
    ),
  ];

  if (catalogItemIds.length === 0) {
    return;
  }

  const count = await CatalogItem.count({
    where: { id: catalogItemIds },
    transaction,
  });

  if (count !== catalogItemIds.length) {
    throw ApiError.badRequest('Uno o más ítems de catálogo no existen');
  }
};

const SUPERVISOR_ROLES: RoleName[] = ['desarrollador', 'admin', 'jefe'];

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

const assertSupervisor = async (userId: number, transaction?: Transaction): Promise<void> => {
  const role = await getActorRole(userId, transaction);
  if (!SUPERVISOR_ROLES.includes(role)) {
    throw ApiError.forbidden('Esta acción requiere autorización del jefe de taller');
  }
};

const assertManagementActionAllowed = async (
  userId: number,
  transaction?: Transaction,
): Promise<void> => {
  if ((await getActorRole(userId, transaction)) === 'mecanico') {
    throw ApiError.forbidden(
      'El mecánico solo puede actualizar la ejecución y registrar solicitudes en sus órdenes asignadas',
    );
  }
};

export const assertWorkOrderAccess = async (
  id: number,
  userId: number,
  transaction?: Transaction,
): Promise<void> => {
  const role = await getActorRole(userId, transaction);
  if (role !== 'mecanico') return;

  const assigned = await WorkOrder.count({
    where: { id, assignedMechanicId: userId },
    transaction,
  });
  if (assigned === 0) {
    throw ApiError.notFound('Orden de trabajo no encontrada');
  }
};

export const assertWorkOrderManagementAccess = async (
  id: number,
  userId: number,
): Promise<void> => {
  await assertWorkOrderAccess(id, userId);
  await assertManagementActionAllowed(userId);
};

const getCompleteWorkOrder = async (
  id: number,
  transaction?: Transaction,
): Promise<WorkOrder> => {
  const workOrder = await WorkOrder.findByPk(id, {
    include: [
      clientInclude,
      vehicleInclude,
      creatorInclude,
      assignedMechanicInclude,
      itemsInclude,
      inspectionInclude,
      quotationInclude,
      deliveryInclude,
      sourceWorkOrderInclude,
      relatedWorkOrdersInclude,
      eventsInclude,
      progressReportsInclude,
      requestsInclude,
    ],
    transaction,
  });

  if (!workOrder) {
    throw ApiError.notFound('Orden de trabajo no encontrada');
  }

  return workOrder;
};

export const listWorkOrders = async (
  query: WorkOrderQueryInput,
  userId: number,
): Promise<ListWorkOrdersResult> => {
  const pagination = getPagination(query);
  const where: WorkOrderWhere = {};

  if ((await getActorRole(userId)) === 'mecanico') {
    where.assignedMechanicId = userId;
  }

  if (query.search) {
    const searchPattern = `%${query.search}%`;
    where[Op.or] = [
      { codigo: { [Op.like]: searchPattern } },
      { descripcion: { [Op.like]: searchPattern } },
      sequelizeWhere(col('client.nombre'), { [Op.like]: searchPattern }),
      sequelizeWhere(col('client.rut'), { [Op.like]: searchPattern }),
      sequelizeWhere(col('vehicle.patente'), { [Op.like]: searchPattern }),
    ];
  }

  if (query.estado !== undefined) {
    where.estado = query.estado;
  }

  if (query.clientId !== undefined) {
    where.clientId = query.clientId;
  }

  if (query.vehicleId !== undefined) {
    where.vehicleId = query.vehicleId;
  }

  if (query.fechaDesde || query.fechaHasta) {
    const range: { [Op.gte]?: Date; [Op.lte]?: Date } = {};
    if (query.fechaDesde) {
      range[Op.gte] = new Date(`${query.fechaDesde}T00:00:00.000Z`);
    }
    if (query.fechaHasta) {
      range[Op.lte] = new Date(`${query.fechaHasta}T23:59:59.999Z`);
    }
    where.fechaIngreso = range;
  }

  const { rows, count } = await WorkOrder.findAndCountAll({
    where,
    // itemsInclude alimenta las cards del taller (progreso por tareas + total).
    // separate:true evita que el JOIN hasMany rompa el conteo y los filtros
    // por cliente/vehículo (los trae en una segunda consulta con IN).
    include: [
      clientInclude,
      vehicleInclude,
      assignedMechanicInclude,
      { ...itemsInclude, separate: true },
    ],
    limit: pagination.limit,
    offset: pagination.offset,
    order: [['createdAt', 'DESC']],
  });

  return {
    items: rows.map(toWorkOrderPublic),
    total: count,
    page: pagination.page,
    pageSize: pagination.limit,
    totalPages: count > 0 ? Math.ceil(count / pagination.limit) : 0,
  };
};

export const getWorkOrderById = async (
  id: number,
  userId?: number,
): Promise<WorkOrderPublic> => {
  if (userId !== undefined) {
    await assertWorkOrderAccess(id, userId);
  }
  const workOrder = await getCompleteWorkOrder(id);
  return toWorkOrderPublic(workOrder);
};

export const createWorkOrder = async (
  data: CreateWorkOrderInput,
  userId: number,
): Promise<WorkOrderPublic> => {
  const workOrderId = await sequelize.transaction(async (transaction) => {
    const clientId = data.clientId ?? null;
    const contactClientId = data.contactClientId === undefined ? clientId : data.contactClientId;
    const billingClientId = data.billingClientId === undefined ? clientId : data.billingClientId;
    const vehicleId = data.vehicleId ?? null;

    const client =
      clientId === null ? null : await assertClientExists(clientId, transaction);
    const contactClient =
      contactClientId === clientId
        ? client
        : await resolveSnapshotClient(
            contactClientId,
            'El cliente de contacto especificado no existe',
            transaction,
          );
    const billingClient =
      billingClientId === clientId
        ? client
        : billingClientId === contactClientId
          ? contactClient
          : await resolveSnapshotClient(
              billingClientId,
              'El cliente de facturación especificado no existe',
              transaction,
            );

    let vehicle: Vehicle | null = null;
    if (data.vehicleId !== undefined && data.vehicleId !== null) {
      vehicle = await assertVehicleExists(data.vehicleId, transaction);
      if (
        data.kilometrajeIngreso !== undefined &&
        data.kilometrajeIngreso !== null &&
        (vehicle.kilometraje === null || data.kilometrajeIngreso > vehicle.kilometraje)
      ) {
        await vehicle.update({ kilometraje: data.kilometrajeIngreso }, { transaction });
      }
    }

    assertClientMatchesVehicle(clientId, vehicle);

    await assertCatalogItemsExist(data.items, transaction);

    const codigo = await generateWorkOrderCode(transaction);
    const workOrder = await WorkOrder.create(
      {
        codigo,
        clientId,
        ...buildContactSnapshot(contactClient),
        ...buildBillingSnapshot(billingClient),
        vehicleId,
        estado: 'borrador',
        descripcion: data.descripcion ?? null,
        kilometrajeIngreso: data.kilometrajeIngreso ?? null,
        fechaIngreso: toDateOrNull(data.fechaIngreso) ?? new Date(),
        fechaEntrega: toDateOrNull(data.fechaEntrega),
        createdBy: userId,
      },
      { transaction },
    );

    if (data.items.length > 0) {
      const createdItems = await WorkOrderItem.bulkCreate(buildItemsPayload(workOrder.id, data.items), {
        transaction,
      });
      await consumeCompletedPartStock(createdItems, transaction);
    }

    await createMirrorQuotation(workOrder, data.items, userId, transaction);

    if (data.inspection !== undefined) {
      await createInspection(workOrder.id, data.inspection, userId, transaction);
    }

    await recordWorkOrderEvent(
      workOrder.id,
      userId,
      'creacion',
      'Orden de trabajo creada',
      { clientId, vehicleId, itemsCount: data.items.length },
      transaction,
    );

    return workOrder.id;
  });

  return getWorkOrderById(workOrderId);
};

export const updateWorkOrder = async (
  id: number,
  data: UpdateWorkOrderInput,
  userId: number,
): Promise<WorkOrderPublic> => {
  const workOrderId = await sequelize.transaction(async (transaction) => {
    await assertManagementActionAllowed(userId, transaction);
    const workOrder = await WorkOrder.findByPk(id, { transaction });
    if (!workOrder) {
      throw ApiError.notFound('Orden de trabajo no encontrada');
    }

    if (workOrder.estado === 'entregada' || workOrder.estado === 'cancelada') {
      throw ApiError.badRequest('No se puede modificar una orden finalizada o cancelada');
    }

    const nextClientId = data.clientId !== undefined ? data.clientId : workOrder.clientId;
    const nextVehicleId = data.vehicleId !== undefined ? data.vehicleId : workOrder.vehicleId;

    if (nextClientId !== null) {
      await assertClientExists(nextClientId, transaction);
    }

    let vehicle: Vehicle | null = null;
    if (nextVehicleId !== null) {
      vehicle = await assertVehicleExists(nextVehicleId, transaction);
      if (
        data.kilometrajeIngreso !== undefined &&
        data.kilometrajeIngreso !== null &&
        (vehicle.kilometraje === null || data.kilometrajeIngreso > vehicle.kilometraje)
      ) {
        await vehicle.update({ kilometraje: data.kilometrajeIngreso }, { transaction });
      }
    }

    assertClientMatchesVehicle(nextClientId, vehicle);

    if (data.items !== undefined) {
      await assertCatalogItemsExist(data.items, transaction);
      const existingItems = await WorkOrderItem.findAll({
        where: { workOrderId: id },
        transaction,
        lock: Transaction.LOCK.UPDATE,
      });
      await restoreConsumedStock(existingItems, transaction);
      await WorkOrderItem.destroy({ where: { workOrderId: id }, transaction });

      if (data.items.length > 0) {
        const createdItems = await WorkOrderItem.bulkCreate(buildItemsPayload(id, data.items), {
          transaction,
        });
        await consumeCompletedPartStock(createdItems, transaction);
      }
    }

    if (data.inspection !== undefined) {
      await upsertInspection(id, data.inspection, userId, transaction);
    }

    const updatePayload: Partial<
      Pick<
        WorkOrder,
        | 'clientId'
        | 'contactClientId'
        | 'contactName'
        | 'contactRut'
        | 'contactPhone'
        | 'contactEmail'
        | 'billingClientId'
        | 'billingName'
        | 'billingRut'
        | 'billingType'
        | 'billingPhone'
        | 'billingEmail'
        | 'billingAddress'
        | 'billingRegion'
        | 'billingComuna'
        | 'vehicleId'
        | 'descripcion'
        | 'kilometrajeIngreso'
        | 'fechaIngreso'
        | 'fechaEntrega'
      >
    > = {};

    if (data.clientId !== undefined) {
      updatePayload.clientId = data.clientId;
    }
    if (data.contactClientId !== undefined) {
      const contactClient = await resolveSnapshotClient(
        data.contactClientId,
        'El cliente de contacto especificado no existe',
        transaction,
      );
      Object.assign(updatePayload, buildContactSnapshot(contactClient));
    }
    if (data.billingClientId !== undefined) {
      const billingClient = await resolveSnapshotClient(
        data.billingClientId,
        'El cliente de facturación especificado no existe',
        transaction,
      );
      Object.assign(updatePayload, buildBillingSnapshot(billingClient));
    }
    if (data.vehicleId !== undefined) {
      updatePayload.vehicleId = data.vehicleId;
    }
    if (data.descripcion !== undefined) {
      updatePayload.descripcion = data.descripcion;
    }
    if (data.kilometrajeIngreso !== undefined) {
      updatePayload.kilometrajeIngreso = data.kilometrajeIngreso;
    }
    if (data.fechaIngreso !== undefined) {
      updatePayload.fechaIngreso = toDateOrNull(data.fechaIngreso);
    }
    if (data.fechaEntrega !== undefined) {
      updatePayload.fechaEntrega = toDateOrNull(data.fechaEntrega);
    }

    await workOrder.update(updatePayload, { transaction });

    await recordWorkOrderEvent(
      workOrder.id,
      userId,
      'actualizacion',
      'Datos de la orden actualizados',
      { campos: Object.keys(data) },
      transaction,
    );

    return workOrder.id;
  });

  return getWorkOrderById(workOrderId);
};

export const changeStatus = async (
  id: number,
  nuevoEstado: WorkOrderStatus,
  userId: number,
  motivo?: string | null,
): Promise<WorkOrderPublic> => {
  const workOrderId = await sequelize.transaction(async (transaction) => {
    await assertManagementActionAllowed(userId, transaction);
    const workOrder = await WorkOrder.findByPk(id, {
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });

    if (!workOrder) {
      throw ApiError.notFound('Orden de trabajo no encontrada');
    }

    if (workOrder.estado === nuevoEstado) {
      return workOrder.id;
    }

    if (!isValidWorkOrderTransition(workOrder.estado, nuevoEstado)) {
      throw ApiError.badRequest(
        `Transición inválida: no se puede cambiar de '${workOrder.estado}' a '${nuevoEstado}'`,
      );
    }

    if (nuevoEstado === 'entregada') {
      throw ApiError.badRequest(
        'La entrega debe registrarse mediante el flujo de cierre con receptor y checklist',
      );
    }

    const estadoAnterior = workOrder.estado;
    const updatePayload: Partial<Pick<WorkOrder, 'estado' | 'fechaEntrega' | 'descripcion'>> = {
      estado: nuevoEstado,
    };

    if (nuevoEstado === 'cancelada' && motivo) {
      const cancellationNote = `[CANCELADA: ${motivo}]`;
      updatePayload.descripcion = workOrder.descripcion
        ? `${workOrder.descripcion}\n${cancellationNote}`
        : cancellationNote;
    }

    await workOrder.update(updatePayload, { transaction });

    await recordWorkOrderEvent(
      workOrder.id,
      userId,
      'cambio_estado',
      `Estado cambiado de ${estadoAnterior} a ${nuevoEstado}`,
      { estadoAnterior, nuevoEstado, motivo: motivo ?? null },
      transaction,
    );

    return workOrder.id;
  });

  return getWorkOrderById(workOrderId);
};

export const deliverWorkOrder = async (
  id: number,
  data: DeliverWorkOrderInput,
  userId: number,
): Promise<WorkOrderPublic> => {
  const workOrderId = await sequelize.transaction(async (transaction) => {
    await assertManagementActionAllowed(userId, transaction);
    const workOrder = await WorkOrder.findByPk(id, {
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });

    if (!workOrder) {
      throw ApiError.notFound('Orden de trabajo no encontrada');
    }

    const existingDelivery = await WorkOrderDelivery.findOne({
      where: { workOrderId: id },
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });

    if (workOrder.estado === 'entregada' && existingDelivery) {
      return workOrder.id;
    }

    if (workOrder.estado !== 'finalizada') {
      throw ApiError.badRequest('Solo una orden finalizada puede entregarse al cliente');
    }

    const unresolvedItems = await WorkOrderItem.count({
      where: {
        workOrderId: id,
        estadoOperativo: { [Op.notIn]: ['completado', 'omitido'] },
      },
      transaction,
    });

    if (unresolvedItems > 0) {
      throw ApiError.badRequest(
        'Todos los trabajos y repuestos deben estar completados u omitidos antes de entregar',
      );
    }

    if (
      workOrder.kilometrajeIngreso !== null &&
      data.kilometrajeSalida < workOrder.kilometrajeIngreso
    ) {
      throw ApiError.badRequest(
        `El kilometraje de salida no puede ser menor al de ingreso (${workOrder.kilometrajeIngreso})`,
      );
    }

    const deliveredAt = new Date();
    await WorkOrderDelivery.create(
      {
        workOrderId: id,
        kilometrajeSalida: data.kilometrajeSalida,
        receptorNombre: data.receptorNombre,
        receptorRut: data.receptorRut ?? null,
        receptorTelefono: data.receptorTelefono ?? null,
        checklist: data.checklist,
        conformidad: data.conformidad,
        firmaRecepcion: data.firmaRecepcion,
        observaciones: data.observaciones ?? null,
        deliveredBy: userId,
        deliveredAt,
      },
      { transaction },
    );

    if (workOrder.vehicleId !== null) {
      const vehicle = await Vehicle.findByPk(workOrder.vehicleId, {
        transaction,
        lock: Transaction.LOCK.UPDATE,
      });
      if (vehicle && (vehicle.kilometraje === null || data.kilometrajeSalida > vehicle.kilometraje)) {
        await vehicle.update({ kilometraje: data.kilometrajeSalida }, { transaction });
      }
    }

    await workOrder.update(
      { estado: 'entregada', fechaEntrega: workOrder.fechaEntrega ?? deliveredAt },
      { transaction },
    );

    await recordWorkOrderEvent(
      workOrder.id,
      userId,
      'entrega',
      `Vehículo entregado a ${data.receptorNombre}`,
      { kilometrajeSalida: data.kilometrajeSalida, receptorNombre: data.receptorNombre },
      transaction,
    );

    return workOrder.id;
  });

  return getWorkOrderById(workOrderId);
};

export const createWorkOrderReentry = async (
  sourceId: number,
  data: CreateWorkOrderReentryInput,
  userId: number,
): Promise<WorkOrderPublic> => {
  const newWorkOrderId = await sequelize.transaction(async (transaction) => {
    await assertManagementActionAllowed(userId, transaction);
    const source = await WorkOrder.findByPk(sourceId, {
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });

    if (!source) {
      throw ApiError.notFound('Orden de trabajo no encontrada');
    }
    if (source.estado !== 'entregada') {
      throw ApiError.badRequest('Solo una orden entregada puede originar una garantía o reingreso');
    }

    if (source.clientId !== null) {
      await assertClientExists(
        source.clientId,
        transaction,
        'El cliente de la orden original ya no se encuentra activo',
      );
    }

    let vehicle: Vehicle | null = null;
    if (source.vehicleId !== null) {
      vehicle = await assertVehicleExists(source.vehicleId, transaction);
    }

    const sourceDelivery = await WorkOrderDelivery.findOne({
      where: { workOrderId: source.id },
      transaction,
    });
    const kilometrajeReferencia =
      sourceDelivery?.kilometrajeSalida ?? vehicle?.kilometraje ?? source.kilometrajeIngreso;
    const kilometrajeIngreso = data.kilometrajeIngreso ?? kilometrajeReferencia ?? null;

    if (
      kilometrajeReferencia !== null &&
      kilometrajeIngreso !== null &&
      kilometrajeIngreso < kilometrajeReferencia
    ) {
      throw ApiError.badRequest(
        `El kilometraje del reingreso no puede ser menor al último registrado (${kilometrajeReferencia})`,
      );
    }

    const coberturaGarantia =
      data.tipoIngreso === 'garantia' ? (data.coberturaGarantia ?? true) : false;
    const sourceItems = data.copiarItems
      ? await WorkOrderItem.findAll({
          where: { workOrderId: source.id, estadoOperativo: { [Op.ne]: 'omitido' } },
          order: [['id', 'ASC']],
          transaction,
        })
      : [];
    const copiedItems: WorkOrderItemInput[] = sourceItems.map((item) => ({
      catalogItemId: item.catalogItemId,
      descripcion: item.descripcion,
      cantidad: toNumber(item.cantidad),
      precioUnitario: coberturaGarantia ? 0 : toNumber(item.precioUnitario),
      estadoOperativo: 'pendiente',
      notasOperativas: `Referencia de ${source.codigo}${item.notasOperativas ? `: ${item.notasOperativas}` : ''}`,
    }));

    const codigo = await generateWorkOrderCode(transaction);
    const label = data.tipoIngreso === 'garantia' ? 'GARANTÍA' : 'REINGRESO';
    const workOrder = await WorkOrder.create(
      {
        codigo,
        tipoIngreso: data.tipoIngreso,
        sourceWorkOrderId: source.id,
        coberturaGarantia,
        clientId: source.clientId,
        contactClientId: source.contactClientId,
        billingClientId: source.billingClientId,
        contactName: source.contactName,
        contactRut: source.contactRut,
        contactPhone: source.contactPhone,
        contactEmail: source.contactEmail,
        billingName: source.billingName,
        billingRut: source.billingRut,
        billingType: source.billingType,
        billingPhone: source.billingPhone,
        billingEmail: source.billingEmail,
        billingAddress: source.billingAddress,
        billingRegion: source.billingRegion,
        billingComuna: source.billingComuna,
        vehicleId: source.vehicleId,
        estado: 'borrador',
        descripcion: `[${label} de ${source.codigo}] ${data.motivo}`,
        kilometrajeIngreso,
        fechaIngreso: data.fechaIngreso ? new Date(data.fechaIngreso) : new Date(),
        fechaEntrega: null,
        createdBy: userId,
      },
      { transaction },
    );

    if (copiedItems.length > 0) {
      await WorkOrderItem.bulkCreate(buildItemsPayload(workOrder.id, copiedItems), {
        transaction,
      });
    }
    await createMirrorQuotation(workOrder, copiedItems, userId, transaction);

    const eventType: WorkOrderEventType =
      data.tipoIngreso === 'garantia' ? 'garantia_creada' : 'reingreso_creado';
    await recordWorkOrderEvent(
      source.id,
      userId,
      eventType,
      `${label} creada como ${workOrder.codigo}`,
      { relatedWorkOrderId: workOrder.id, codigo: workOrder.codigo, motivo: data.motivo },
      transaction,
    );
    await recordWorkOrderEvent(
      workOrder.id,
      userId,
      'creacion',
      `${label} creada desde ${source.codigo}`,
      { sourceWorkOrderId: source.id, codigoOrigen: source.codigo, itemsCopiados: copiedItems.length },
      transaction,
    );

    if (
      vehicle &&
      kilometrajeIngreso !== null &&
      (vehicle.kilometraje === null || kilometrajeIngreso > vehicle.kilometraje)
    ) {
      await vehicle.update({ kilometraje: kilometrajeIngreso }, { transaction });
    }

    return workOrder.id;
  });

  return getWorkOrderById(newWorkOrderId);
};

export const listMechanics = async (userId: number): Promise<WorkOrderMechanicPublic[]> => {
  await assertSupervisor(userId);

  const mechanics = await User.findAll({
    attributes: ['id', 'nombre', 'email'],
    include: [
      {
        model: Role,
        as: 'role',
        attributes: [],
        where: { nombre: 'mecanico' },
      },
    ],
    where: { activo: true },
    order: [['nombre', 'ASC']],
  });

  return mechanics.map((mechanic) => ({
    id: mechanic.id,
    nombre: mechanic.nombre,
    email: mechanic.email,
  }));
};

export const assignMechanic = async (
  id: number,
  mechanicId: number | null,
  userId: number,
): Promise<WorkOrderPublic> => {
  await sequelize.transaction(async (transaction) => {
    await assertSupervisor(userId, transaction);
    const workOrder = await WorkOrder.findByPk(id, {
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });
    if (!workOrder) {
      throw ApiError.notFound('Orden de trabajo no encontrada');
    }

    let mechanic: User | null = null;
    if (mechanicId !== null) {
      mechanic = await User.findOne({
        where: { id: mechanicId, activo: true },
        include: [
          {
            model: Role,
            as: 'role',
            attributes: ['nombre'],
            where: { nombre: 'mecanico' },
          },
        ],
        transaction,
      });
      if (!mechanic) {
        throw ApiError.badRequest('El usuario seleccionado no es un mecánico activo');
      }
    }

    const previousMechanicId = workOrder.assignedMechanicId;
    await workOrder.update({ assignedMechanicId: mechanicId }, { transaction });
    await recordWorkOrderEvent(
      id,
      userId,
      'asignacion_mecanico',
      mechanic ? `Orden asignada a ${mechanic.nombre}` : 'Asignación de mecánico retirada',
      { previousMechanicId, mechanicId },
      transaction,
    );
  });

  return getWorkOrderById(id);
};

const assertExecutionAccess = async (
  workOrder: WorkOrder,
  userId: number,
  transaction: Transaction,
): Promise<RoleName> => {
  const role = await getActorRole(userId, transaction);
  if (role === 'mecanico') {
    if (workOrder.assignedMechanicId !== userId) {
      throw ApiError.notFound('Orden de trabajo no encontrada');
    }
    return role;
  }
  if (!SUPERVISOR_ROLES.includes(role)) {
    throw ApiError.forbidden('No tienes permiso para ejecutar trabajos en esta orden');
  }
  return role;
};

export const updateWorkOrderExecution = async (
  id: number,
  data: UpdateWorkOrderExecutionInput,
  userId: number,
): Promise<WorkOrderPublic> => {
  await sequelize.transaction(async (transaction) => {
    const workOrder = await WorkOrder.findByPk(id, {
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });
    if (!workOrder) {
      throw ApiError.notFound('Orden de trabajo no encontrada');
    }
    await assertExecutionAccess(workOrder, userId, transaction);

    if (workOrder.estado === 'entregada' || workOrder.estado === 'cancelada') {
      throw ApiError.badRequest('No se puede registrar ejecución en una orden cerrada');
    }

    const itemUpdates = data.items ?? [];
    if (new Set(itemUpdates.map((item) => item.id)).size !== itemUpdates.length) {
      throw ApiError.badRequest('No se puede actualizar el mismo trabajo más de una vez');
    }

    for (const itemUpdate of itemUpdates) {
      const item = await WorkOrderItem.findOne({
        where: { id: itemUpdate.id, workOrderId: id },
        transaction,
        lock: Transaction.LOCK.UPDATE,
      });
      if (!item) {
        throw ApiError.badRequest('Uno o más trabajos no pertenecen a esta orden');
      }
      if (item.stockConsumido && itemUpdate.estadoOperativo !== 'completado') {
        throw ApiError.badRequest(
          `El repuesto "${item.descripcion}" ya fue consumido y no puede volver a un estado anterior`,
        );
      }

      await item.update(
        {
          estadoOperativo: itemUpdate.estadoOperativo,
          notasOperativas:
            itemUpdate.notasOperativas === undefined
              ? item.notasOperativas
              : itemUpdate.notasOperativas,
        },
        { transaction },
      );
      await consumeCompletedPartStock([item], transaction);
    }

    if (data.reporte) {
      await WorkOrderProgressReport.create(
        {
          workOrderId: id,
          mechanicId: userId,
          porcentaje: data.reporte.porcentaje,
          comentario: data.reporte.comentario,
          bloqueos: data.reporte.bloqueos ?? null,
        },
        { transaction },
      );
    }

    await recordWorkOrderEvent(
      id,
      userId,
      'reporte_avance',
      data.reporte
        ? `Avance reportado: ${data.reporte.porcentaje}%`
        : 'Checklist de trabajos actualizado',
      {
        porcentaje: data.reporte?.porcentaje ?? null,
        itemIds: itemUpdates.map((item) => item.id),
      },
      transaction,
    );
  });

  return getWorkOrderById(id, userId);
};

export const createWorkOrderRequest = async (
  id: number,
  data: CreateWorkOrderRequestInput,
  userId: number,
): Promise<WorkOrderPublic> => {
  await sequelize.transaction(async (transaction) => {
    const workOrder = await WorkOrder.findByPk(id, {
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });
    if (!workOrder) {
      throw ApiError.notFound('Orden de trabajo no encontrada');
    }
    await assertExecutionAccess(workOrder, userId, transaction);
    if (workOrder.estado === 'entregada' || workOrder.estado === 'cancelada') {
      throw ApiError.badRequest('No se pueden crear solicitudes en una orden cerrada');
    }

    let catalogItemId: number | null = null;
    let workOrderItemId: number | null = null;
    let cantidad: number | null = null;
    let precioSugerido: number | null = null;
    let description: string;

    if (data.tipo === 'repuesto') {
      const catalogItem = await CatalogItem.findByPk(data.catalogItemId, { transaction });
      if (!catalogItem || catalogItem.tipo !== 'parte') {
        throw ApiError.badRequest('El repuesto solicitado no existe o no maneja inventario');
      }
      catalogItemId = catalogItem.id;
      cantidad = data.cantidad;
      description = `Solicitud de ${data.cantidad} unidad(es) de ${catalogItem.nombre}`;
    } else {
      const item = await WorkOrderItem.findOne({
        where: { id: data.workOrderItemId, workOrderId: id },
        transaction,
      });
      if (!item) {
        throw ApiError.badRequest('El servicio indicado no pertenece a esta orden');
      }
      if (data.precioSugerido <= toNumber(item.precioUnitario)) {
        throw ApiError.badRequest('El precio sugerido debe ser mayor al precio actual');
      }
      workOrderItemId = item.id;
      precioSugerido = data.precioSugerido;
      description = `Sugerencia de aumento para ${item.descripcion}`;
    }

    await WorkOrderRequest.create(
      {
        workOrderId: id,
        workOrderItemId,
        catalogItemId,
        requestedBy: userId,
        tipo: data.tipo,
        estado: 'pendiente',
        motivo: data.motivo,
        cantidad,
        precioSugerido,
        precioAprobado: null,
        reviewedBy: null,
        reviewNote: null,
        reviewedAt: null,
      },
      { transaction },
    );
    await recordWorkOrderEvent(
      id,
      userId,
      'solicitud_creada',
      description,
      { tipo: data.tipo, catalogItemId, workOrderItemId, cantidad, precioSugerido },
      transaction,
    );
  });

  return getWorkOrderById(id, userId);
};

const recalculateMirrorQuotation = async (
  quotation: Quotation,
  transaction: Transaction,
): Promise<void> => {
  const items = await QuotationItem.findAll({
    where: { quotationId: quotation.id },
    transaction,
  });
  const total = items.reduce((sum, item) => sum + toNumber(item.subtotal), 0);
  const paid = toNumber(quotation.pagado);
  const estadoPago: QuotationStatus =
    paid <= 0 ? 'por_pagar' : paid >= total ? 'total' : 'parcial';
  await quotation.update({ subtotal: total, total, estadoPago }, { transaction });
};

export const reviewWorkOrderRequest = async (
  id: number,
  requestId: number,
  data: ReviewWorkOrderRequestInput,
  userId: number,
): Promise<WorkOrderPublic> => {
  await sequelize.transaction(async (transaction) => {
    await assertSupervisor(userId, transaction);
    const request = await WorkOrderRequest.findOne({
      where: { id: requestId, workOrderId: id },
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });
    if (!request) {
      throw ApiError.notFound('Solicitud de taller no encontrada');
    }
    if (request.estado !== 'pendiente') {
      throw ApiError.badRequest('Esta solicitud ya fue revisada');
    }

    let approvedPrice: number | null = null;
    if (data.decision === 'aprobar') {
      const quotation = await Quotation.findOne({
        where: { workOrderId: id },
        transaction,
        lock: Transaction.LOCK.UPDATE,
      });

      if (request.tipo === 'repuesto') {
        if (request.catalogItemId === null || request.cantidad === null) {
          throw ApiError.badRequest('La solicitud de repuesto está incompleta');
        }
        const catalogItem = await CatalogItem.findByPk(request.catalogItemId, { transaction });
        if (!catalogItem || catalogItem.tipo !== 'parte') {
          throw ApiError.badRequest('El repuesto solicitado ya no está disponible');
        }
        approvedPrice = data.precioAprobado ?? toNumber(catalogItem.precio);
        const quantity = toNumber(request.cantidad);
        await WorkOrderItem.create(
          {
            workOrderId: id,
            catalogItemId: catalogItem.id,
            descripcion: catalogItem.nombre,
            cantidad: quantity,
            precioUnitario: approvedPrice,
            subtotal: quantity * approvedPrice,
            estadoOperativo: 'pendiente',
            notasOperativas: `Agregado por solicitud #${request.id}`,
            stockConsumido: false,
            stockConsumidoCantidad: 0,
            stockConsumidoAt: null,
          },
          { transaction },
        );
        if (quotation) {
          await QuotationItem.create(
            {
              quotationId: quotation.id,
              catalogItemId: catalogItem.id,
              descripcion: catalogItem.nombre,
              cantidad: quantity,
              precioUnitario: approvedPrice,
              subtotal: quantity * approvedPrice,
              estadoOperativo: 'pendiente',
              notasOperativas: `Agregado por solicitud de taller #${request.id}`,
            },
            { transaction },
          );
          await recalculateMirrorQuotation(quotation, transaction);
        }
      } else {
        if (request.workOrderItemId === null || request.precioSugerido === null) {
          throw ApiError.badRequest('La solicitud de aumento está incompleta');
        }
        const item = await WorkOrderItem.findOne({
          where: { id: request.workOrderItemId, workOrderId: id },
          transaction,
          lock: Transaction.LOCK.UPDATE,
        });
        if (!item) {
          throw ApiError.badRequest('El servicio solicitado ya no existe');
        }
        approvedPrice = data.precioAprobado ?? toNumber(request.precioSugerido);
        if (approvedPrice <= toNumber(item.precioUnitario)) {
          throw ApiError.badRequest('El precio aprobado debe ser mayor al precio actual');
        }
        await item.update(
          {
            precioUnitario: approvedPrice,
            subtotal: toNumber(item.cantidad) * approvedPrice,
          },
          { transaction },
        );
        if (quotation) {
          const quotationItem = await QuotationItem.findOne({
            where: {
              quotationId: quotation.id,
              descripcion: item.descripcion,
              ...(item.catalogItemId === null ? {} : { catalogItemId: item.catalogItemId }),
            },
            order: [['id', 'ASC']],
            transaction,
            lock: Transaction.LOCK.UPDATE,
          });
          if (quotationItem) {
            await quotationItem.update(
              {
                precioUnitario: approvedPrice,
                subtotal: toNumber(quotationItem.cantidad) * approvedPrice,
              },
              { transaction },
            );
          }
          await recalculateMirrorQuotation(quotation, transaction);
        }
      }
    }

    await request.update(
      {
        estado: data.decision === 'aprobar' ? 'aprobada' : 'rechazada',
        precioAprobado: approvedPrice,
        reviewedBy: userId,
        reviewNote: data.comentario ?? null,
        reviewedAt: new Date(),
      },
      { transaction },
    );
    await recordWorkOrderEvent(
      id,
      userId,
      'solicitud_revisada',
      `Solicitud #${request.id} ${data.decision === 'aprobar' ? 'aprobada' : 'rechazada'}`,
      { requestId: request.id, decision: data.decision, approvedPrice },
      transaction,
    );
  });

  return getWorkOrderById(id);
};

export const deleteWorkOrder = async (id: number, userId: number): Promise<void> => {
  await sequelize.transaction(async (transaction) => {
    await assertManagementActionAllowed(userId, transaction);
    const workOrder = await WorkOrder.findByPk(id, {
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });
    if (!workOrder) {
      throw ApiError.notFound('Orden de trabajo no encontrada');
    }

    if (workOrder.estado !== 'borrador' && workOrder.estado !== 'cancelada') {
      throw ApiError.badRequest('No se puede eliminar una orden activa');
    }

    await recordWorkOrderEvent(
      workOrder.id,
      userId,
      'eliminacion',
      'Orden de trabajo eliminada de los listados activos',
      { estado: workOrder.estado },
      transaction,
    );
    await workOrder.destroy({ transaction });
  });
};
