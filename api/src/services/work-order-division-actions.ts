import { DP_STAGE_SPECIALTIES } from '@unithor/shared';
import { Op } from 'sequelize';

import { calculateDpWorkPricing } from './dp-configuration.service.js';
import { notifyByType } from './notification.service.js';
import { hasPermission } from './permission.service.js';
import { priceQuotation } from './quotation-pricing.js';
import { consumeForWorkOrder } from './warehouse.service.js';
import { normalizeDivisionMetadata } from './work-order-division-rules.js';
import { ensureDpStagesForItems, refreshDpItemStatus, setDpStageStatus } from './work-order-dp-state.js';
import { recordChecklistStatusChange } from './work-order-labor-events.js';
import { getPriceActor } from './work-order-price-policy.js';
import { invalidateItemQuality, revokeFinalQuality } from './work-order-quality-state.js';
import { reviewWorkOrderQuality } from './work-order-quality.service.js';
import { getAssignedOrderIds, isAssignedToItem } from './work-order-team-access.js';
import { assertWorkOrderAccess, getWorkOrderById, syncMirrorQuotationFromWorkOrder } from './work-order.service.js';
import { withWorkshopTransaction } from './workshop-transaction.js';
import { CatalogItem } from '../models/CatalogItem.js';
import { Role } from '../models/Role.js';
import { Specialty } from '../models/Specialty.js';
import { User } from '../models/User.js';
import { WorkerSpecialty } from '../models/WorkerSpecialty.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderDpStage } from '../models/WorkOrderDpStage.js';
import { WorkOrderEvent } from '../models/WorkOrderEvent.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
import { WorkOrderRequest } from '../models/WorkOrderRequest.js';
import { ApiError } from '../utils/ApiError.js';

import type { UpdateAccCustodyInput, UpdateDpStageInput, ReviewDpQualityInput, WorkOrderItemInput } from '@unithor/shared';
import type { Transaction } from 'sequelize';

const supervisors = ['admin', 'desarrollador', 'jefe'];
const normalizeName = (name: string): string => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
async function actorContext(id: number, userId: number, transaction: Transaction) {
  const actor = await getPriceActor(userId, transaction);
  if (!(await hasPermission(userId, 'taller', 'update'))) throw ApiError.forbidden('No tienes permiso para actualizar taller');
  await assertWorkOrderAccess(id, userId, transaction);
  const order = await WorkOrder.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!order) throw ApiError.notFound('Orden de trabajo no encontrada');
  if (['entregada', 'cancelada'].includes(order.estado)) throw ApiError.badRequest('La orden de trabajo está cerrada');
  return { actor, order, role: actor.role!.nombre, supervisor: supervisors.includes(actor.role!.nombre) };
}
async function findItem(id: number, itemId: number, transaction: Transaction) {
  const item = await WorkOrderItem.findOne({ where: { id: itemId, workOrderId: id }, transaction, lock: transaction.LOCK.UPDATE });
  if (!item) throw ApiError.notFound('Trabajo no encontrado');
  return item;
}
async function assertStageWorker(stage: WorkOrderDpStage, userId: number, transaction: Transaction) {
  const worker = await User.findOne({ where: { id: userId, activo: true }, include: [{ model: Role, as: 'role' }], transaction });
  if (!worker || worker.role?.nombre !== 'mecanico') throw ApiError.badRequest('Selecciona un técnico activo con rol Mecánico');
  const memberships = await WorkerSpecialty.findAll({ where: { userId }, transaction });
  const specialties = await Specialty.findAll({ where: { id: memberships.map((entry) => entry.specialtyId), active: true }, transaction });
  const allowed = stage.allowedSpecialties ?? DP_STAGE_SPECIALTIES[stage.stageKey];
  if (!specialties.some((specialty) => allowed.some((name) => normalizeName(specialty.name).includes(normalizeName(name)))))
    throw ApiError.badRequest(`Configura la especialidad de ${worker.nombre} para asignarle ${stage.stageLabel}`);
  return worker;
}

export async function updateWorkOrderDpStage(id: number, stageId: number, data: UpdateDpStageInput, userId: number) {
  await withWorkshopTransaction(async (transaction) => {
    const { role, supervisor, order } = await actorContext(id, userId, transaction);
    const stage = await WorkOrderDpStage.findOne({ where: { id: stageId, workOrderId: id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!stage) throw ApiError.notFound('Etapa de D&P no encontrada');
    if (!supervisor && (role !== 'mecanico' || stage.assignedUserId !== userId)) throw ApiError.forbidden('Solo puedes actualizar tu etapa asignada');
    if (!supervisor && (data.assignedUserId !== undefined || data.status === 'pendiente' || order.estado === 'finalizada'))
      throw ApiError.forbidden('El jefe debe asignar o reabrir la etapa');
    if (data.assignedUserId !== undefined) {
      if (data.assignedUserId !== stage.assignedUserId && stage.status !== 'pendiente' && data.status !== 'pendiente')
        throw ApiError.badRequest('Reabre la etapa antes de cambiar al técnico responsable');
      const worker = data.assignedUserId === null ? null : await assertStageWorker(stage, data.assignedUserId, transaction);
      await stage.update({ assignedUserId: worker?.id ?? null, assignedUserName: worker?.nombre ?? null }, { transaction });
    }
    const item = await findItem(id, stage.workOrderItemId, transaction);
    if (!supervisor && item.qualityStatus === 'aprobado') throw ApiError.forbidden('El jefe debe reabrir el trabajo aprobado antes de modificarlo');
    if (data.status && data.status !== stage.status) {
      if (data.status !== 'pendiente' && stage.assignedUserId === null) throw ApiError.badRequest('Asigna un técnico antes de iniciar la etapa');
      await invalidateItemQuality(item, userId, 'Etapa D&P actualizada', transaction);
      const previousStatus = item.estadoOperativo;
      await setDpStageStatus(stage, data.status, transaction, data.note);
      await refreshDpItemStatus(item, transaction);
      await recordChecklistStatusChange(item, previousStatus, userId, transaction);
    } else if (data.note !== undefined) await stage.update({ note: data.note?.trim() || null }, { transaction });
    await WorkOrderEvent.create({ workOrderId: id, actorUserId: userId, tipo: 'actualizacion', descripcion: `Etapa D&P: ${stage.stageLabel}`, metadata: { itemId: item.id, stageId, ...data } }, { transaction });
    await syncMirrorQuotationFromWorkOrder(id, transaction, true);
  });
  return getWorkOrderById(id, userId);
}

export async function reviewWorkOrderDpQuality(id: number, itemId: number, data: ReviewDpQualityInput, userId: number) {
  if (data.status === 'aprobado' || data.status === 'rechazado') {
    if (data.status === 'rechazado' && !data.note?.trim()) throw ApiError.badRequest('Indica el motivo del rechazo de calidad');
    await reviewWorkOrderQuality(id, itemId, data.status === 'aprobado'
      ? { decision: 'aprobar', nota: data.note ?? undefined }
      : { decision: 'rechazar', nota: data.note!.trim() }, userId, true);
  } else {
    await withWorkshopTransaction(async (transaction) => {
      const { supervisor } = await actorContext(id, userId, transaction);
      if (!supervisor) throw ApiError.forbidden('El control de calidad requiere al jefe de taller');
      const item = await findItem(id, itemId, transaction);
      if (item.division !== 'DP') throw ApiError.badRequest('El CCF corresponde a los trabajos D&P');
      if (data.status === 'pendiente') await invalidateItemQuality(item, userId, 'Control D&P reabierto', transaction);
      if (data.note !== undefined) await item.update({ ccfNotes: data.note?.trim() || null }, { transaction });
      await WorkOrderEvent.create({ workOrderId: id, actorUserId: userId, tipo: 'actualizacion', descripcion: 'Observación de control D&P', metadata: { itemId, ...data } }, { transaction });
    });
  }
  return getWorkOrderById(id, userId);
}

export async function ensureAccRequestsForItems(order: WorkOrder, items: WorkOrderItem[], userId: number, transaction: Transaction): Promise<void> {
  for (const item of items.filter((line) => line.division === 'ACC' && line.catalogItemId !== null && !line.stockConsumido && !['completado', 'omitido'].includes(line.estadoOperativo))) {
    const existing = await WorkOrderRequest.findOne({ where: { workOrderItemId: item.id, tipo: 'repuesto', estado: { [Op.in]: ['pendiente', 'aprobada', 'entregada'] } }, transaction });
    if (existing) continue;
    const request = await WorkOrderRequest.create({ workOrderId: order.id, workOrderItemId: item.id, catalogItemId: item.catalogItemId, requestedBy: userId,
      tipo: 'repuesto', estado: 'aprobada', cantidad: Number(item.cantidad), motivo: item.esAPedido ? 'Repuesto a pedido incluido en la OT' : 'Repuesto incluido en la OT',
      precioSugerido: null, precioAprobado: Number(item.precioUnitario), reviewedBy: userId, reviewedAt: new Date(), reviewNote: 'Incluido al crear el trabajo' }, { transaction });
    await notifyByType('repuesto_por_entregar', { titulo: `${item.esAPedido ? 'Repuesto a pedido' : 'Repuesto por entregar'} para ${order.codigo}`,
      mensaje: item.descripcion, href: '/warehouses', workOrderId: order.id, actorId: userId, dedupeKey: `request-delivery:${request.id}` }, { transaction });
  }
}

export async function updateWorkOrderAccCustody(id: number, itemId: number, data: UpdateAccCustodyInput, userId: number) {
  await withWorkshopTransaction(async (transaction) => {
    const { role, order } = await actorContext(id, userId, transaction);
    const item = await findItem(id, itemId, transaction);
    if (item.division !== 'ACC' || item.tipoLinea !== 'parte') throw ApiError.badRequest('La custodia corresponde a repuestos ACC');
    const admin = ['admin', 'desarrollador'].includes(role);
    if (data.entregado !== undefined) {
      if (!admin && role !== 'bodeguero') throw ApiError.forbidden('La entrega debe confirmarla bodega');
      if (!(await hasPermission(userId, 'almacen', 'update'))) throw ApiError.forbidden('No tienes permiso para registrar la salida de inventario');
      if (!data.entregado) throw ApiError.badRequest('Para revertir una entrega utiliza una devolución de inventario');
      if (!item.entregadoBodega) {
        if (item.catalogItemId !== null && !item.stockConsumido) {
          const quantity = Number(item.cantidad);
          const consumption = await consumeForWorkOrder({ catalogItemId: item.catalogItemId, cantidad: quantity, referencia: order.codigo,
            motivo: `Entrega de bodega para ${order.codigo}`, userId, warehouseId: data.warehouseId }, transaction);
          await item.update({ stockConsumido: true, stockConsumidoCantidad: quantity, stockConsumidoAt: new Date(), stockConsumidoWarehouseId: consumption.warehouseId }, { transaction });
        }
        await item.update({ entregadoBodega: true, entregadoBodegaAt: item.stockConsumidoAt ?? new Date(), bodegueroUserId: userId }, { transaction });
        await WorkOrderRequest.update({ estado: 'entregada', deliveredBy: userId, deliveredAt: item.entregadoBodegaAt, deliveredWarehouseId: item.stockConsumidoWarehouseId, deliveryNote: data.notaEntrega ?? null },
          { where: { workOrderItemId: item.id, tipo: 'repuesto', estado: 'aprobada' }, transaction });
      }
    } else {
      const assigned = role === 'mecanico' && ((await isAssignedToItem(item, order, userId, transaction)) || (await getAssignedOrderIds(userId, transaction)).includes(id));
      if (!admin && !assigned) throw ApiError.forbidden('La recepción debe confirmarla el técnico asignado a esta OT');
      const dpStages = await WorkOrderDpStage.findAll({ where: { workOrderId: id }, transaction });
      if (!admin && dpStages.length && !dpStages.some((stage) => stage.assignedUserId === userId && ['armador_desarme', 'armador_montaje'].includes(stage.stageKey)))
        throw ApiError.forbidden('La recepción D&P debe confirmarla el armador asignado a esta OT');
      if (data.recibido !== undefined) {
        if (!item.entregadoBodega) throw ApiError.badRequest('Bodega debe confirmar la entrega antes de registrar la recepción');
        if (!data.recibido && item.recibidoTaller) throw ApiError.badRequest('La recepción ya firmada se conserva; registra una incidencia o devolución');
        if (!data.recibido && !data.notaEntrega?.trim()) throw ApiError.badRequest('Indica la incidencia o daño del repuesto antes de rechazar su recepción');
        if (data.recibido && !item.recibidoTaller) await item.update({ recibidoTaller: true, recibidoTallerAt: new Date(), armadorUserId: userId }, { transaction });
        if (!data.recibido) await item.update({ armadorUserId: userId }, { transaction });
      }
    }
    if (data.notaEntrega !== undefined) await item.update({ notaEntrega: data.notaEntrega?.trim() || null }, { transaction });
    await WorkOrderEvent.create({ workOrderId: id, actorUserId: userId, tipo: 'actualizacion', descripcion: `Custodia ACC: ${item.descripcion}`.slice(0, 255), metadata: { itemId, ...data } }, { transaction });
  });
  return getWorkOrderById(id, userId);
}

export async function addWorkOrderItem(id: number, input: WorkOrderItemInput, userId: number) {
  await withWorkshopTransaction(async (transaction) => {
    const { supervisor, order } = await actorContext(id, userId, transaction);
    if (!supervisor) throw ApiError.forbidden('Solicita al jefe de taller la incorporación de trabajos o repuestos');
    const catalog = input.catalogItemId ? await CatalogItem.findByPk(input.catalogItemId, { transaction }) : null;
    if (input.catalogItemId && !catalog) throw ApiError.badRequest('Item de catálogo no encontrado');
    const metadata = normalizeDivisionMetadata(input, catalog);
    const tipoLinea = catalog?.tipo ?? input.tipoLinea;
    if ((metadata.division === 'ACC') !== (tipoLinea === 'parte')) throw ApiError.badRequest('La división no corresponde al tipo de trabajo');
    if (input.estadoOperativo && input.estadoOperativo !== 'pendiente') throw ApiError.badRequest('Los trabajos nuevos deben comenzar pendientes');
    if (input.dpPricing && (metadata.division !== 'DP' || tipoLinea === 'parte' || catalog?.tipo === 'parte'))
      throw ApiError.badRequest('El cálculo D&P solo corresponde a servicios de la división D&P');
    const dpPricingSnapshot = input.dpPricing ? await calculateDpWorkPricing(input.dpPricing, transaction) : null;
    const precioUnitario = dpPricingSnapshot?.precioUnitario ?? input.precioUnitario;
    const pricing = priceQuotation([{ ...input, precioUnitario }], {});
    const item = await WorkOrderItem.create({ workOrderId: id, catalogItemId: input.catalogItemId ?? null, ...metadata,
      tipoLinea, descripcion: input.descripcion, unidadMedida: input.unidadMedida, cantidad: input.cantidad,
      precioUnitario, dpPricingSnapshot, subtotal: pricing.lines[0].subtotal,
      horasHombreEstimadas: input.horasHombreEstimadas ?? (catalog?.horasHombreEstandar == null ? null : Number(catalog.horasHombreEstandar)),
      estadoOperativo: 'pendiente', notasOperativas: input.notasOperativas ?? null }, { transaction });
    await ensureDpStagesForItems(id, [item], transaction);
    await revokeFinalQuality(id, userId, 'Se agregó un trabajo a la orden', transaction);
    await syncMirrorQuotationFromWorkOrder(id, transaction, false, { items: new Map([[item.id, { descuentoTipo: input.descuentoTipo, descuentoValor: input.descuentoValor }]]) });
    await ensureAccRequestsForItems(order, [item], userId, transaction);
    await WorkOrderEvent.create({ workOrderId: id, actorUserId: userId, tipo: 'actualizacion', descripcion: `Trabajo agregado: ${item.descripcion}`.slice(0, 255), metadata: { itemId: item.id, ...metadata } }, { transaction });
  });
  return getWorkOrderById(id, userId);
}
