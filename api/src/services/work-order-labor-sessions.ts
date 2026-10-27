import { Transaction } from 'sequelize';

import { minutesToHours } from './work-order-labor-events.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
import { WorkOrderItemSession } from '../models/WorkOrderItemSession.js';

import type { WorkOrderLaborCloseReason } from '@unithor/shared';

export const getSessionMinutes = (session: WorkOrderItemSession, now = new Date()): number => {
  if (session.durationMinutes !== null && session.durationMinutes !== undefined) {
    return Number(session.durationMinutes);
  }
  const end = session.endedAt ? new Date(session.endedAt).getTime() : now.getTime();
  return Math.max(0, Math.floor((end - new Date(session.startedAt).getTime()) / 60000));
};

export const getSessionMinutesInRange = (
  session: WorkOrderItemSession,
  start: Date,
  endExclusive: Date,
  now: Date,
): number => {
  const started = new Date(session.startedAt).getTime();
  if (session.kind === 'ajuste') {
    return started >= start.getTime() && started < endExclusive.getTime()
      ? getSessionMinutes(session, now)
      : 0;
  }
  const ended = session.endedAt ? new Date(session.endedAt).getTime() : now.getTime();
  return Math.max(
    0,
    Math.floor(
      (Math.min(ended, endExclusive.getTime()) - Math.max(started, start.getTime())) / 60000,
    ),
  );
};

export const recalculateItemHours = async (
  item: WorkOrderItem,
  transaction: Transaction,
): Promise<number | null> => {
  const sessions = await WorkOrderItemSession.findAll({
    where: { workOrderItemId: item.id },
    transaction,
  });
  const hours = sessions.length
    ? minutesToHours(sessions.reduce((sum, session) => sum + getSessionMinutes(session), 0))
    : null;
  await item.update({ horasHombreReales: hours }, { transaction });
  return hours;
};

export const closeSession = async (
  session: WorkOrderItemSession,
  reason: WorkOrderLaborCloseReason,
  transaction: Transaction,
  note?: string | null,
): Promise<number> => {
  const endedAt = new Date();
  const minutes = getSessionMinutes(session, endedAt);
  await session.update(
    {
      status: 'cerrada',
      endedAt,
      durationMinutes: minutes,
      closeReason: reason,
      ...(note !== undefined ? { note } : {}),
    },
    { transaction },
  );
  return minutes;
};

export const closeWorkOrderTimers = async (
  workOrderId: number,
  transaction: Transaction,
  itemId?: number,
): Promise<void> => {
  const sessions = await WorkOrderItemSession.findAll({
    where: {
      workOrderId,
      status: 'abierta',
      ...(itemId !== undefined ? { workOrderItemId: itemId } : {}),
    },
    transaction,
    lock: Transaction.LOCK.UPDATE,
    order: [['id', 'ASC']],
  });
  for (const session of sessions) await closeSession(session, 'sistema', transaction);
  for (const id of new Set(sessions.map((session) => session.workOrderItemId))) {
    const item = await WorkOrderItem.findByPk(id, { transaction, lock: Transaction.LOCK.UPDATE });
    if (item) await recalculateItemHours(item, transaction);
  }
};
