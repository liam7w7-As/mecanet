import { getQuotationGrossTotal } from '@unithor/shared';
import { Transaction } from 'sequelize';

import { enqueueCustomerEmail } from './customer-email-queue.service.js';
import { notifyRoles, notifyUsers } from './notification.service.js';
import { priceQuotation } from './quotation-pricing.js';
import { ensureQuotationItemLinks } from './work-order-item-links.js';
import { assertOpenPriceOrder, getPriceActor } from './work-order-price-policy.js';
import { withWorkshopTransaction } from './workshop-transaction.js';
import { CatalogItem } from '../models/CatalogItem.js';
import { Payment } from '../models/Payment.js';
import { Quotation } from '../models/Quotation.js';
import { QuotationItem } from '../models/QuotationItem.js';
import { User } from '../models/User.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderEvent } from '../models/WorkOrderEvent.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
import { WorkOrderPriceSuggestion } from '../models/WorkOrderPriceSuggestion.js';
import { WorkOrderRequest } from '../models/WorkOrderRequest.js';
import { ApiError } from '../utils/ApiError.js';
import { formatClpAmount } from '../utils/formatters.js';

import type { CreateWorkOrderPriceSuggestionInput, ReviewWorkOrderPriceSuggestionInput } from '@unithor/shared';

export interface PriceSuggestionPublic {
  id: number; workOrderId: number; workOrderItemId: number | null; itemDescripcion: string | null;
  horasEstimadas: number | null; horasReales: number | null; precioActualOt: number | null;
  precioActualCatalogo: number | null; precioSugerido: number; alcance: WorkOrderPriceSuggestion['alcance'];
  motivo: string; estado: WorkOrderPriceSuggestion['estado']; createdByName: string | null;
  reviewNote: string | null; reviewedAt: Date | null; createdAt: Date; appliedDirectly: boolean;
}
const asNumber = (value: number | string | null) => value === null ? null : Number(value);
const asPublic = (row: WorkOrderPriceSuggestion): PriceSuggestionPublic => ({
  id: row.id, workOrderId: row.workOrderId, workOrderItemId: row.workOrderItemId,
  itemDescripcion: row.item?.descripcion ?? null, horasEstimadas: asNumber(row.horasEstimadas), horasReales: asNumber(row.horasReales),
  precioActualOt: asNumber(row.precioActualOt), precioActualCatalogo: asNumber(row.precioActualCatalogo), precioSugerido: Number(row.precioSugerido),
  alcance: row.alcance, motivo: row.motivo, estado: row.estado, createdByName: row.createdByName,
  reviewNote: row.reviewNote, reviewedAt: row.reviewedAt, createdAt: row.createdAt, appliedDirectly: row.appliedDirectly,
});
async function requireSupervisor(userId: number, transaction?: Transaction) {
  const actor = await getPriceActor(userId, transaction);
  if (!['admin', 'desarrollador', 'jefe'].includes(actor.role!.nombre)) throw ApiError.forbidden('Esta acción requiere al jefe de taller o administración');
  return actor;
}
async function lockedOrder(id: number, transaction: Transaction) {
  const order = await WorkOrder.findByPk(id, { transaction, lock: Transaction.LOCK.UPDATE });
  if (!order) throw ApiError.notFound('Orden de trabajo no encontrada');
  assertOpenPriceOrder(order);
  return order;
}
async function priceContext(order: WorkOrder, itemId: number, transaction: Transaction) {
  const quotation = await Quotation.findOne({ where: { workOrderId: order.id }, transaction, lock: Transaction.LOCK.UPDATE });
  const linked = quotation ? await ensureQuotationItemLinks(quotation.id, order.id, transaction) : null;
  const item = await WorkOrderItem.findOne({ where: { id: itemId, workOrderId: order.id }, transaction, lock: Transaction.LOCK.UPDATE });
  if (!item) throw ApiError.notFound('Trabajo no encontrado en esta orden');
  const line = linked?.quotationItems.find((candidate) => candidate.workOrderItemId === item.id);
  if (quotation && !line) throw ApiError.badRequest('El servicio no está vinculado a una línea de la cotización');
  return { item, quotation, line, current: Number(line?.precioUnitario ?? item.precioUnitario) };
}

export async function listPriceSuggestions(workOrderId: number, userId: number): Promise<PriceSuggestionPublic[]> {
  await requireSupervisor(userId);
  if (!await WorkOrder.findByPk(workOrderId, { attributes: ['id'] })) throw ApiError.notFound('Orden de trabajo no encontrada');
  const rows = await WorkOrderPriceSuggestion.findAll({ where: { workOrderId }, include: [{ model: WorkOrderItem, as: 'item', attributes: ['id', 'descripcion'] }], order: [['createdAt', 'DESC'], ['id', 'DESC']] });
  return rows.map(asPublic);
}

async function applyPrice(order: WorkOrder, suggestion: WorkOrderPriceSuggestion, actorId: number, transaction: Transaction): Promise<void> {
  if (suggestion.workOrderItemId === null) throw ApiError.badRequest('El servicio propuesto ya no existe');
  const context = await priceContext(order, suggestion.workOrderItemId, transaction);
  const applyOrder = suggestion.alcance !== 'catalogo';
  const applyCatalog = suggestion.alcance !== 'ot';
  const catalog = applyCatalog && suggestion.catalogItemId !== null ? await CatalogItem.findByPk(suggestion.catalogItemId, { transaction, lock: Transaction.LOCK.UPDATE }) : null;
  if (applyOrder && context.current !== Number(suggestion.precioActualOt)) throw ApiError.conflict('El precio del servicio cambió desde la propuesta. Revísalo y registra una nueva propuesta');
  if (applyCatalog && (!catalog || Number(catalog.precio) !== Number(suggestion.precioActualCatalogo))) throw ApiError.conflict('El precio del catálogo cambió desde la propuesta o el item ya no está disponible');
  const price = Number(suggestion.precioSugerido);
  if (applyOrder) {
    const { item, quotation, line } = context;
    if (quotation?.estadoPago === 'total') throw ApiError.badRequest('No se pueden modificar los precios de una cotización pagada en su totalidad');
    await item.update({ precioUnitario: price, subtotal: Math.round(price * Number(item.cantidad) * 100) / 100 }, { transaction });
    if (quotation && line) {
      await line.update({ precioUnitario: price }, { transaction });
      const lines = await QuotationItem.findAll({ where: { quotationId: quotation.id }, order: [['id', 'ASC']], transaction });
      const pricing = priceQuotation(lines, quotation);
      const gross = getQuotationGrossTotal(pricing.total);
      const paid = Number(quotation.pagado);
      if (gross < paid) throw ApiError.badRequest('El nuevo total no puede ser inferior al monto ya pagado');
      for (const [index, entry] of lines.entries()) await entry.update({ subtotal: pricing.lines[index].subtotal }, { transaction });
      const pending = await Payment.count({ where: { quotationId: quotation.id, estado: 'por_verificar' }, transaction });
      await quotation.update({ subtotal: pricing.subtotal, total: pricing.total, estadoPago: pending ? 'por_verificar' : paid === 0 ? 'por_pagar' : paid >= gross ? 'total' : 'parcial' }, { transaction });
    }
    const message = [
      `Actualización del servicio "${item.descripcion}" en ${order.codigo}${quotation ? ` / ${quotation.codigo}` : ''}.`,
      `Precio unitario anterior (neto): ${formatClpAmount(context.current)}.`,
      `Nuevo precio unitario (neto): ${formatClpAmount(price)}.`,
      ...(quotation ? [`Total de la cotización (IVA incluido): ${formatClpAmount(getQuotationGrossTotal(Number(quotation.total)))}.`] : []),
      `Motivo: ${suggestion.motivo}`,
    ].join('\n');
    await enqueueCustomerEmail({ kind: 'work_order', entityId: order.id, userId: actorId, category: 'progress', dedupeKey: `price-applied:${suggestion.id}`, subject: `Actualización de precio ${quotation?.codigo ?? order.codigo} | UNITHOR`, payload: { message } }, transaction);
    await notifyUsers([suggestion.createdBy, quotation?.asesorId], { tipo: 'solicitud_aprobada', titulo: `Precio actualizado en ${order.codigo}`, mensaje: `${item.descripcion}: ${formatClpAmount(context.current)} → ${formatClpAmount(price)} netos por unidad.`, href: `/work-orders/${order.id}`, workOrderId: order.id, quotationId: quotation?.id, actorId, dedupeKey: `price-applied:${suggestion.id}` }, transaction);
  }
  if (catalog) await catalog.update({ precio: price }, { transaction });
  await WorkOrderEvent.create({ workOrderId: order.id, actorUserId: actorId, tipo: 'actualizacion', descripcion: `Precio actualizado: ${context.item.descripcion}`, metadata: { priceSuggestionId: suggestion.id, before: context.current, after: price, scope: suggestion.alcance, appliedDirectly: suggestion.appliedDirectly, reason: suggestion.motivo } }, { transaction });
}

export async function createPriceSuggestionInTransaction(order: WorkOrder, data: CreateWorkOrderPriceSuggestionInput, actor: User, transaction: Transaction, sourceRequestId?: number, forceApply = false): Promise<WorkOrderPriceSuggestion> {
  assertOpenPriceOrder(order);
  const context = await priceContext(order, data.workOrderItemId, transaction);
  if (sourceRequestId !== undefined && data.precioSugerido <= context.current) throw ApiError.badRequest('El precio aprobado debe ser mayor al precio actual');
  const catalog = context.item.catalogItemId === null ? null : await CatalogItem.findByPk(context.item.catalogItemId, { transaction });
  if (data.alcance !== 'ot' && !catalog) throw ApiError.badRequest('El servicio no está vinculado a un item activo del catálogo');
  if (context.item.tipoLinea === 'parte') throw ApiError.badRequest('Las propuestas de precio del taller corresponden a servicios');
  const sameOrder = data.alcance === 'catalogo' || context.current === Number(data.precioSugerido);
  const sameCatalog = data.alcance === 'ot' || Number(catalog?.precio) === Number(data.precioSugerido);
  if (sameOrder && sameCatalog) throw ApiError.badRequest('El nuevo precio debe ser distinto al actual');
  const direct = data.alcance === 'ot' && !order.priceApprovalRequired;
  const apply = direct || forceApply;
  const suggestion = await WorkOrderPriceSuggestion.create({ workOrderId: order.id, workOrderItemId: context.item.id, catalogItemId: context.item.catalogItemId,
    createdBy: actor.id, createdByName: actor.nombre, horasEstimadas: context.item.horasHombreEstimadas === null ? null : Number(context.item.horasHombreEstimadas) * Number(context.item.cantidad), horasReales: context.item.horasHombreReales,
    precioActualOt: context.current, precioActualCatalogo: catalog ? Number(catalog.precio) : null, precioSugerido: data.precioSugerido, alcance: data.alcance, motivo: data.motivo,
    estado: apply ? 'aprobada' : 'pendiente', appliedDirectly: direct && !forceApply, sourceRequestId: sourceRequestId ?? null,
    reviewedBy: apply ? actor.id : null, reviewedAt: apply ? new Date() : null, reviewNote: null }, { transaction });
  if (apply) await applyPrice(order, suggestion, actor.id, transaction);
  else {
    await WorkOrderEvent.create({ workOrderId: order.id, actorUserId: actor.id, tipo: 'actualizacion', descripcion: `Precio propuesto: ${context.item.descripcion}`, metadata: { priceSuggestionId: suggestion.id, before: context.current, after: data.precioSugerido, scope: data.alcance, sourceRequestId: sourceRequestId ?? null } }, { transaction });
    await notifyRoles(['admin', 'desarrollador'], { tipo: 'solicitud_creada', titulo: `Precio por aprobar en ${order.codigo}`, mensaje: `${actor.nombre} propuso ${formatClpAmount(data.precioSugerido)} para ${context.item.descripcion}.`, href: `/work-orders/${order.id}`, workOrderId: order.id, actorId: actor.id, dedupeKey: `price-proposed:${suggestion.id}` }, { transaction, excludeUserId: actor.id });
  }
  suggestion.item = context.item;
  return suggestion;
}

export async function createPriceSuggestion(workOrderId: number, data: CreateWorkOrderPriceSuggestionInput, userId: number): Promise<PriceSuggestionPublic> {
  const row = await withWorkshopTransaction(async (transaction) => createPriceSuggestionInTransaction(await lockedOrder(workOrderId, transaction), data, await requireSupervisor(userId, transaction), transaction));
  return asPublic(row);
}

export async function reviewPriceSuggestion(workOrderId: number, suggestionId: number, data: ReviewWorkOrderPriceSuggestionInput, userId: number): Promise<PriceSuggestionPublic> {
  const row = await withWorkshopTransaction(async (transaction) => {
    const actor = await getPriceActor(userId, transaction);
    if (!['admin', 'desarrollador'].includes(actor.role!.nombre)) throw ApiError.forbidden('Solo administración puede aprobar sugerencias de precio');
    const order = await lockedOrder(workOrderId, transaction);
    const suggestion = await WorkOrderPriceSuggestion.findOne({ where: { id: suggestionId, workOrderId }, transaction, lock: Transaction.LOCK.UPDATE });
    if (!suggestion) throw ApiError.notFound('Sugerencia de precio no encontrada');
    if (suggestion.estado !== 'pendiente') throw ApiError.badRequest('La sugerencia ya fue revisada');
    if (data.decision === 'aprobar') await applyPrice(order, suggestion, userId, transaction);
    await suggestion.update({ estado: data.decision === 'aprobar' ? 'aprobada' : 'rechazada', reviewedBy: userId, reviewedAt: new Date(), reviewNote: data.comentario ?? null }, { transaction });
    const source = suggestion.sourceRequestId === null ? null : await WorkOrderRequest.findOne({ where: { id: suggestion.sourceRequestId, workOrderId }, transaction });
    if (source) await source.update({ estado: suggestion.estado, precioAprobado: data.decision === 'aprobar' ? Number(suggestion.precioSugerido) : null, reviewedBy: userId, reviewedAt: new Date(), reviewNote: data.comentario ?? 'Decisión administrativa sobre la variación de precio' }, { transaction });
    await WorkOrderEvent.create({ workOrderId, actorUserId: userId, tipo: 'actualizacion', descripcion: `Propuesta de precio ${suggestion.estado}`, metadata: { priceSuggestionId: suggestion.id, decision: data.decision, comment: data.comentario ?? null } }, { transaction });
    await notifyUsers([suggestion.createdBy, source?.requestedBy], { tipo: data.decision === 'aprobar' ? 'solicitud_aprobada' : 'solicitud_rechazada', titulo: `Propuesta de precio ${suggestion.estado} en ${order.codigo}`, mensaje: data.comentario ?? 'Consulta el resultado en la gestión de trabajo.', href: `/work-orders/${workOrderId}`, workOrderId, actorId: userId, dedupeKey: `price-reviewed:${suggestion.id}` }, transaction);
    suggestion.item = suggestion.workOrderItemId ? await WorkOrderItem.findByPk(suggestion.workOrderItemId, { transaction }) ?? undefined : undefined;
    return suggestion;
  });
  return asPublic(row);
}
