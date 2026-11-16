import { Transaction } from 'sequelize';

import { hasPermission } from './permission.service.js';
import { recordChecklistStatusChange } from './work-order-labor-events.js';
import { closeWorkOrderTimers } from './work-order-labor-sessions.js';
import { requireQualitySupervisor, revokeFinalQuality } from './work-order-quality-state.js';
import { replaceItemTeam } from './work-order-team.service.js';
import { assertWorkOrderAccess, syncMirrorQuotationFromWorkOrder } from './work-order.service.js';
import { withWorkshopTransaction } from './workshop-transaction.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderEvent } from '../models/WorkOrderEvent.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
import { WorkOrderItemAssignment } from '../models/WorkOrderItemAssignment.js';
import { WorkOrderQualityReview } from '../models/WorkOrderQualityReview.js';
import { ApiError } from '../utils/ApiError.js';

import type { ReviewWorkOrderQualityInput } from '@unithor/shared';

export const getWorkOrderQuality = async (workOrderId: number, userId: number) => {
  await assertWorkOrderAccess(workOrderId, userId);
  const [order, items, history, actor] = await Promise.all([
    WorkOrder.findByPk(workOrderId),
    WorkOrderItem.findAll({ where: { workOrderId }, order: [['id', 'ASC']] }),
    WorkOrderQualityReview.findAll({ where: { workOrderId }, order: [['id', 'DESC']] }),
    User.findByPk(userId, { attributes: ['id'], include: [{ model: Role, as: 'role', attributes: ['nombre'] }] }),
  ]);
  if (!order) throw ApiError.notFound('Orden de trabajo no encontrada');
  const supervisor = ['admin', 'desarrollador', 'jefe'].includes(actor?.role?.nombre ?? '') && await hasPermission(userId, 'taller', 'update');
  const resolved = items.every((item) => ['completado', 'omitido'].includes(item.estadoOperativo));
  const approved = items.filter((item) => item.tipoLinea !== 'parte').every((item) => item.qualityStatus === 'aprobado');
  return {
    workOrderId, estado: order.estado, approvedAt: order.qualityApprovedAt ?? null, approvedBy: order.qualityApprovedBy ?? null,
    approvalNote: order.qualityApprovalNote ?? null,
    canConfirm: supervisor && resolved && approved && ['en_progreso', 'finalizada'].includes(order.estado) && !order.qualityApprovedAt,
    items: items.map((item) => ({ id: item.id, descripcion: item.descripcion, tipoLinea: item.tipoLinea, estadoOperativo: item.estadoOperativo,
      qualityStatus: item.qualityStatus ?? 'pendiente', qualityReviewedAt: item.qualityReviewedAt ?? null, qualityReviewedBy: item.qualityReviewedBy ?? null, qualityNote: item.qualityNote ?? null })),
    history: history.map((review) => ({ id: review.id, workOrderItemId: review.workOrderItemId, decision: review.decision, reviewedBy: review.reviewedBy, reviewerName: review.reviewerName, note: review.note, createdAt: review.createdAt })),
  };
};

export const reviewWorkOrderQuality = async (workOrderId: number, itemId: number, data: ReviewWorkOrderQualityInput, userId: number) => {
  await withWorkshopTransaction(async (transaction) => {
    const actor = await requireQualitySupervisor(userId, transaction);
    const order = await WorkOrder.findByPk(workOrderId, { transaction, lock: Transaction.LOCK.UPDATE });
    if (!order) throw ApiError.notFound('Orden de trabajo no encontrada');
    if (['entregada', 'cancelada'].includes(order.estado)) throw ApiError.badRequest('No se puede revisar la calidad de una orden cerrada');
    const item = await WorkOrderItem.findOne({ where: { id: itemId, workOrderId }, transaction, lock: Transaction.LOCK.UPDATE });
    if (!item || item.tipoLinea === 'parte') throw ApiError.badRequest('El control individual de calidad corresponde a los servicios de esta OT');
    if (data.decision === 'aprobar' && item.qualityStatus === 'aprobado') return;
    if (data.decision === 'rechazar' && item.qualityStatus === 'rechazado' && item.estadoOperativo === 'pendiente' && item.qualityNote === data.nota && data.members === undefined) return;
    if (!['completado', 'omitido'].includes(item.estadoOperativo)) throw ApiError.badRequest('El servicio debe estar terminado u omitido antes de revisarlo');
    const decision = data.decision === 'aprobar' ? 'aprobado' : 'rechazado';
    if (data.decision === 'rechazar') {
      await closeWorkOrderTimers(workOrderId, transaction, item.id);
      const previous = item.estadoOperativo;
      await item.update({ estadoOperativo: 'pendiente' }, { transaction });
      await recordChecklistStatusChange(item, previous, userId, transaction);
      await WorkOrderItemAssignment.update({ completedAt: null }, { where: { workOrderItemId: item.id, active: true }, transaction });
      if (data.members !== undefined) await replaceItemTeam(order, item, { members: data.members, motivo: data.nota }, userId, transaction);
      await revokeFinalQuality(workOrderId, userId, data.nota, transaction);
    }
    await item.update({ qualityStatus: decision, qualityReviewedAt: new Date(), qualityReviewedBy: userId, qualityNote: data.nota?.trim() || null }, { transaction });
    const review = await WorkOrderQualityReview.create({ workOrderId, workOrderItemId: itemId, decision, reviewedBy: userId, reviewerName: actor.nombre, note: data.nota?.trim() || null }, { transaction });
    await WorkOrderEvent.create({ workOrderId, actorUserId: userId, tipo: 'actualizacion', descripcion: `Calidad ${decision === 'aprobado' ? 'aprobada' : 'rechazada'}: ${item.descripcion}`, metadata: { qualityReviewId: review.id, itemId, decision, note: data.nota ?? null } }, { transaction });
    await syncMirrorQuotationFromWorkOrder(workOrderId, transaction, true);
  });
  return getWorkOrderQuality(workOrderId, userId);
};
