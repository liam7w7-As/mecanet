import { Op, Transaction } from 'sequelize';

import { closeSession, recalculateItemHours } from './work-order-labor-sessions.js';
import { withWorkshopTransaction } from './workshop-transaction.js';
import { User } from '../models/User.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
import { WorkOrderItemSession } from '../models/WorkOrderItemSession.js';
import { logger } from '../utils/logger.js';

/** Persist the scheduled cutoff even if the browser was closed or the process restarted. */
export async function settleExpiredLaborSessions(now = new Date()): Promise<void> {
  const expired = await WorkOrderItemSession.findAll({ where: { status: 'abierta', scheduledEndAt: { [Op.lte]: now } }, attributes: ['id', 'userId', 'workOrderId', 'workOrderItemId'], order: [['id', 'ASC']], limit: 200 });
  for (const row of expired) await withWorkshopTransaction(async (transaction) => {
    if (row.userId !== null) await User.findByPk(row.userId, { transaction, lock: Transaction.LOCK.UPDATE });
    await WorkOrder.findByPk(row.workOrderId, { transaction, lock: Transaction.LOCK.UPDATE });
    const item = await WorkOrderItem.findByPk(row.workOrderItemId, { transaction, lock: Transaction.LOCK.UPDATE });
    const session = await WorkOrderItemSession.findByPk(row.id, { transaction, lock: Transaction.LOCK.UPDATE });
    if (!session || session.status !== 'abierta' || !session.scheduledEndAt || session.scheduledEndAt > now) return;
    await closeSession(session, 'sistema', transaction, 'Pausa automática al finalizar la jornada. El tiempo adicional requiere registro del jefe con motivo.');
    if (item) await recalculateItemHours(item, transaction);
  });
}

export const startWorkshopShiftWorker = (): (() => void) => {
  let busy = false;
  const tick = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    try { await settleExpiredLaborSessions(); }
    catch (error) { logger.error({ error }, 'No se pudieron pausar los cronómetros al cierre de jornada'); }
    finally { busy = false; }
  };
  void tick();
  const timer = setInterval(() => { void tick(); }, 15000);
  timer.unref();
  return () => clearInterval(timer);
};
