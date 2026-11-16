import { Transaction } from 'sequelize';

import { notifyUsers } from './notification.service.js';
import { closeSession, recalculateItemHours } from './work-order-labor-sessions.js';
import { invalidateItemQuality } from './work-order-quality-state.js';
import { getWorkerRateSnapshot } from './workshop-personnel.service.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderEvent } from '../models/WorkOrderEvent.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
import { WorkOrderItemAssignment } from '../models/WorkOrderItemAssignment.js';
import { WorkOrderItemSession } from '../models/WorkOrderItemSession.js';
import { ApiError } from '../utils/ApiError.js';

import type { AssignWorkOrderTeamInput } from '@unithor/shared';

export const replaceItemTeam = async (order: WorkOrder, item: WorkOrderItem, data: AssignWorkOrderTeamInput, actorId: number, transaction: Transaction, notify = true): Promise<void> => {
  if (['entregada', 'cancelada'].includes(order.estado)) throw ApiError.badRequest('La orden de trabajo está cerrada');
  if (data.members.reduce((sum, member) => sum + (member.estimatedHours ?? 0), 0) / Number(item.cantidad) > 9999.99) throw ApiError.badRequest('El total de horas estimadas supera la capacidad del servicio');
  const previous = await WorkOrderItemAssignment.findAll({ where: { workOrderItemId: item.id, active: true }, transaction, lock: Transaction.LOCK.UPDATE });
  const memberChanged = previous.length !== data.members.length || previous.some((old) => !data.members.some((m) => m.userId === old.userId && (m.specialtyId === undefined || m.specialtyId === old.specialtyId)));
  if (memberChanged) await invalidateItemQuality(item, actorId, 'Equipo del servicio modificado', transaction);
  const before = previous.map((row) => ({ id: row.id, userId: row.userId, specialtyId: row.specialtyId, estimatedHours: row.estimatedHours }));
  for (const member of data.members) {
    const worker = await User.findOne({ where: { id: member.userId, activo: true }, include: [{ model: Role, as: 'role', where: { nombre: 'mecanico' }, attributes: ['nombre'] }], transaction });
    if (!worker) throw ApiError.badRequest('El trabajador seleccionado no existe o no está activo');
    const existing = previous.find((row) => row.userId === member.userId && (member.specialtyId === undefined || row.specialtyId === member.specialtyId));
    if (existing) {
      await existing.update({ estimatedHours: member.estimatedHours }, { transaction });
    } else {
      const snapshot = await getWorkerRateSnapshot(member.userId, member.specialtyId ?? null, new Date(), transaction);
      await WorkOrderItemAssignment.create({ workOrderId: order.id, workOrderItemId: item.id, userId: worker.id, userName: worker.nombre,
        ...snapshot, estimatedHours: member.estimatedHours, originalEstimatedHours: member.estimatedHours, createdBy: actorId }, { transaction });
    }
  }
  for (const old of previous) {
    const retained = data.members.some((m) => m.userId === old.userId && (m.specialtyId === undefined || m.specialtyId === old.specialtyId));
    if (retained) continue;
    await old.update({ active: false }, { transaction });
    const sessions = await WorkOrderItemSession.findAll({ where: { workOrderItemId: item.id, userId: old.userId, status: 'abierta' }, transaction, lock: Transaction.LOCK.UPDATE });
    for (const session of sessions) await closeSession(session, 'sistema', transaction, `Reasignación: ${data.motivo}`);
  }
  // A legacy timer may predate the first explicit team.
  const sessions = await WorkOrderItemSession.findAll({ where: { workOrderItemId: item.id, status: 'abierta' }, transaction, lock: Transaction.LOCK.UPDATE });
  for (const session of sessions) if (!data.members.some((m) => m.userId === session.userId)) await closeSession(session, 'sistema', transaction, data.motivo);
  const estimate = data.members.length ? (data.members.every((m) => m.estimatedHours === null) ? null : data.members.reduce((sum, m) => sum + (m.estimatedHours ?? 0), 0) / Number(item.cantidad)) : item.horasHombreEstimadas;
  const needsReopen = item.estadoOperativo === 'completado' && data.members.some((m) => !previous.some((old) => old.userId === m.userId && old.completedAt));
  await item.update({ teamManaged: true, assignedUserId: data.members[0]?.userId ?? null, horasHombreEstimadas: estimate, ...(needsReopen ? { estadoOperativo: 'en_proceso', laborValidatedAt: null, laborValidatedBy: null } : {}) }, { transaction });
  await recalculateItemHours(item, transaction);
  await WorkOrderEvent.create({ workOrderId: order.id, actorUserId: actorId, tipo: 'asignacion_mecanico', descripcion: `Equipo de trabajo actualizado: ${item.descripcion}`,
    metadata: { itemId: item.id, motivo: data.motivo, before, after: data.members } }, { transaction });
  const newWorkers = data.members.filter((member) => member.userId !== actorId && !previous.some((old) => old.userId === member.userId)).map((member) => member.userId);
  if (notify && newWorkers.length) await notifyUsers(newWorkers, { tipo: 'mecanico_asignado', titulo: `Te asignaron un trabajo en ${order.codigo}`, mensaje: `${item.descripcion} quedó a tu cargo en el taller.`, href: `/work-orders/mine?manage=${order.id}`, workOrderId: order.id, actorId }, transaction);
};
