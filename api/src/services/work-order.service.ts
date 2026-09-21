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
import { User } from '../models/User.js';
import { Vehicle } from '../models/Vehicle.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderDelivery } from '../models/WorkOrderDelivery.js';
import { WorkOrderInspection } from '../models/WorkOrderInspection.js';
import { WorkOrderInspectionPhoto } from '../models/WorkOrderInspectionPhoto.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
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
  createdAt: Date;
  updatedAt: Date;
  client?: WorkOrderClientPublic | null;
  vehicle?: WorkOrderVehiclePublic | null;
  creator?: WorkOrderCreatorPublic | null;
  items?: WorkOrderItemPublic[];
  quotation?: WorkOrderQuotationPublic | null;
  contact: WorkOrderContactPublic | null;
  billing: WorkOrderBillingPublic | null;
  inspection?: WorkOrderInspectionPublic | null;
  delivery?: WorkOrderDeliveryPublic | null;
  sourceWorkOrder?: WorkOrderRelationPublic | null;
  relatedWorkOrders?: WorkOrderRelationPublic[];
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
});

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
    if (item.estadoOperativo !== 'completado' || item.catalogItemId === null) {
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

const getCompleteWorkOrder = async (
  id: number,
  transaction?: Transaction,
): Promise<WorkOrder> => {
  const workOrder = await WorkOrder.findByPk(id, {
    include: [
      clientInclude,
      vehicleInclude,
      creatorInclude,
      itemsInclude,
      inspectionInclude,
      quotationInclude,
      deliveryInclude,
      sourceWorkOrderInclude,
      relatedWorkOrdersInclude,
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
): Promise<ListWorkOrdersResult> => {
  const pagination = getPagination(query);
  const where: WorkOrderWhere = {};

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
    include: [clientInclude, vehicleInclude],
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

export const getWorkOrderById = async (id: number): Promise<WorkOrderPublic> => {
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

    return workOrder.id;
  });

  return getWorkOrderById(workOrderId);
};

export const changeStatus = async (
  id: number,
  nuevoEstado: WorkOrderStatus,
  _userId: number,
  motivo?: string | null,
): Promise<WorkOrderPublic> => {
  const workOrderId = await sequelize.transaction(async (transaction) => {
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

export const deleteWorkOrder = async (id: number): Promise<void> => {
  const workOrder = await WorkOrder.findByPk(id);
  if (!workOrder) {
    throw ApiError.notFound('Orden de trabajo no encontrada');
  }

  if (workOrder.estado !== 'borrador' && workOrder.estado !== 'cancelada') {
    throw ApiError.badRequest('No se puede eliminar una orden activa');
  }

  await workOrder.destroy();
};
