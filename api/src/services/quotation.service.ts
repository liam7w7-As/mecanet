import { randomUUID } from 'node:crypto';

import { getQuotationGrossTotal } from '@unithor/shared';
import { col, literal, Op, Transaction, where as sequelizeWhere } from 'sequelize';


import { enqueueCustomerEmail, enqueueWorkOrderProgress } from './customer-email-queue.service.js';
import { calculateDpWorkPricing } from './dp-configuration.service.js';
import { notifyByType } from './notification.service.js';
import { preserveLineDiscounts, priceQuotation } from './quotation-pricing.js';
import { propagateLinkedSalesAccess } from './sales-access-grant.service.js';
import { assertSalesWorkOrderAccess, getSalesScope, quotationWhere, scopeSalesAssociations, type SalesScope } from './sales-access.service.js';
import { consumeForWorkOrder, restoreForWorkOrder } from './warehouse.service.js';
import { ensureAccRequestsForItems } from './work-order-division-actions.js';
import { normalizeDivisionMetadata } from './work-order-division-rules.js';
import { assertDpItemStatus, ensureDpStagesForItems, getDpStages } from './work-order-dp-state.js';
import { getInspectionPhoto } from './work-order-inspection-photo.service.js';
import { assertWorkItemsRemovable, ensureQuotationItemLinks, itemIdentity } from './work-order-item-links.js';
import { recordChecklistStatusChange } from './work-order-labor-events.js';
import { closeWorkOrderTimers } from './work-order-labor-sessions.js';
import { assertChiefPriceEditsAllowed } from './work-order-price-policy.js';
import { invalidateItemQuality, revokeFinalQuality } from './work-order-quality-state.js';
import { createWorkOrderInTransaction, getWorkOrderById, type WorkOrderPublic } from './work-order.service.js';
import { withWorkshopTransaction } from './workshop-transaction.js';
import { sequelize } from '../config/database.js';
import { CatalogItem } from '../models/CatalogItem.js';
import { Client } from '../models/Client.js';
import { Payment } from '../models/Payment.js';
import { Quotation } from '../models/Quotation.js';
import { QuotationItem } from '../models/QuotationItem.js';
import { User } from '../models/User.js';
import { Vehicle } from '../models/Vehicle.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderInspection } from '../models/WorkOrderInspection.js';
import { WorkOrderInspectionPhoto } from '../models/WorkOrderInspectionPhoto.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
import { ApiError } from '../utils/ApiError.js';
import { formatClpAmount } from '../utils/formatters.js';
import { generateQuotationCode } from '../utils/generateCode.js';
import { getPagination } from '../utils/paginate.js';
import { plateSearch } from '../utils/plate-search.js';

import type { InspectionPhotoFile, InspectionPhotoPublic } from './work-order-inspection-photo.service.js';
import type {
  ConvertQuotationInput,
  CatalogType,
  CatalogDivision,
  CatalogSubtype,
  UnitMeasure,
  CreateQuotationInput,
  ItemOperationalStatus,
  QuotationItemInput,
  QuotationQueryInput,
  QuotationStatus,
  UpdateQuotationInput,
  WorkOrderInspectionPhotoSlot,
  DiscountType,
  DpWorkQuote,
  QuotationPaymentMethod,
} from '@unithor/shared';
import type { InferAttributes, WhereOptions } from 'sequelize';

interface QuotationClientPublic {
  id: number;
  rut: string | null;
  nombre: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
}

interface QuotationVehiclePublic {
  id: number;
  patente: string;
  marca: string | null;
  modelo: string | null;
}

interface QuotationUserPublic {
  id: number;
  nombre: string;
  email: string;
}

interface QuotationWorkOrderPublic {
  id: number;
  codigo: string;
  estado: string;
  updatedAt: Date;
  inspectionPhotos?: InspectionPhotoPublic[];
}

interface QuotationItemCatalogPublic {
  id: number;
  tipo: import('@unithor/shared').CatalogType;
  codigo: string | null;
  nombre: string;
}

interface QuotationItemPublic {
  dpPricingSnapshot?: DpWorkQuote | null;
  id: number;
  catalogItemId: number | null;
  descripcion: string;
  tipoLinea: CatalogType;
  division?: import('@unithor/shared').CatalogDivision | null;
  subtipo?: import('@unithor/shared').CatalogSubtype | null;
  unidadMedida: UnitMeasure;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  descuentoTipo: DiscountType | null;
  descuentoValor: number;
  estadoOperativo: ItemOperationalStatus;
  notasOperativas: string | null;
  esAPedido?: boolean;
  catalogItem?: QuotationItemCatalogPublic | null;
}

export interface QuotationPublic {
  id: number;
  codigo: string;
  workOrderId: number | null;
  clientId: number | null;
  vehicleId: number | null;
  asesorId: number | null;
  estadoPago: QuotationStatus;
  subtotal: number;
  total: number;
  pagado: number;
  notas: string | null;
  formaPago: QuotationPaymentMethod;
  disponibilidadTrabajo: string | null;
  validezDias: number;
  descuentoTipo: DiscountType | null;
  descuentoValor: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  client?: QuotationClientPublic | null;
  billing?: WorkOrderPublic['billing'];
  vehicle?: QuotationVehiclePublic | null;
  asesor?: QuotationUserPublic | null;
  workOrder?: QuotationWorkOrderPublic | null;
  items?: QuotationItemPublic[];
}

export interface ListQuotationsResult {
  items: QuotationPublic[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ConvertQuotationResult {
  quotation: QuotationPublic;
  workOrder: WorkOrderPublic;
}

type QuotationWhere = WhereOptions<InferAttributes<Quotation>> & {
  [Op.or]?: WhereOptions<InferAttributes<Quotation>>[];
  [Op.and]?: WhereOptions<InferAttributes<Quotation>>[];
};

const clientInclude = {
  model: Client,
  attributes: ['id', 'rut', 'nombre', 'telefono', 'email', 'direccion'],
};

const vehicleInclude = {
  model: Vehicle,
  attributes: ['id', 'patente', 'marca', 'modelo'],
};

const asesorInclude = {
  model: User,
  as: 'asesor',
  attributes: ['id', 'nombre', 'email'],
};

const workOrderInclude = {
  model: WorkOrder,
  attributes: ['id', 'codigo', 'estado', 'updatedAt', 'billingClientId', 'billingName', 'billingRut',
    'billingType', 'billingPhone', 'billingEmail', 'billingAddress', 'billingRegion', 'billingComuna'],
};

const itemsInclude = {
  model: QuotationItem,
  attributes: [
    'id',
    'catalogItemId',
    'descripcion',
    'tipoLinea',
    'division',
    'subtipo',
    'unidadMedida',
    'cantidad',
    'precioUnitario',
    'dpPricingSnapshot',
    'subtotal',
    'descuentoTipo',
    'descuentoValor',
    'estadoOperativo',
    'notasOperativas',
  ],
  include: [
    {
      model: CatalogItem,
      attributes: ['id', 'tipo', 'codigo', 'nombre'],
    },
  ],
};

const numberValue = (value: number | string): number => Number(value);

const FINANCIAL_QUOTATION_STATUSES = new Set<QuotationStatus>([
  'por_pagar',
  'parcial',
  'total',
]);

const getFinancialQuotationStatus = (pagado: number, netoTotal: number): QuotationStatus => {
  if (pagado <= 0) return 'por_pagar';
  // El estado se cierra cuando se cubre el total con IVA, no solo el neto.
  if (pagado >= getQuotationGrossTotal(netoTotal)) return 'total';
  return 'parcial';
};

const toQuotationPublic = (quotation: Quotation): QuotationPublic => ({
  id: quotation.id,
  codigo: quotation.codigo,
  workOrderId: quotation.workOrderId,
  clientId: quotation.clientId,
  vehicleId: quotation.vehicleId,
  asesorId: quotation.asesorId,
  estadoPago: quotation.estadoPago,
  archivedAt: quotation.archivedAt ?? null,
  subtotal: numberValue(quotation.subtotal),
  total: numberValue(quotation.total),
  pagado: numberValue(quotation.pagado),
  notas: quotation.notas,
  formaPago: quotation.formaPago,
  disponibilidadTrabajo: quotation.disponibilidadTrabajo,
  validezDias: quotation.validezDias,
  descuentoTipo: quotation.descuentoTipo,
  descuentoValor: numberValue(quotation.descuentoValor),
  createdAt: quotation.createdAt,
  updatedAt: quotation.updatedAt,
  client: quotation.client
    ? {
        id: quotation.client.id,
        rut: quotation.client.rut,
        nombre: quotation.client.nombre,
        telefono: quotation.client.telefono,
        email: quotation.client.email,
        direccion: quotation.client.direccion,
      }
    : quotation.clientId === null
      ? null
      : undefined,
  vehicle: quotation.vehicle
    ? {
        id: quotation.vehicle.id,
        patente: quotation.vehicle.patente,
        marca: quotation.vehicle.marca,
        modelo: quotation.vehicle.modelo,
      }
    : quotation.vehicleId === null
      ? null
      : undefined,
  asesor: quotation.asesor
    ? {
        id: quotation.asesor.id,
        nombre: quotation.asesor.nombre,
        email: quotation.asesor.email,
      }
    : quotation.asesorId === null
      ? null
      : undefined,
  billing: quotation.workOrder?.billingName ? {
    clientId: quotation.workOrder.billingClientId,
    nombre: quotation.workOrder.billingName,
    rut: quotation.workOrder.billingRut,
    tipo: quotation.workOrder.billingType,
    telefono: quotation.workOrder.billingPhone,
    email: quotation.workOrder.billingEmail,
    direccion: quotation.workOrder.billingAddress,
    region: quotation.workOrder.billingRegion,
    comuna: quotation.workOrder.billingComuna,
  } : null,
  workOrder: quotation.workOrder
    ? {
        id: quotation.workOrder.id,
        codigo: quotation.workOrder.codigo,
        estado: quotation.workOrder.estado,
        updatedAt: quotation.workOrder.updatedAt,
        inspectionPhotos: quotation.workOrder.inspection?.photos?.map((photo) => ({
          id: photo.id,
          slot: photo.slot,
          mimeType: photo.mimeType,
          sizeBytes: photo.sizeBytes,
          uploadedBy: photo.uploadedBy,
          createdAt: photo.createdAt,
          updatedAt: photo.updatedAt,
          url: `/api/quotations/${quotation.id}/inspection/photos/${photo.slot}`,
        })),
      }
    : quotation.workOrderId === null
      ? null
      : undefined,
  items: quotation.items
    ?.slice()
    .sort((left, right) => left.id - right.id)
    .map((item) => ({
      id: item.id,
      catalogItemId: item.catalogItemId,
      descripcion: item.descripcion,
      tipoLinea: item.tipoLinea,
      division: item.division ?? null,
      subtipo: item.subtipo ?? null,
      esAPedido: item.subtipo === 'a_pedido',
      unidadMedida: item.unidadMedida,
      cantidad: numberValue(item.cantidad),
      precioUnitario: numberValue(item.precioUnitario),
      dpPricingSnapshot: item.dpPricingSnapshot ?? null,
      subtotal: numberValue(item.subtotal),
      descuentoTipo: item.descuentoTipo,
      descuentoValor: numberValue(item.descuentoValor),
      estadoOperativo: item.estadoOperativo,
      notasOperativas: item.notasOperativas,
      catalogItem: item.catalogItem
        ? {
            id: item.catalogItem.id,
            tipo: item.catalogItem.tipo,
            codigo: item.catalogItem.codigo,
            nombre: item.catalogItem.nombre,
          }
        : null,
    })),
});

type PricedQuotationItemInput = QuotationItemInput & { dpPricingSnapshot?: DpWorkQuote | null };

const buildItemsPayload = (
  quotationId: number,
  items: Array<PricedQuotationItemInput & { workOrderItemId?: number | null }>,
): Array<{
  quotationId: number;
  workOrderItemId: number | null;
  catalogItemId: number | null;
  descripcion: string;
  tipoLinea: CatalogType;
  division: CatalogDivision;
  subtipo: CatalogSubtype;
  unidadMedida: UnitMeasure;
  cantidad: number;
  precioUnitario: number;
  dpPricingSnapshot: DpWorkQuote | null;
  subtotal: number;
  descuentoTipo: DiscountType | null;
  descuentoValor: number;
  estadoOperativo: ItemOperationalStatus;
  notasOperativas: string | null;
}> => {
  const pricing = priceQuotation(items);
  return items.map((item, index) => {
    const cantidad = Number(item.cantidad);
    const precioUnitario = Number(item.precioUnitario);

    return {
      quotationId,
      workOrderItemId: item.workOrderItemId ?? null,
      catalogItemId: item.catalogItemId ?? null,
      descripcion: item.descripcion,
      tipoLinea: item.tipoLinea,
      ...normalizeDivisionMetadata(item),
      unidadMedida: item.unidadMedida,
      cantidad,
      precioUnitario,
      dpPricingSnapshot: item.dpPricingSnapshot ?? null,
      subtotal: pricing.lines[index].subtotal,
      descuentoTipo: item.descuentoTipo ?? null,
      descuentoValor: Number(item.descuentoValor ?? 0),
      estadoOperativo: item.estadoOperativo ?? 'pendiente',
      notasOperativas: item.notasOperativas ?? null,
    };
  });
};

const buildWorkOrderItemsPayload = (
  workOrderId: number,
  items: QuotationItem[],
): Array<{
  workOrderId: number;
  catalogItemId: number | null;
  descripcion: string;
  tipoLinea: CatalogType;
  division: CatalogDivision;
  subtipo: CatalogSubtype;
  esAPedido: boolean;
  unidadMedida: UnitMeasure;
  cantidad: number;
  precioUnitario: number;
  dpPricingSnapshot: DpWorkQuote | null;
  subtotal: number;
  estadoOperativo: ItemOperationalStatus;
  notasOperativas: string | null;
}> =>
  items.map((item) => {
    const cantidad = Number(item.cantidad);
    const precioUnitario = Number(item.precioUnitario);

    return {
      workOrderId,
      catalogItemId: item.catalogItemId ?? null,
      descripcion: item.descripcion,
      tipoLinea: item.tipoLinea,
      ...normalizeDivisionMetadata(item),
      unidadMedida: item.unidadMedida,
      cantidad,
      precioUnitario,
      dpPricingSnapshot: item.dpPricingSnapshot ?? null,
      subtotal: cantidad * precioUnitario,
      estadoOperativo: item.estadoOperativo ?? 'pendiente',
      notasOperativas: item.notasOperativas ?? null,
    };
  });

const restoreConsumedWorkOrderStock = async (
  items: WorkOrderItem[],
  transaction: Transaction,
  userId: number,
  referencia: string,
): Promise<void> => {
  for (const item of items) {
    if (!item.stockConsumido || item.catalogItemId === null || item.stockConsumidoCantidad <= 0) {
      continue;
    }

    await restoreForWorkOrder(
      {
        catalogItemId: item.catalogItemId,
        cantidad: item.stockConsumidoCantidad,
        warehouseId: item.stockConsumidoWarehouseId ?? null,
        referencia,
        motivo: `Devolución por sincronización comercial de ${referencia}`,
        userId,
      },
      transaction,
    );
  }
};

const consumeCompletedWorkOrderPartStock = async (
  items: WorkOrderItem[],
  transaction: Transaction,
  userId: number,
  referencia: string,
): Promise<void> => {
  for (const item of items) {
    if (
      item.estadoOperativo !== 'completado' ||
      item.catalogItemId === null ||
      item.stockConsumido
    ) {
      continue;
    }

    const catalogItem = await CatalogItem.findByPk(item.catalogItemId, {
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });
    if (!catalogItem || catalogItem.tipo !== 'parte') {
      continue;
    }

    const units = Number(item.cantidad);
    if (!Number.isInteger(units)) {
      throw ApiError.badRequest(
        `La cantidad del repuesto "${item.descripcion}" debe ser un número entero para descontar stock`,
      );
    }

    const consumption = await consumeForWorkOrder(
      {
        catalogItemId: catalogItem.id,
        cantidad: units,
        referencia,
        motivo: `Consumo en ${referencia} - ${item.descripcion}`.slice(0, 255),
        userId,
      },
      transaction,
    );

    await item.update(
      {
        stockConsumido: true,
        stockConsumidoCantidad: units,
        stockConsumidoAt: new Date(),
        stockConsumidoWarehouseId: consumption.warehouseId,
      },
      { transaction },
    );
  }
};

const syncLinkedWorkOrderFromQuotation = async (
  quotation: Quotation,
  userId: number,
  transaction: Transaction,
): Promise<void> => {
  if (quotation.workOrderId === null) {
    return;
  }

  await assertSalesWorkOrderAccess(quotation.workOrderId, userId, transaction);

  const workOrder = await WorkOrder.findByPk(quotation.workOrderId, {
    transaction,
    lock: Transaction.LOCK.UPDATE,
  });
  if (!workOrder) {
    throw ApiError.badRequest('La orden de trabajo vinculada ya no existe');
  }
  if (workOrder.estado === 'entregada' || workOrder.estado === 'cancelada') {
    throw ApiError.badRequest('No se puede sincronizar una orden entregada o cancelada');
  }

  const { quotationItems, workOrderItems: existingItems } = await ensureQuotationItemLinks(
    quotation.id, workOrder.id, transaction,
  );
  const linkedIds = new Set(quotationItems.map((item) => item.workOrderItemId));
  const removed = existingItems.filter((item) => !linkedIds.has(item.id));
  if (removed.some((item) => item.entregadoBodega || item.recibidoTaller)) {
    throw ApiError.badRequest('No se puede eliminar un repuesto entregado por bodega sin registrar antes su devolución');
  }
  await assertWorkItemsRemovable(removed, transaction);
  await restoreConsumedWorkOrderStock(removed, transaction, userId, workOrder.codigo);
  if (removed.length > 0) {
    await revokeFinalQuality(workOrder.id, userId, 'Servicios retirados desde la cotización', transaction);
    await WorkOrderItem.destroy({ where: { id: removed.map((item) => item.id) }, transaction });
  }
  const persisted: WorkOrderItem[] = [];
  const createdItems: WorkOrderItem[] = [];
  let completedChanged = false;
  for (const line of quotationItems) {
    const payload = buildWorkOrderItemsPayload(workOrder.id, [line])[0];
    const existing = existingItems.find((item) => item.id === line.workOrderItemId);
    if (existing) {
      if (payload.division !== 'DP') payload.dpPricingSnapshot = null;
      const stockChanged = existing.catalogItemId !== payload.catalogItemId || existing.tipoLinea !== payload.tipoLinea || Number(existing.cantidad) !== Number(payload.cantidad);
      if (stockChanged && (existing.entregadoBodega || existing.recibidoTaller)) {
        throw ApiError.badRequest('No se puede cambiar el repuesto ni la cantidad de una entrega física sin registrar antes su devolución');
      }
      if (existing.division === 'DP') await assertDpItemStatus(existing, payload.estadoOperativo, transaction);
      if (existing.division !== 'DP' && payload.division === 'DP') payload.estadoOperativo = 'pendiente';
      if (existing.division === 'DP' && (payload.division !== 'DP' || existing.catalogItemId !== payload.catalogItemId || existing.tipoLinea !== payload.tipoLinea)) {
        const stages = await getDpStages(existing.id, transaction);
        if (stages.some((stage) => stage.assignedUserId != null || stage.status !== 'pendiente' || stage.startedAt != null || stage.completedAt != null || Boolean(stage.note?.trim()))) {
          throw ApiError.badRequest('No se puede reclasificar un trabajo D&P que ya tiene asignaciones o historial de etapas');
        }
      }
      if (existing.estadoOperativo !== 'completado' && payload.estadoOperativo === 'completado') completedChanged = true;
      if (existing.catalogItemId !== payload.catalogItemId || existing.tipoLinea !== payload.tipoLinea) {
        await assertWorkItemsRemovable([existing], transaction);
      }
      const previousStatus = existing.estadoOperativo;
      const technicalChanged = existing.descripcion !== payload.descripcion || Number(existing.cantidad) !== Number(payload.cantidad) || existing.catalogItemId !== payload.catalogItemId || existing.tipoLinea !== payload.tipoLinea || existing.unidadMedida !== payload.unidadMedida || existing.notasOperativas !== payload.notasOperativas || existing.division !== payload.division || existing.subtipo !== payload.subtipo || existing.esAPedido !== payload.esAPedido;
      if (technicalChanged) await invalidateItemQuality(existing, userId, 'Contenido del servicio actualizado desde la cotización', transaction);
      if (stockChanged) await restoreConsumedWorkOrderStock([existing], transaction, userId, workOrder.codigo);
      await existing.update({
        ...payload,
        ...(stockChanged ? { stockConsumido: false, stockConsumidoCantidad: 0, stockConsumidoAt: null, stockConsumidoWarehouseId: null } : {}),
      }, { transaction });
      await recordChecklistStatusChange(existing, previousStatus, userId, transaction);
      if (existing.estadoOperativo === 'completado' || existing.estadoOperativo === 'omitido') {
        await closeWorkOrderTimers(workOrder.id, transaction, existing.id);
      }
      persisted.push(existing);
    } else {
      if (payload.division === 'DP') payload.estadoOperativo = 'pendiente';
      await revokeFinalQuality(workOrder.id, userId, 'Se agregaron trabajos desde la cotización', transaction);
      const catalogItem = payload.catalogItemId === null ? null : await CatalogItem.findByPk(payload.catalogItemId, { transaction });
      const created = await WorkOrderItem.create({
        ...payload,
        horasHombreEstimadas: catalogItem?.horasHombreEstandar == null ? null : Number(catalogItem.horasHombreEstandar),
      }, { transaction });
      await line.update({ workOrderItemId: created.id }, { transaction });
      persisted.push(created);
      createdItems.push(created);
    }
    if (line.estadoOperativo !== payload.estadoOperativo) {
      await line.update({ estadoOperativo: payload.estadoOperativo }, { transaction });
    }
  }
  await ensureDpStagesForItems(workOrder.id, persisted, transaction);
  if (createdItems.length) await ensureAccRequestsForItems(workOrder, createdItems, userId, transaction);
  await consumeCompletedWorkOrderPartStock(persisted, transaction, userId, workOrder.codigo);
  if (completedChanged) await enqueueWorkOrderProgress(workOrder.id, userId, transaction, `quotation-progress:${quotation.id}:${randomUUID()}`);
};

const assertClientExists = async (clientId: number, transaction: Transaction): Promise<Client> => {
  const client = await Client.findByPk(clientId, { transaction });
  if (!client) {
    throw ApiError.badRequest('El cliente especificado no existe');
  }
  return client;
};

const assertVehicleExists = async (vehicleId: number, transaction: Transaction): Promise<Vehicle> => {
  const vehicle = await Vehicle.findByPk(vehicleId, { transaction });
  if (!vehicle) {
    throw ApiError.badRequest('El vehículo especificado no existe');
  }

  return vehicle;
};

const normalizeQuotationItems = async <T extends PricedQuotationItemInput>(
  items: T[],
  transaction: Transaction,
  previous: QuotationItem[] = [],
): Promise<Array<T & { division: CatalogDivision; subtipo: CatalogSubtype; dpPricingSnapshot: DpWorkQuote | null }>> => {
  const catalogItemIds = [
    ...new Set(
      items
        .map((item) => item.catalogItemId)
        .filter(
          (catalogItemId): catalogItemId is number =>
            catalogItemId !== undefined && catalogItemId !== null,
        ),
    ),
  ];

  const catalogItems = catalogItemIds.length === 0 ? [] : await CatalogItem.findAll({
    where: { id: catalogItemIds }, transaction,
    attributes: ['id', 'tipo', 'division', 'subtipo'],
  });
  if (catalogItems.length !== catalogItemIds.length) {
    throw ApiError.badRequest('Uno o más ítems de catálogo no existen');
  }
  const catalogById = new Map(catalogItems.map((item) => [item.id, item]));
  const remaining = [...previous];
  const normalized: Array<T & { division: CatalogDivision; subtipo: CatalogSubtype; dpPricingSnapshot: DpWorkQuote | null }> = [];
  for (const item of items) {
    const matches = remaining.filter((old) => item.id !== undefined
      ? old.id === item.id : itemIdentity(old) === itemIdentity(item));
    const old = matches.length === 1 ? matches[0] : undefined;
    if (old) remaining.splice(remaining.indexOf(old), 1);
    const keepMetadata = old && old.catalogItemId === (item.catalogItemId ?? null) && old.tipoLinea === item.tipoLinea;
    const metadata = normalizeDivisionMetadata({
      tipoLinea: item.tipoLinea,
      division: item.division ?? (keepMetadata && item.subtipo === undefined ? old.division : undefined),
      subtipo: item.subtipo ?? (keepMetadata && item.division === undefined ? old.subtipo : undefined),
    }, item.catalogItemId == null ? undefined : catalogById.get(item.catalogItemId));
    const catalog = item.catalogItemId == null ? undefined : catalogById.get(item.catalogItemId);
    if (item.dpPricing && (metadata.division !== 'DP' || item.tipoLinea === 'parte' || catalog?.tipo === 'parte')) {
      throw ApiError.badRequest('El cálculo D&P solo corresponde a servicios de la división D&P');
    }
    const dpPricingSnapshot = item.dpPricing
      ? await calculateDpWorkPricing(item.dpPricing, transaction)
      : metadata.division === 'DP'
        ? (item.dpPricingSnapshot !== undefined ? item.dpPricingSnapshot : old?.dpPricingSnapshot ?? null)
        : null;
    normalized.push({
      ...item,
      ...metadata,
      dpPricingSnapshot,
      ...(item.dpPricing && dpPricingSnapshot ? { precioUnitario: dpPricingSnapshot.precioUnitario } : {}),
      tipoLinea: metadata.division === 'ACC' ? 'parte' as const : metadata.subtipo === 'especifico' ? 'especifico' as const : 'estandar' as const,
    });
  }
  return normalized;
};

const getCompleteQuotation = async (
  id: number,
  transaction?: Transaction,
  scope?: SalesScope,
): Promise<Quotation> => {
  const quotation = await Quotation.findOne({
    where: { id, ...quotationWhere(scope) } as WhereOptions<InferAttributes<Quotation>>,
    include: scopeSalesAssociations([
      clientInclude,
      vehicleInclude,
      asesorInclude,
      {
        ...workOrderInclude,
        include: [{
          model: WorkOrderInspection,
          attributes: ['id'],
          include: [{
            model: WorkOrderInspectionPhoto,
            attributes: ['id', 'slot', 'mimeType', 'sizeBytes', 'uploadedBy', 'createdAt', 'updatedAt'],
          }],
        }],
      },
      itemsInclude,
    ], scope),
    transaction,
  });

  if (!quotation) {
    throw ApiError.notFound('Cotización no encontrada');
  }

  return quotation;
};

const copyWorkOrderItems = (items: WorkOrderItem[]): Array<PricedQuotationItemInput & { workOrderItemId: number }> => {
  return items.map((item) => ({
    workOrderItemId: item.id,
    catalogItemId: item.catalogItemId,
    descripcion: item.descripcion,
    tipoLinea: item.tipoLinea,
    division: item.division,
    subtipo: item.subtipo ?? undefined,
    unidadMedida: item.unidadMedida,
    cantidad: numberValue(item.cantidad),
    precioUnitario: numberValue(item.precioUnitario),
    dpPricingSnapshot: item.dpPricingSnapshot ?? null,
    estadoOperativo: item.estadoOperativo,
    notasOperativas: item.notasOperativas,
  }));
};

export const listQuotations = async (
  query: QuotationQueryInput,
  userId?: number,
): Promise<ListQuotationsResult> => {
  const pagination = getPagination(query);
  const where: QuotationWhere = {};
  const scope = await getSalesScope(userId);
  if (scope) where[Op.and] = [quotationWhere(scope)];

  if (query.search) {
    const searchPattern = `%${query.search}%`;
    where[Op.or] = [
      { codigo: { [Op.like]: searchPattern } },
      { notas: { [Op.like]: searchPattern } },
      sequelizeWhere(col('client.nombre'), { [Op.like]: searchPattern }),
      sequelizeWhere(col('client.rut'), { [Op.like]: searchPattern }),
      plateSearch('vehicle.patente', query.search),
    ];
  }

  if (query.estadoPago !== undefined) {
    where.estadoPago = query.estadoPago;
  }
  if (query.clientId !== undefined) {
    where.clientId = query.clientId;
  }
  if (query.vehicleId !== undefined) {
    where.vehicleId = query.vehicleId;
  }
  if (query.workOrderId !== undefined) {
    where.workOrderId = query.workOrderId;
  } else if (query.workOrderLinked !== undefined) {
    where.workOrderId = query.workOrderLinked ? { [Op.not]: null } : { [Op.is]: null };
  }

  if (query.fechaDesde || query.fechaHasta) {
    const range: { [Op.gte]?: Date; [Op.lte]?: Date } = {};
    if (query.fechaDesde) {
      range[Op.gte] = new Date(`${query.fechaDesde}T00:00:00.000Z`);
    }
    if (query.fechaHasta) {
      range[Op.lte] = new Date(`${query.fechaHasta}T23:59:59.999Z`);
    }
    where.createdAt = range;
  }

  if (query.archiveStatus) {
    const expired: QuotationWhere = {
      workOrderId: { [Op.is]: null },
      pagado: 0,
      estadoPago: 'por_pagar',
      [Op.and]: [
        literal('DATE_ADD(Quotation.created_at, INTERVAL Quotation.validez_dias DAY) <= UTC_TIMESTAMP()'),
        literal("NOT EXISTS (SELECT 1 FROM payments AS archive_payment WHERE archive_payment.quotation_id = Quotation.id AND archive_payment.estado <> 'rechazado')"),
      ],
    };
    const archived: QuotationWhere = {
      [Op.or]: [{ archivedAt: { [Op.not]: null } }, expired],
    };
    where[Op.and] = [
      ...(where[Op.and] ?? []),
      query.archiveStatus === 'archived' ? archived : { [Op.not]: archived },
    ];
  }

  const { rows, count } = await Quotation.findAndCountAll({
    where,
    include: scopeSalesAssociations([clientInclude, vehicleInclude, asesorInclude, workOrderInclude], scope),
    limit: pagination.limit,
    offset: pagination.offset,
    order: [['createdAt', 'DESC']],
  });

  return {
    items: rows.map(toQuotationPublic),
    total: count,
    page: pagination.page,
    pageSize: pagination.limit,
    totalPages: count > 0 ? Math.ceil(count / pagination.limit) : 0,
  };
};

export const getQuotationById = async (id: number, userId?: number): Promise<QuotationPublic> => {
  const quotation = await getCompleteQuotation(id, undefined, await getSalesScope(userId));
  return toQuotationPublic(quotation);
};

export const archiveQuotation = async (id: number, userId?: number): Promise<QuotationPublic> => {
  await sequelize.transaction(async (transaction) => {
    const quotation = await Quotation.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!quotation) throw ApiError.notFound('Cotización no encontrada');
    if (quotation.archivedAt) return;
    const paymentCount = await Payment.count({
      where: { quotationId: id, estado: { [Op.ne]: 'rechazado' } }, transaction,
    });
    if (quotation.workOrderId !== null || numberValue(quotation.pagado) > 0 || quotation.estadoPago !== 'por_pagar' || paymentCount > 0) {
      throw ApiError.badRequest('Solo se pueden archivar cotizaciones sin OT y sin abonos');
    }
    await quotation.update({ archivedAt: new Date() }, { transaction });
  });
  return getQuotationById(id, userId);
};

export const unarchiveQuotation = async (id: number, userId?: number): Promise<QuotationPublic> => {
  await sequelize.transaction(async (transaction) => {
    const quotation = await Quotation.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!quotation) throw ApiError.notFound('Cotización no encontrada');
    if (!quotation.archivedAt) return;
    await quotation.update({ archivedAt: null }, { transaction });
  });
  return getQuotationById(id, userId);
};

export const getQuotationInspectionPhoto = async (
  id: number,
  slot: WorkOrderInspectionPhotoSlot,
  userId?: number,
): Promise<InspectionPhotoFile> => {
  const quotation = await Quotation.findByPk(id, { attributes: ['id', 'workOrderId'] });
  if (!quotation) throw ApiError.notFound('Cotización no encontrada');
  if (quotation.workOrderId === null) throw ApiError.notFound('Foto de inspección no encontrada');
  if (userId !== undefined) await assertSalesWorkOrderAccess(quotation.workOrderId, userId);
  return getInspectionPhoto(quotation.workOrderId, slot);
};

export const createQuotation = async (
  data: CreateQuotationInput,
  asesorId: number,
): Promise<QuotationPublic> => {
  const result = await sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED }, async (transaction) => {
    let clientId = data.clientId ?? null;
    let vehicleId = data.vehicleId ?? null;
    let items: PricedQuotationItemInput[] = data.items;

    if (data.workOrderId !== undefined && data.workOrderId !== null) {
      await assertSalesWorkOrderAccess(data.workOrderId, asesorId, transaction);
      const workOrder = await WorkOrder.findByPk(data.workOrderId, {
        include: [{ model: WorkOrderItem }], transaction, lock: transaction.LOCK.UPDATE,
      });

      if (!workOrder) {
        throw ApiError.badRequest('La orden de trabajo especificada no existe');
      }
      if (workOrder.estado === 'cancelada') {
        throw ApiError.badRequest('No se puede cotizar una orden de trabajo cancelada');
      }

      const existingQuotation = await Quotation.findOne({
        where: { workOrderId: data.workOrderId },
        transaction,
      });
      if (existingQuotation) {
        throw ApiError.conflict('La orden de trabajo ya tiene una cotización vinculada');
      }

      clientId = clientId ?? workOrder.clientId;
      vehicleId = vehicleId ?? workOrder.vehicleId;

      if (items.length === 0 && workOrder.items) {
        items = copyWorkOrderItems(workOrder.items);
      }
    }

    const emailClient = clientId === null ? null : await assertClientExists(clientId, transaction);
    if (vehicleId !== null) {
      await assertVehicleExists(vehicleId, transaction);
    }
    items = await normalizeQuotationItems(items, transaction);

    const pricing = priceQuotation(items, data);
    const { total } = pricing;
    const codigo = await generateQuotationCode(transaction);
    const quotation = await Quotation.create(
      {
        codigo,
        workOrderId: data.workOrderId ?? null,
        clientId,
        vehicleId,
        asesorId,
        estadoPago: 'por_pagar',
        subtotal: pricing.subtotal,
        total,
        pagado: 0,
        notas: data.notas ?? null,
        formaPago: data.formaPago ?? 'transferencia',
        disponibilidadTrabajo: data.disponibilidadTrabajo ?? null,
        validezDias: data.validezDias ?? 5,
        descuentoTipo: data.descuentoTipo ?? null,
        descuentoValor: data.descuentoValor ?? 0,
      },
      { transaction },
    );

    if (items.length > 0) {
      await QuotationItem.bulkCreate(buildItemsPayload(quotation.id, items), { transaction });
    }
    if (quotation.workOrderId !== null) {
      await ensureQuotationItemLinks(quotation.id, quotation.workOrderId, transaction);
      await propagateLinkedSalesAccess(
        { scopeType: 'work_order', targetId: quotation.workOrderId },
        { scopeType: 'quotation', targetId: quotation.id, codigo: quotation.codigo, ownerId: quotation.asesorId },
        asesorId, transaction,
      );
    }

    await enqueueCustomerEmail({ kind: 'quotation', entityId: quotation.id, userId: asesorId, dedupeKey: `created:quotation:${quotation.id}`, target: { recipient: emailClient?.email ?? null, name: emailClient?.nombre ?? 'Cliente', code: quotation.codigo } }, transaction);
    return { quotationId: quotation.id, codigo, total, workOrderId: data.workOrderId ?? null };
  });

  const advisor = await User.findByPk(asesorId, { attributes: ['nombre'] });
  await notifyByType(
    'cotizacion_creada',
    {
      titulo: `Nueva cotización ${result.codigo}`,
      mensaje: `${advisor?.nombre ?? 'El comercial'} creó una cotización por ${formatClpAmount(getQuotationGrossTotal(result.total))}.`,
      href: `/quotations/${result.quotationId}`,
      quotationId: result.quotationId,
      workOrderId: result.workOrderId,
      actorId: asesorId,
    },
    { excludeUserId: asesorId },
  );

  return getQuotationById(result.quotationId, asesorId);
};

export const updateQuotation = async (
  id: number,
  data: UpdateQuotationInput,
  userId: number,
): Promise<QuotationPublic> => {
  const quotationId = await withWorkshopTransaction(async (transaction) => {
    const quotation = await Quotation.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!quotation) {
      throw ApiError.notFound('Cotización no encontrada');
    }

    const updatePayload: Partial<Pick<Quotation, 'notas' | 'estadoPago' | 'subtotal' | 'total' |
      'formaPago' | 'disponibilidadTrabajo' | 'validezDias' | 'descuentoTipo' | 'descuentoValor'>> = {};
    let nextTotal = numberValue(quotation.total);
    const changesPricing = data.items !== undefined || data.descuentoTipo !== undefined || data.descuentoValor !== undefined;

    if (changesPricing) {
      if (quotation.estadoPago === 'total') {
        throw ApiError.badRequest(
          'No se pueden modificar items de una cotización pagada en su totalidad',
        );
      }

      const previous = await QuotationItem.findAll({ where: { quotationId: id }, order: [['id', 'ASC']], transaction });
      const normalizedItems = data.items
        ? await normalizeQuotationItems(preserveLineDiscounts(data.items, previous), transaction, previous)
        : undefined;
      if (quotation.workOrderId !== null && normalizedItems) await assertChiefPriceEditsAllowed(userId, normalizedItems.some((input) => {
        const existing = previous.find((line) => line.id === input.id);
        return existing && existing.tipoLinea !== 'parte' && Number(existing.precioUnitario) !== Number(input.precioUnitario);
      }), transaction);
      const items = normalizedItems ?? previous;
      const discount = {
        descuentoTipo: data.descuentoTipo === undefined ? quotation.descuentoTipo : data.descuentoTipo,
        descuentoValor: data.descuentoValor ?? Number(quotation.descuentoValor),
      };
      const pricing = priceQuotation(items, discount);
      const { total } = pricing;
      if (getQuotationGrossTotal(total) < numberValue(quotation.pagado)) {
        throw ApiError.badRequest('El nuevo total no puede ser inferior al monto ya pagado');
      }
      nextTotal = total;

      if (normalizedItems) {
        const nextItems = normalizedItems;
        if (quotation.workOrderId !== null) {
          await ensureQuotationItemLinks(quotation.id, quotation.workOrderId, transaction);
          for (const old of previous) await old.reload({ transaction });
        }
        const remaining = [...previous];
        const usedIds = new Set<number>();
        const payloads = buildItemsPayload(id, nextItems);
        for (const [index, line] of nextItems.entries()) {
          if (line.id !== undefined && (usedIds.has(line.id) || !previous.some((old) => old.id === line.id))) {
            throw ApiError.badRequest('Uno o más ítems de la cotización no existen o están duplicados');
          }
          const candidates = remaining.filter((old) => line.id !== undefined
            ? old.id === line.id : itemIdentity(old) === itemIdentity(line));
          const old = candidates.length === 1 ? candidates[0] : undefined;
          if (old) {
            usedIds.add(old.id);
            remaining.splice(remaining.indexOf(old), 1);
            const { workOrderItemId: _link, ...payload } = payloads[index];
            await old.update(payload, { transaction });
          } else {
            await QuotationItem.create(payloads[index], { transaction });
          }
        }
        if (remaining.length > 0) {
          await QuotationItem.destroy({ where: { id: remaining.map((line) => line.id) }, transaction });
        }
        await syncLinkedWorkOrderFromQuotation(quotation, userId, transaction);
      }

      updatePayload.subtotal = pricing.subtotal;
      updatePayload.total = total;
      Object.assign(updatePayload, discount);
    }

    if (data.notas !== undefined) {
      updatePayload.notas = data.notas;
    }
    if (data.formaPago !== undefined) updatePayload.formaPago = data.formaPago;
    if (data.disponibilidadTrabajo !== undefined) updatePayload.disponibilidadTrabajo = data.disponibilidadTrabajo;
    if (data.validezDias !== undefined) updatePayload.validezDias = data.validezDias;
    const pendingPayments = await Payment.count({
      where: { quotationId: id, estado: 'por_verificar' },
      transaction,
    });
    const expectedFinancialStatus = pendingPayments > 0
      ? 'por_verificar'
      : getFinancialQuotationStatus(numberValue(quotation.pagado), nextTotal);

    if (data.estadoPago !== undefined) {
      if (
        FINANCIAL_QUOTATION_STATUSES.has(data.estadoPago) &&
        data.estadoPago !== expectedFinancialStatus
      ) {
        throw ApiError.badRequest(
          `El estado de pago debe ser '${expectedFinancialStatus}' según los montos registrados`,
        );
      }
      updatePayload.estadoPago = data.estadoPago;
    } else if (
      changesPricing &&
      FINANCIAL_QUOTATION_STATUSES.has(quotation.estadoPago)
    ) {
      updatePayload.estadoPago = expectedFinancialStatus;
    }

    await quotation.update(updatePayload, { transaction });
    return quotation.id;
  });

  return getQuotationById(quotationId, userId);
};

export const convertQuotationToWorkOrder = async (
  quotationId: number,
  userId: number,
  data: ConvertQuotationInput,
): Promise<ConvertQuotationResult> => {
  const converted = await sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED }, async (transaction) => {
    const quotation = await Quotation.findByPk(quotationId, {
      include: [{ model: QuotationItem }],
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });

    if (!quotation) {
      throw ApiError.notFound('Cotización no encontrada');
    }

    if (quotation.workOrderId !== null) {
      throw ApiError.badRequest(
        'Esta cotización ya está vinculada a una Orden de Trabajo existente',
      );
    }

    if (quotation.archivedAt !== null) {
      throw ApiError.badRequest('No se puede convertir una cotización archivada');
    }
    const clientId = data.clientId ?? quotation.clientId;
    const itemAssignments = new Map((data.itemAssignments ?? []).map((item) => [item.quotationItemId, item]));
    if ([...itemAssignments.keys()].some((id) => !(quotation.items ?? []).some((item) => item.id === id))) {
      throw ApiError.badRequest('Uno o más servicios no pertenecen a la cotización');
    }
    if (!clientId) {
      throw ApiError.badRequest('Seleccione el responsable de la orden de trabajo');
    }
    // Copy accepted prices and their original revision; conversion never re-quotes the COT.
    const snapshots = new Map<number, DpWorkQuote>();
    for (const [index, item] of (quotation.items ?? []).entries()) {
      if (item.dpPricingSnapshot) snapshots.set(index, item.dpPricingSnapshot);
    }
    const snapshotArguments: [] | [ReadonlyMap<number, DpWorkQuote>] = snapshots.size ? [snapshots] : [];
    const workOrder = await createWorkOrderInTransaction(
      {
        ...data,
        clientId,
        descripcion: data.descripcion ?? quotation.notas ?? `Generada desde cotización ${quotation.codigo}`,
        items: (quotation.items ?? []).map((item) => ({
          assignedUserId: itemAssignments.get(item.id)?.assignedUserId ?? null,
          teamMembers: itemAssignments.get(item.id)?.teamMembers,
          catalogItemId: item.catalogItemId,
          descripcion: item.descripcion,
          tipoLinea: item.tipoLinea,
          division: item.division ?? undefined,
          subtipo: item.subtipo ?? undefined,
          esAPedido: item.subtipo === 'a_pedido',
          unidadMedida: item.unidadMedida,
          cantidad: numberValue(item.cantidad),
          precioUnitario: numberValue(item.precioUnitario),
          descuentoTipo: item.descuentoTipo,
          descuentoValor: numberValue(item.descuentoValor),
          estadoOperativo: item.division === 'DP' ? 'pendiente' : item.estadoOperativo,
          notasOperativas: item.notasOperativas,
        })),
      },
      userId,
      transaction,
      false,
      ...snapshotArguments,
    );

    await quotation.update({ workOrderId: workOrder.id, vehicleId: workOrder.vehicleId, clientId: quotation.clientId ?? clientId }, { transaction });
    await propagateLinkedSalesAccess(
      { scopeType: 'quotation', targetId: quotation.id },
      { scopeType: 'work_order', targetId: workOrder.id, codigo: workOrder.codigo, ownerId: workOrder.createdBy },
      userId, transaction,
    );
    const createdItems = await WorkOrderItem.findAll({
      where: { workOrderId: workOrder.id }, order: [['id', 'ASC']], transaction,
    });
    for (const [index, line] of (quotation.items ?? []).entries()) {
      const createdItem = createdItems[index];
      if (!createdItem) throw ApiError.badRequest('No se pudieron vincular todos los trabajos de la cotización');
      await line.update({
        workOrderItemId: createdItem.id,
        division: createdItem.division,
        subtipo: createdItem.subtipo,
        estadoOperativo: createdItem.estadoOperativo,
      }, { transaction });
    }

    return {
      quotationId: quotation.id,
      workOrderId: workOrder.id,
      workOrderCodigo: workOrder.codigo,
    };
  });

  const [quotation, workOrder] = await Promise.all([
    getQuotationById(converted.quotationId, userId),
    getWorkOrderById(converted.workOrderId, userId),
  ]);

  const converter = await User.findByPk(userId, { attributes: ['nombre'] });
  await notifyByType(
    'cotizacion_convertida',
    {
      titulo: `${converted.workOrderCodigo} creada desde ${quotation.codigo}`,
      mensaje: `${converter?.nombre ?? 'El comercial'} convirtió la cotización en una orden de taller.`,
      href: `/work-orders/${converted.workOrderId}`,
      quotationId: converted.quotationId,
      workOrderId: converted.workOrderId,
      actorId: userId,
    },
    { excludeUserId: userId },
  );

  return { quotation, workOrder };
};

export const deleteQuotation = async (id: number): Promise<void> => {
  const quotation = await Quotation.findByPk(id);
  if (!quotation) {
    throw ApiError.notFound('Cotización no encontrada');
  }

  const paymentCount = await Payment.count({ where: { quotationId: id } });
  if (
    numberValue(quotation.pagado) > 0 ||
    paymentCount > 0 ||
    quotation.estadoPago !== 'por_pagar'
  ) {
    throw ApiError.badRequest('No se puede eliminar una cotización con pagos registrados');
  }

  await quotation.destroy();
};
