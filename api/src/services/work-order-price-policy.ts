import { Transaction } from 'sequelize';

import { withWorkshopTransaction } from './workshop-transaction.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderEvent } from '../models/WorkOrderEvent.js';
import { ApiError } from '../utils/ApiError.js';

export async function getPriceActor(userId: number, transaction?: Transaction): Promise<User> {
  const actor = await User.findOne({ where: { id: userId, activo: true }, include: [{ model: Role, as: 'role', attributes: ['nombre'] }], transaction });
  if (!actor?.role) throw ApiError.forbidden('El usuario no tiene un rol activo');
  return actor;
}

export function assertOpenPriceOrder(order: WorkOrder): void {
  if (['entregada', 'cancelada'].includes(order.estado)) throw ApiError.badRequest('La orden de trabajo está cerrada');
}

export async function getWorkOrderPricePolicy(id: number, userId: number) {
  const actor = await getPriceActor(userId);
  if (!['admin', 'desarrollador', 'jefe'].includes(actor.role!.nombre)) throw ApiError.forbidden('Esta acción requiere al jefe de taller o administración');
  const order = await WorkOrder.findByPk(id);
  if (!order) throw ApiError.notFound('Orden de trabajo no encontrada');
  return { approvalRequired: order.priceApprovalRequired, canConfigure: ['admin', 'desarrollador'].includes(actor.role!.nombre) };
}

export async function updateWorkOrderPricePolicy(id: number, required: boolean, userId: number) {
  await withWorkshopTransaction(async (transaction) => {
    const actor = await getPriceActor(userId, transaction);
    if (!['admin', 'desarrollador'].includes(actor.role!.nombre)) throw ApiError.forbidden('Solo administración puede configurar la aprobación de precios');
    const order = await WorkOrder.findByPk(id, { transaction, lock: Transaction.LOCK.UPDATE });
    if (!order) throw ApiError.notFound('Orden de trabajo no encontrada');
    assertOpenPriceOrder(order);
    if (order.priceApprovalRequired === required) return;
    await order.update({ priceApprovalRequired: required }, { transaction });
    await WorkOrderEvent.create({ workOrderId: id, actorUserId: userId, tipo: 'actualizacion', descripcion: required ? 'Se requiere aprobación administrativa para cambiar precios' : 'Administración autorizó aplicar precios directamente en esta OT', metadata: { priceApprovalRequired: required } }, { transaction });
  });
  return getWorkOrderPricePolicy(id, userId);
}

/** Existing service prices always go through the audited proposal flow, including direct mode. */
export async function assertChiefPriceEditsAllowed(userId: number, changed: boolean, transaction: Transaction): Promise<void> {
  if (!changed) return;
  const actor = await getPriceActor(userId, transaction);
  if (actor.role!.nombre === 'jefe') throw ApiError.forbidden('Para cambiar el precio de un servicio utiliza Propuestas de precio en Gestionar trabajo');
}
