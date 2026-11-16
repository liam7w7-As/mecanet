import { Op, Transaction } from 'sequelize';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { User } from '../../models/User.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { WorkOrderItem } from '../../models/WorkOrderItem.js';
import { WorkOrderItemAssignment } from '../../models/WorkOrderItemAssignment.js';
import { WorkOrderItemSession } from '../../models/WorkOrderItemSession.js';
import { WorkshopTimeRequest } from '../../models/WorkshopTimeRequest.js';
import { recordItemProgressEvent } from '../work-order-labor-events.js';
import * as sessionHelpers from '../work-order-labor-sessions.js';
import { getAssignedOrderIds, isAssignedToItem } from '../work-order-team-access.js';
import { syncMirrorQuotationFromWorkOrder } from '../work-order.service.js';
import { getWorkerShift, getWorkshopDayRange } from '../workshop-personnel.service.js';
import { settleExpiredLaborSessions } from '../workshop-shift-worker.service.js';
import {
  createWorkshopTimeRequest,
  getWorkshopTimeEligibleItems,
  getWorkshopTimeJournal,
  reviewWorkshopTimeRequest,
} from '../workshop-time.service.js';
import { withWorkshopTransaction } from '../workshop-transaction.js';

vi.mock('../../models/User.js', () => ({ User: { findByPk: vi.fn(), findAll: vi.fn() } }));
vi.mock('../../models/Role.js', () => ({ Role: class {} }));
vi.mock('../../models/WorkOrder.js', () => ({
  WorkOrder: { findByPk: vi.fn(), findAll: vi.fn() },
}));
vi.mock('../../models/WorkOrderItem.js', () => ({
  WorkOrderItem: { findOne: vi.fn(), findAll: vi.fn() },
}));
vi.mock('../../models/WorkOrderItemSession.js', () => ({
  WorkOrderItemSession: { findOne: vi.fn(), findAll: vi.fn(), create: vi.fn() },
}));
vi.mock('../../models/WorkOrderItemAssignment.js', () => ({
  WorkOrderItemAssignment: { findOne: vi.fn() },
}));
vi.mock('../../models/WorkshopTimeRequest.js', () => ({
  WorkshopTimeRequest: { findByPk: vi.fn(), findOne: vi.fn(), findAll: vi.fn(), create: vi.fn() },
}));
vi.mock('../work-order-labor-events.js', () => ({
  recordItemProgressEvent: vi.fn(),
  roundHours: (hours: number) => Math.round(hours * 100) / 100,
}));
vi.mock('../work-order-team-access.js', () => ({
  isAssignedToItem: vi.fn(),
  getAssignedOrderIds: vi.fn(),
}));
vi.mock('../work-order.service.js', () => ({ syncMirrorQuotationFromWorkOrder: vi.fn() }));
vi.mock('../workshop-personnel.service.js', () => ({
  getWorkerShift: vi.fn(),
  getWorkshopDayRange: vi.fn(),
}));
vi.mock('../workshop-shift-worker.service.js', () => ({ settleExpiredLaborSessions: vi.fn() }));
vi.mock('../workshop-transaction.js', () => ({ withWorkshopTransaction: vi.fn() }));

// Model-shaped records only: no Sequelize instance, registry, connection or DB setup.
const row = <T>(fields: object): T => {
  const record = { ...fields, update: vi.fn() };
  record.update.mockImplementation(async (changes: object) => {
    Object.assign(record, changes);
    return record;
  });
  return record as unknown as T;
};
const mechanic = { id: 9, role: 'mecanico' };
const chief = { id: 1, role: 'jefe' };
const interval = {
  startedAt: '2026-11-15T12:00:00.000Z',
  endedAt: '2026-11-15T13:00:00.000Z',
  note: 'Diagnóstico pendiente de registro',
};
const manual = { workOrderId: 12, itemId: 20, ...interval };
const tx = { LOCK: Transaction.LOCK } as unknown as Transaction;
let worker: User;
let order: WorkOrder;
let item: WorkOrderItem;
let source: WorkOrderItemSession;
let pending: WorkshopTimeRequest;

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-16T19:00:00.000Z'));
  worker = row<User>({
    id: 9,
    nombre: 'Mecánico Uno',
    activo: true,
    deletedAt: null,
    passwordHash: 'SECRET',
  });
  order = row<WorkOrder>({
    id: 12,
    codigo: 'OT-12',
    estado: 'en_progreso',
    assignedMechanicId: 10,
    total: 99000,
    client: { deuda: 8000 },
  });
  item = row<WorkOrderItem>({
    id: 20,
    workOrderId: 12,
    descripcion: 'Diagnóstico',
    tipoLinea: 'especifico',
    assignedUserId: 10,
    estadoOperativo: 'completado',
    horasHombreEstimadas: 1,
    cantidad: 1,
    precioUnitario: 45000,
    subtotal: 45000,
  });
  source = row<WorkOrderItemSession>({
    id: 30,
    workOrderId: 12,
    workOrderItemId: 20,
    userId: 9,
    userName: worker.nombre,
    kind: 'cronometro',
    status: 'cerrada',
    startedAt: new Date('2026-11-15T11:00:00Z'),
    endedAt: new Date('2026-11-15T12:00:00Z'),
    durationMinutes: 60,
    supersededAt: null,
    scheduledEndAt: null,
    note: 'Original',
  });
  pending = row<WorkshopTimeRequest>({
    id: 200,
    kind: 'correction',
    status: 'pendiente',
    workOrderId: 12,
    workOrderItemId: 20,
    userId: 9,
    userName: worker.nombre,
    sourceSessionId: 30,
    replacementSessionId: null,
    startedAt: new Date(interval.startedAt),
    endedAt: new Date(interval.endedAt),
    durationMinutes: 60,
    note: interval.note,
    createdBy: 9,
    createdAt: new Date('2026-11-15T18:00:00Z'),
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
  });
  vi.mocked(User.findByPk).mockResolvedValue(worker);
  vi.mocked(User.findAll).mockResolvedValue([worker]);
  vi.mocked(WorkOrder.findByPk).mockResolvedValue(order);
  vi.mocked(WorkOrder.findAll).mockResolvedValue([order]);
  vi.mocked(WorkOrderItem.findOne).mockResolvedValue(item);
  vi.mocked(WorkOrderItem.findAll).mockResolvedValue([item]);
  vi.mocked(WorkOrderItemSession.findOne).mockResolvedValue(source);
  vi.mocked(WorkOrderItemSession.findAll).mockResolvedValue([]);
  vi.mocked(WorkOrderItemSession.create).mockImplementation(async (values) =>
    row<WorkOrderItemSession>({ id: 100, ...values }),
  );
  vi.mocked(WorkOrderItemAssignment.findOne).mockResolvedValue(
    row<WorkOrderItemAssignment>({ id: 44 }),
  );
  vi.mocked(WorkshopTimeRequest.create).mockImplementation(async (values) =>
    row<WorkshopTimeRequest>({ id: 200, createdAt: new Date(), ...values }),
  );
  vi.mocked(WorkshopTimeRequest.findByPk).mockResolvedValue(pending);
  vi.mocked(WorkshopTimeRequest.findOne).mockResolvedValue(null);
  vi.mocked(WorkshopTimeRequest.findAll).mockResolvedValue([]);
  vi.mocked(isAssignedToItem).mockResolvedValue(true);
  vi.mocked(getAssignedOrderIds).mockResolvedValue([12]);
  vi.mocked(withWorkshopTransaction).mockImplementation(async (work) => work(tx));
  vi.mocked(getWorkerShift).mockResolvedValue({ configured: false, start: null, end: null });
  vi.mocked(getWorkshopDayRange).mockImplementation(async (date) => ({
    start: new Date(`${date}T03:00:00Z`),
    end: new Date(new Date(`${date}T03:00:00Z`).getTime() + 86_400_000),
  }));
  vi.spyOn(sessionHelpers, 'recalculateItemHours').mockResolvedValue(1);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Manual time authorization and validation', () => {
  it('persists mechanic hours visibly pending without creating sessions or adding hours', async () => {
    const request = await createWorkshopTimeRequest(mechanic, manual);
    expect(request).toMatchObject({ status: 'pendiente', userId: 9, durationMinutes: 60 });
    expect(WorkOrderItemSession.create).not.toHaveBeenCalled();
    expect(sessionHelpers.recalculateItemHours).not.toHaveBeenCalled();
    expect(recordItemProgressEvent).not.toHaveBeenCalled();
    expect(User.findByPk).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ transaction: tx, lock: Transaction.LOCK.UPDATE }),
    );
    expect(vi.mocked(User.findByPk).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(WorkOrder.findByPk).mock.invocationCallOrder[0],
    );
  });
  it('accepts chief retroactive/overtime hours for the actual assigned worker with a reason', async () => {
    const request = await createWorkshopTimeRequest(chief, { ...manual, userId: 9 });
    expect(request).toMatchObject({
      status: 'aprobada',
      userId: 9,
      reviewedBy: 1,
      reviewNote: interval.note,
      replacementSessionId: 100,
    });
    expect(WorkOrderItemSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 9,
        createdBy: 1,
        kind: 'manual',
        status: 'cerrada',
        durationMinutes: 60,
        assignmentId: 44,
      }),
      { transaction: tx },
    );
    expect(recordItemProgressEvent).toHaveBeenCalledWith(
      expect.objectContaining({ assignedUserId: 9, performedByUserId: 1, sessionId: 100 }),
      tx,
    );
    expect(syncMirrorQuotationFromWorkOrder).toHaveBeenCalledWith(12, tx, true);
    expect(item.update).toHaveBeenCalledWith(
      { laborValidatedBy: null, laborValidatedAt: null, laborValidationNote: null },
      { transaction: tx },
    );
  });
  it.each(['admin', 'desarrollador', 'jefe'])('recognizes supervisor role %s', async (role) => {
    expect(
      (await createWorkshopTimeRequest({ id: 1, role }, { ...manual, userId: 9 })).status,
    ).toBe('aprobada');
  });
  it('refuses mechanic userId injection even when it points to self', async () => {
    await expect(
      createWorkshopTimeRequest(mechanic, { ...manual, userId: 9 }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  it.each(['vendedor', 'bodeguero', 'finanzas'])('refuses actor role %s', async (role) => {
    await expect(createWorkshopTimeRequest({ id: 9, role }, manual)).rejects.toMatchObject({
      statusCode: 403,
    });
  });
  it.each(['entregada', 'cancelada'])('refuses new manual hours on %s orders', async (estado) => {
    order.estado = estado as WorkOrder['estado'];
    await expect(createWorkshopTimeRequest(mechanic, manual)).rejects.toMatchObject({
      statusCode: 400,
    });
  });
  it('requires a real service and the shared authoritative assignment check, including revoked teams', async () => {
    vi.mocked(isAssignedToItem).mockResolvedValue(false);
    await expect(createWorkshopTimeRequest(mechanic, manual)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(isAssignedToItem).toHaveBeenCalledWith(item, order, 9, tx);
    item.tipoLinea = 'parte';
    await expect(createWorkshopTimeRequest(mechanic, manual)).rejects.toMatchObject({
      statusCode: 400,
    });
  });
  it.each([
    { endedAt: interval.startedAt },
    { note: ' ' },
    { startedAt: '2999-01-01T10:00:00Z', endedAt: '2999-01-01T11:00:00Z' },
  ])('revalidates invalid input at the service boundary', async (patch) => {
    await expect(
      createWorkshopTimeRequest(chief, { ...manual, userId: 9, ...patch }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(withWorkshopTransaction).not.toHaveBeenCalled();
  });
  it('refuses overlaps and duplicates across every OT for the worker', async () => {
    vi.mocked(WorkOrderItemSession.findAll).mockResolvedValue([source]);
    await expect(
      createWorkshopTimeRequest(mechanic, { ...manual, startedAt: '2026-11-15T11:30:00Z' }),
    ).rejects.toMatchObject({ statusCode: 409 });
    const options = vi.mocked(WorkOrderItemSession.findAll).mock.calls[0]?.[0];
    expect(options?.where).toMatchObject({ userId: 9, supersededAt: null });
    expect(options?.where).not.toHaveProperty('workOrderId');
    vi.mocked(WorkOrderItemSession.findAll).mockResolvedValue([]);
    vi.mocked(WorkshopTimeRequest.findOne).mockResolvedValue(pending);
    await expect(createWorkshopTimeRequest(mechanic, manual)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
  it('allows adjacent intervals and hours after an expired scheduled timer end', async () => {
    source.endedAt = null;
    source.scheduledEndAt = new Date(interval.startedAt);
    vi.mocked(WorkOrderItemSession.findAll).mockResolvedValue([source]);
    expect((await createWorkshopTimeRequest(mechanic, manual)).status).toBe('pendiente');
  });
});

describe('Immutable correction requests', () => {
  it('accepts an own closed interval after reassignment without changing the original', async () => {
    vi.mocked(isAssignedToItem).mockResolvedValue(false);
    const request = await createWorkshopTimeRequest(mechanic, { sourceSessionId: 30, ...interval });
    expect(request).toMatchObject({
      kind: 'correction',
      status: 'pendiente',
      sourceSessionId: 30,
      userId: 9,
    });
    expect(source.update).not.toHaveBeenCalled();
    expect(isAssignedToItem).not.toHaveBeenCalled();
    const overlap = vi.mocked(WorkOrderItemSession.findAll).mock.calls[0]?.[0];
    expect(overlap?.where).toMatchObject({ id: { [Op.ne]: 30 } });
  });
  it('always sends chief own corrections through review too', async () => {
    expect(
      (
        await createWorkshopTimeRequest(
          { id: 9, role: 'jefe' },
          { sourceSessionId: 30, ...interval },
        )
      ).status,
    ).toBe('pendiente');
    expect(WorkOrderItemSession.create).not.toHaveBeenCalled();
  });
  it('does not allow corrections of other workers, open, superseded, or adjustment entries', async () => {
    vi.mocked(WorkOrderItemSession.findOne).mockResolvedValueOnce(null);
    await expect(
      createWorkshopTimeRequest(mechanic, { sourceSessionId: 30, ...interval }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(WorkOrderItemSession.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 30, userId: 9 } }),
    );
    source.status = 'abierta';
    await expect(
      createWorkshopTimeRequest(mechanic, { sourceSessionId: 30, ...interval }),
    ).rejects.toMatchObject({ statusCode: 400 });
    source.status = 'cerrada';
    source.supersededAt = new Date();
    await expect(
      createWorkshopTimeRequest(mechanic, { sourceSessionId: 30, ...interval }),
    ).rejects.toMatchObject({ statusCode: 400 });
    source.supersededAt = null;
    source.kind = 'ajuste';
    await expect(
      createWorkshopTimeRequest(mechanic, { sourceSessionId: 30, ...interval }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
  it('approves by superseding only metadata and creating a replacement for the actual worker', async () => {
    source.assignmentId = 43;
    vi.mocked(sessionHelpers.recalculateItemHours)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1.5);
    const original = {
      startedAt: source.startedAt,
      endedAt: source.endedAt,
      durationMinutes: source.durationMinutes,
      note: source.note,
      userId: source.userId,
    };
    const result = await reviewWorkshopTimeRequest(chief, 200, {
      approve: true,
      note: 'Verificado con el trabajador',
    });
    expect(source.update).toHaveBeenCalledOnce();
    expect(source.update).toHaveBeenCalledWith(
      { supersededAt: expect.any(Date) },
      { transaction: tx },
    );
    expect(source).toMatchObject(original);
    expect(result).toMatchObject({ status: 'aprobada', replacementSessionId: 100, reviewedBy: 1 });
    expect(WorkOrderItemSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 9,
        startedAt: pending.startedAt,
        endedAt: pending.endedAt,
        assignmentId: 43,
      }),
      { transaction: tx },
    );
    expect(recordItemProgressEvent).toHaveBeenCalledWith(
      expect.objectContaining({ horasDelta: 0.5, assignedUserId: 9 }),
      tx,
    );
  });
  it('rejects with reason while leaving all original hours untouched', async () => {
    const result = await reviewWorkshopTimeRequest(chief, 200, {
      approve: false,
      note: 'El intervalo original es correcto',
    });
    expect(result.status).toBe('rechazada');
    expect(source.update).not.toHaveBeenCalled();
    expect(WorkOrderItemSession.create).not.toHaveBeenCalled();
    expect(sessionHelpers.recalculateItemHours).not.toHaveBeenCalled();
  });
  it('reserves review to chief roles and requires a reason on rejection too', async () => {
    await expect(
      reviewWorkshopTimeRequest(mechanic, 200, { approve: true, note: 'Autovalidar' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      reviewWorkshopTimeRequest(chief, 200, { approve: false, note: ' ' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
  it('rechecks overlap at approval and rejects repeated review', async () => {
    vi.mocked(WorkshopTimeRequest.findOne).mockResolvedValue(pending);
    await expect(
      reviewWorkshopTimeRequest(chief, 200, { approve: true, note: 'Revisado' }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(source.update).not.toHaveBeenCalled();
    pending.status = 'aprobada';
    await expect(
      reviewWorkshopTimeRequest(chief, 200, { approve: true, note: 'Otra vez' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('Scoped journals and configured shifts', () => {
  it('preserves 44s + 45s in canonical DTOs, day totals and configured shift coverage', async () => {
    const first = row<WorkOrderItemSession>({ ...source, durationMinutes: 0, endedAt: new Date('2026-11-15T11:00:44Z') });
    const second = row<WorkOrderItemSession>({ ...source, id: 31, durationMinutes: 0, startedAt: new Date('2026-11-15T11:01:00Z'), endedAt: new Date('2026-11-15T11:01:45Z') });
    vi.mocked(WorkOrderItemSession.findAll).mockResolvedValue([first, second]);
    vi.mocked(getWorkerShift).mockResolvedValue({ configured: true, start: new Date('2026-11-15T11:00:00Z'), end: new Date('2026-11-15T11:02:00Z') });
    const result = await getWorkshopTimeJournal(mechanic, { fecha: '2026-11-15' });
    expect(result.entries[0].durationMinutes).toBeCloseTo(44 / 60, 12);
    expect(result.entries[1].durationMinutes).toBeCloseTo(45 / 60, 12);
    expect(result.totals.registeredMinutes).toBeCloseTo(89 / 60, 12);
    expect(result.totals.unregisteredMinutes).toBeCloseTo(2 - 89 / 60, 12);
  });
  it('shows prior reassigned own hours without other workers, OT details or financial fields', async () => {
    vi.mocked(isAssignedToItem).mockResolvedValue(false);
    vi.mocked(getAssignedOrderIds).mockResolvedValue([]);
    vi.mocked(WorkOrderItemSession.findAll).mockResolvedValue([source]);
    vi.mocked(WorkshopTimeRequest.findAll).mockResolvedValue([pending]);
    const result = await getWorkshopTimeJournal(mechanic, { fecha: '2026-11-15' });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      userId: 9,
      durationMinutes: 60,
      workOrderCode: 'OT-12',
    });
    expect(result.requests[0]).toMatchObject({ userId: 9, status: 'pendiente' });
    expect(WorkOrderItemSession.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 9 }) }),
    );
    expect(WorkshopTimeRequest.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 9 }) }),
    );
    expect(result.workers).toEqual([{ id: 9, nombre: 'Mecánico Uno' }]);
    expect(JSON.stringify(result)).not.toMatch(
      /precio|subtotal|total":|deuda|SECRET|password|client|costHourly|saleHourly/i,
    );
    expect(isAssignedToItem).not.toHaveBeenCalled();
    expect(settleExpiredLaborSessions).toHaveBeenCalledOnce();
    expect(result.totals).toMatchObject({
      registeredMinutes: 60,
      pendingMinutes: 60,
      scheduledMinutes: null,
      unregisteredMinutes: null,
    });
  });
  it('forbids mechanic worker filters on both journal and eligible selectors', async () => {
    await expect(
      getWorkshopTimeJournal(mechanic, { fecha: '2026-11-15', userId: 10 }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(getWorkshopTimeEligibleItems(mechanic, 10)).rejects.toMatchObject({
      statusCode: 403,
    });
  });
  it('uses configured timezone day bounds instead of server midnight', async () => {
    await getWorkshopTimeJournal(mechanic, { fecha: '2026-11-15' });
    expect(getWorkshopDayRange).toHaveBeenCalledWith('2026-11-15');
    expect(WorkOrderItemSession.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          startedAt: { [Op.lt]: new Date('2026-11-16T03:00:00Z') },
        }),
      }),
    );
  });
  it('distinguishes configured days off from missing configuration', async () => {
    vi.mocked(getWorkerShift).mockResolvedValue({ configured: true, start: null, end: null });
    expect((await getWorkshopTimeJournal(mechanic, { fecha: '2026-11-15' })).totals).toMatchObject({
      scheduledMinutes: 0,
      unregisteredMinutes: 0,
    });
  });
  it('does not use overtime or superseded history to fill gaps in the configured shift', async () => {
    vi.mocked(getWorkerShift).mockResolvedValue({
      configured: true,
      start: new Date('2026-11-15T11:00:00Z'),
      end: new Date('2026-11-15T15:00:00Z'),
    });
    const overtime = row<WorkOrderItemSession>({
      ...source,
      id: 31,
      startedAt: new Date('2026-11-15T17:00:00Z'),
      endedAt: new Date('2026-11-15T18:00:00Z'),
    });
    const historical = row<WorkOrderItemSession>({
      ...source,
      id: 32,
      supersededAt: new Date(),
      startedAt: new Date('2026-11-15T12:00:00Z'),
      endedAt: new Date('2026-11-15T15:00:00Z'),
      durationMinutes: 180,
    });
    vi.mocked(WorkOrderItemSession.findAll).mockResolvedValue([source, overtime, historical]);
    const result = await getWorkshopTimeJournal(mechanic, { fecha: '2026-11-15' });
    expect(result.totals).toMatchObject({
      registeredMinutes: 120,
      scheduledMinutes: 240,
      unregisteredMinutes: 180,
    });
    expect(result.entries.find((entry) => entry.id === 32)).toMatchObject({
      minutesOnDate: 0,
      durationMinutes: 180,
    });
  });
  it('uses shared team helpers for selectors and supports authentic legacy fallback', async () => {
    expect(await getWorkshopTimeEligibleItems(mechanic)).toEqual([
      {
        workOrderId: 12,
        workOrderCode: 'OT-12',
        itemId: 20,
        description: 'Diagnóstico',
        userId: 9,
      },
    ]);
    expect(getAssignedOrderIds).toHaveBeenCalledWith(9);
    vi.mocked(isAssignedToItem).mockResolvedValue(false);
    expect(await getWorkshopTimeEligibleItems(mechanic)).toEqual([]);
  });
});
