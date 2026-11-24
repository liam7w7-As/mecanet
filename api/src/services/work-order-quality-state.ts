import { Op, Transaction } from 'sequelize';

import { assertDpItemStatus } from './work-order-dp-state.js';
import { ensureQuotationItemLinks } from './work-order-item-links.js';
import { Quotation } from '../models/Quotation.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderEvent } from '../models/WorkOrderEvent.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
import { WorkOrderQualityReview } from '../models/WorkOrderQualityReview.js';
import { ApiError } from '../utils/ApiError.js';

interface PricedService { id: number; descripcion: string; tipoLinea: string; precioUnitario: number | string; catalogItemId: number | null }
interface MirroredPrice { workOrderItemId: number | null; descripcion: string; precioUnitario: number | string; catalogItemId: number | null }
export const getUnpricedServices = (items: readonly PricedService[], prices: readonly MirroredPrice[] = []): string[] => items.filter((item) => item.tipoLinea !== 'parte').filter((item) => {
  const unlinked = prices.filter((line) => line.workOrderItemId === null && line.descripcion === item.descripcion && line.catalogItemId === item.catalogItemId);
  const mirrored = prices.find((line) => line.workOrderItemId === item.id) ?? (unlinked.length === 1 ? unlinked[0] : undefined);
  const amount = Number(mirrored ? mirrored.precioUnitario : item.precioUnitario);
  return !Number.isFinite(amount) || amount <= 0;
}).map((item) => item.descripcion);

export const requireQualitySupervisor = async (userId: number, transaction?: Transaction): Promise<User> => {
  const user = await User.findOne({ where: { id: userId, activo: true }, include: [{ model: Role, as: 'role', attributes: ['nombre'] }], transaction });
  if (!user || !['desarrollador', 'admin', 'jefe'].includes(user.role?.nombre ?? '')) throw ApiError.forbidden('El control de calidad requiere al jefe de taller o administración');
  return user;
};

/** A completed checklist is execution, never an implicit quality approval. */
export const revokeFinalQuality = async (workOrderId: number, actorId: number, reason: string, transaction: Transaction): Promise<void> => {
  const order = await WorkOrder.findByPk(workOrderId, { transaction, lock: Transaction.LOCK.UPDATE });
  if (!order || ['entregada', 'cancelada'].includes(order.estado)) return;
  const hadApproval = Boolean(order.qualityApprovedAt);
  const wasFinal = order.estado === 'finalizada';
  if (!hadApproval && !wasFinal) return;
  await order.update({ qualityApprovedAt: null, qualityApprovedBy: null, qualityApprovalNote: null, ...(wasFinal ? { estado: 'en_progreso' } : {}) }, { transaction });
  await WorkOrderEvent.create({ workOrderId, actorUserId: actorId, tipo: 'actualizacion', descripcion: 'La orden requiere una nueva confirmación de calidad', metadata: { qualityInvalidated: true, reason, previousApproval: hadApproval, reopened: wasFinal } }, { transaction });
};

export const invalidateItemQuality = async (item: WorkOrderItem, actorId: number, reason: string, transaction: Transaction): Promise<void> => {
  if (item.division === 'DP' && item.ccfStatus !== 'pendiente') {
    await item.update({ ccfStatus: 'pendiente', ccfReviewedAt: null, ccfReviewedBy: null }, { transaction });
  }
  // Keep the rejection reason while the mechanic is correcting the service.
  if (item.qualityStatus === 'aprobado' || (item.qualityStatus === 'rechazado' && ['completado', 'omitido'].includes(item.estadoOperativo))) {
    await item.update({ qualityStatus: 'pendiente', qualityReviewedAt: null, qualityReviewedBy: null, qualityNote: null }, { transaction });
  }
  await revokeFinalQuality(item.workOrderId, actorId, reason, transaction);
};

export const invalidateAllQuality = async (workOrderId: number, actorId: number, reason: string, transaction: Transaction): Promise<void> => {
  await WorkOrderItem.update({ qualityStatus: 'pendiente', qualityReviewedAt: null, qualityReviewedBy: null, qualityNote: null, ccfStatus: 'pendiente', ccfReviewedAt: null, ccfReviewedBy: null }, { where: { workOrderId }, transaction });
  await revokeFinalQuality(workOrderId, actorId, reason, transaction);
};

export const assertQualityItemsResolved = async (workOrderId: number, transaction: Transaction): Promise<void> => {
  const unfinished = await WorkOrderItem.count({ where: { workOrderId, estadoOperativo: { [Op.notIn]: ['completado', 'omitido'] } }, transaction });
  if (unfinished) throw ApiError.badRequest('Todos los trabajos y repuestos deben estar completados u omitidos antes de confirmar la calidad');
  const unapproved = await WorkOrderItem.count({ where: { workOrderId, tipoLinea: { [Op.ne]: 'parte' }, qualityStatus: { [Op.ne]: 'aprobado' } }, transaction });
  if (unapproved) throw ApiError.badRequest('El jefe de taller debe aprobar individualmente la calidad de todos los servicios antes de finalizar');
  const dpItems = await WorkOrderItem.findAll({ where: { workOrderId, division: 'DP', estadoOperativo: { [Op.ne]: 'omitido' } }, transaction });
  for (const item of dpItems) {
    await assertDpItemStatus(item, 'completado', transaction);
    if (item.ccfStatus !== 'aprobado') throw ApiError.badRequest('El jefe debe aprobar el CCF de todos los trabajos D&P');
  }
};

/** Called only while holding the OT lock; direct state endpoints use this same gate. */
export const approveFinalQuality = async (order: WorkOrder, userId: number, note: string | null | undefined, transaction: Transaction): Promise<void> => {
  const reviewer = await requireQualitySupervisor(userId, transaction);
  if (['entregada', 'cancelada'].includes(order.estado)) throw ApiError.badRequest('No se puede revisar la calidad de una orden cerrada');
  await assertQualityItemsResolved(order.id, transaction);
  if (order.qualityApprovedAt) return;
  await order.update({ qualityApprovedAt: new Date(), qualityApprovedBy: userId, qualityApprovalNote: note?.trim() || null }, { transaction });
  const review = await WorkOrderQualityReview.create({ workOrderId: order.id, workOrderItemId: null, decision: 'aprobado', reviewedBy: userId, reviewerName: reviewer.nombre, note: note?.trim() || null }, { transaction });
  await WorkOrderEvent.create({ workOrderId: order.id, actorUserId: userId, tipo: 'actualizacion', descripcion: 'Control de calidad final aprobado', metadata: { qualityReviewId: review.id, note: note ?? null } }, { transaction });
};

export const assertQualityDeliveryReady = async (order: WorkOrder, transaction: Transaction): Promise<void> => {
  if (!order.qualityApprovedAt) throw ApiError.badRequest('Falta la confirmación final de calidad del jefe de taller o administración');
  await assertQualityItemsResolved(order.id, transaction);
  const services = await WorkOrderItem.findAll({ where: { workOrderId: order.id, tipoLinea: { [Op.ne]: 'parte' } }, transaction });
  const mirror = await Quotation.findOne({ where: { workOrderId: order.id }, transaction, lock: Transaction.LOCK.UPDATE });
  const prices = mirror ? (await ensureQuotationItemLinks(mirror.id, order.id, transaction)).quotationItems : [];
  const unpriced = getUnpricedServices(services, prices);
  if (unpriced.length) throw ApiError.badRequest(`No se puede entregar: falta definir el precio de ${unpriced.map((name) => `"${name}"`).join(', ')}`);
};
