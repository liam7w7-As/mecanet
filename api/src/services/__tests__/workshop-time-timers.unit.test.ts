import { Transaction } from 'sequelize';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { User } from '../../models/User.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { WorkOrderItem } from '../../models/WorkOrderItem.js';
import { WorkOrderItemAssignment } from '../../models/WorkOrderItemAssignment.js';
import { WorkOrderItemSession } from '../../models/WorkOrderItemSession.js';
import { WorkOrderObservation } from '../../models/WorkOrderObservation.js';
import { WorkOrderProgressReport } from '../../models/WorkOrderProgressReport.js';
import { WorkOrderRequest } from '../../models/WorkOrderRequest.js';
import { completeItemTimer, pauseItemTimer, startItemTimer } from '../work-order-labor.service.js';
import { isAssignedToItem } from '../work-order-team-access.js';
import { withWorkshopTransaction } from '../workshop-transaction.js';

// Real timer, closing and recalculation functions, without a connection or test DB setup.
vi.mock('../../config/database.js', () => ({ sequelize: {} }));
vi.mock('../settings.service.js', () => ({}));
vi.mock('../file-storage.service.js', () => ({}));
vi.mock('../customer-email-queue.service.js', () => ({ enqueueWorkOrderProgress: vi.fn() }));
vi.mock('../work-order.service.js', () => ({ assertWorkOrderAccess: vi.fn(), syncMirrorQuotationFromWorkOrder: vi.fn(), consumeCompletedPartStock: vi.fn() }));
vi.mock('../work-order-team.service.js', () => ({ replaceItemTeam: vi.fn() }));
vi.mock('../work-order-quality-state.js', () => ({ invalidateItemQuality: vi.fn() }));
vi.mock('../work-order-team-access.js', () => ({ isAssignedToItem: vi.fn(), getAssignedOrderIds: vi.fn() }));
vi.mock('../workshop-shift-worker.service.js', () => ({ settleExpiredLaborSessions: vi.fn() }));
vi.mock('../workshop-personnel.service.js', () => ({ getWorkerShift: vi.fn(), getWorkshopDayRange: vi.fn() }));
vi.mock('../workshop-transaction.js', () => ({ withWorkshopTransaction: vi.fn() }));

const row = <T>(fields: object): T => {
  const record = { ...fields, update: vi.fn() };
  record.update.mockImplementation(async (changes: object) => Object.assign(record, changes));
  return record as unknown as T;
};
const tx = { LOCK: Transaction.LOCK } as Transaction;
let item: WorkOrderItem;
let session: WorkOrderItemSession;
let worker: User;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-15T11:00:44Z'));
  worker = row<User>({ id: 9, nombre: 'Mecánico', role: { nombre: 'mecanico' } });
  item = row<WorkOrderItem>({ id: 20, workOrderId: 12, tipoLinea: 'especifico', estadoOperativo: 'en_proceso', qualityStatus: 'pendiente', stockConsumido: true, horasHombreReales: 0, notasOperativas: null });
  session = row<WorkOrderItemSession>({ id: 30, workOrderId: 12, workOrderItemId: 20, userId: 9, status: 'abierta', kind: 'cronometro', startedAt: new Date('2026-11-15T11:00:00Z'), endedAt: null, durationMinutes: null, scheduledEndAt: null, supersededAt: null, note: null });
  vi.spyOn(User, 'findByPk').mockResolvedValue(worker);
  vi.spyOn(WorkOrder, 'findByPk').mockResolvedValue(row<WorkOrder>({ id: 12, estado: 'en_progreso', vehicleId: null }));
  vi.spyOn(WorkOrderItem, 'findOne').mockResolvedValue(item);
  vi.spyOn(WorkOrderItem, 'findAll').mockResolvedValue([]);
  vi.spyOn(WorkOrderItemSession, 'findOne').mockResolvedValue(session);
  vi.spyOn(WorkOrderItemSession, 'findAll').mockResolvedValue([session]);
  vi.spyOn(WorkOrderItemAssignment, 'findAll').mockResolvedValue([]);
  vi.spyOn(WorkOrderObservation, 'findAll').mockResolvedValue([]);
  vi.spyOn(WorkOrderProgressReport, 'findAll').mockResolvedValue([]);
  vi.spyOn(WorkOrderRequest, 'findAll').mockResolvedValue([]);
  vi.mocked(withWorkshopTransaction).mockImplementation(async (work) => work(tx));
  vi.mocked(isAssignedToItem).mockResolvedValue(true);
});
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.useRealTimers(); });

describe('Timer operations without a database', () => {
  it('persists the trimmed pause reason and preserves the exact elapsed seconds', async () => {
    await pauseItemTimer(12, 20, 9, '  Falta herramienta  ');
    expect(session).toMatchObject({ status: 'cerrada', note: 'Falta herramienta', closeReason: 'pausa', durationMinutes: 0 });
    expect(session.endedAt).toEqual(new Date('2026-11-15T11:00:44Z'));
    expect(item.horasHombreReales).toBe(0.01);
    expect(WorkOrderItemSession.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { workOrderItemId: 20, status: 'abierta', userId: 9 } }));
  });
  it.each([' ', 'x'.repeat(2001)])('rejects invalid reasons before touching a session', async (note) => {
    await expect(pauseItemTimer(12, 20, 9, note)).rejects.toMatchObject({ statusCode: 400 });
    expect(withWorkshopTransaction).not.toHaveBeenCalled();
    expect(session.update).not.toHaveBeenCalled();
  });
  it('keeps legacy callers compatible when no reason is supplied', async () => {
    await pauseItemTimer(12, 20, 9);
    expect(session.status).toBe('cerrada');
    expect(session.note).toBeNull();
  });
  it('refuses a revoked mechanic without changing or discarding time', async () => {
    vi.mocked(isAssignedToItem).mockResolvedValue(false);
    await expect(pauseItemTimer(12, 20, 9, 'Espera')).rejects.toMatchObject({ statusCode: 403 });
    expect(session.update).not.toHaveBeenCalled();
  });
  it.each(['parte', 'completado', 'omitido'])('blocks timer starts on closed/non-service work: %s', async (state) => {
    if (state === 'parte') item.tipoLinea = state;
    else item.estadoOperativo = state as WorkOrderItem['estadoOperativo'];
    await expect(startItemTimer(12, 20, 9)).rejects.toMatchObject({ statusCode: 400 });
    expect(session.update).not.toHaveBeenCalled();
  });
  it('a chief completing their own team part cannot finish other workers and retains technical notes', async () => {
    worker.role!.nombre = 'jefe';
    item.teamManaged = true;
    const member = row<WorkOrderItemAssignment>({ id: 44, userId: 9, completedAt: null });
    const partner = row<WorkOrderItemAssignment>({ id: 45, userId: 10, completedAt: null });
    vi.mocked(WorkOrderItemAssignment.findAll).mockResolvedValue([member, partner]);
    await completeItemTimer(12, 20, 9, 'Mi revisión terminada');
    expect(member.completedAt).toBeInstanceOf(Date);
    expect(partner.completedAt).toBeNull();
    expect(partner.update).not.toHaveBeenCalled();
    expect(item.estadoOperativo).toBe('en_proceso');
    expect(item.notasOperativas).toBe('Mi revisión terminada');
    expect(WorkOrderItemSession.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { workOrderItemId: 20, status: 'abierta', userId: 9 } }));
  });
  it('rejects chief timer completion when the chief is not a member of the explicit team', async () => {
    worker.role!.nombre = 'jefe';
    item.teamManaged = true;
    vi.mocked(WorkOrderItemAssignment.findAll).mockResolvedValue([row<WorkOrderItemAssignment>({ id: 45, userId: 10, completedAt: null })]);
    await expect(completeItemTimer(12, 20, 9)).rejects.toMatchObject({ statusCode: 403 });
    expect(session.update).not.toHaveBeenCalled();
  });
});
