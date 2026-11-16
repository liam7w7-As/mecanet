import { Transaction } from 'sequelize';

import { minutesToHours } from './work-order-labor-events.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
import { WorkOrderItemSession } from '../models/WorkOrderItemSession.js';
import { canonicalSessionMinutes, sessionMinutesInRange } from '../utils/workshop-session-time.js';

import type { WorkOrderLaborCloseReason } from '@unithor/shared';

export const getSessionMinutes = (session: WorkOrderItemSession, now = new Date()): number => {
  return canonicalSessionMinutes(session, now);
};

export const getSessionMinutesInRange = (
  session: WorkOrderItemSession,
  start: Date,
  endExclusive: Date,
  now: Date,
): number => {
  return sessionMinutesInRange(session, start, endExclusive, now);
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
  const endedAt = new Date(Math.min(Date.now(), session.scheduledEndAt ? new Date(session.scheduledEndAt).getTime() : Infinity));
  const minutes = getSessionMinutes(session, endedAt);
  await session.update(
    {
      status: 'cerrada',
      endedAt,
      // Keep the existing INT column's floor marker. Reads recover exact clock
      // seconds from timestamps; storing a float here would let MySQL round it.
      durationMinutes: session.kind === 'cronometro' ? Math.floor(minutes) : minutes,
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
