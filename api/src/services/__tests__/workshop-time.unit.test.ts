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
  it('inherits overtime from the source through submission and approval without changing its audit label', async () => {
    source.overtime = true;
    vi.mocked(getWorkerShift).mockResolvedValue({ configured: true, start: null, end: null });
    const created = await createWorkshopTimeRequest(mechanic, { sourceSessionId: 30, ...interval });
    expect(created).toMatchObject({ overtime: true, status: 'pendiente' });
    expect(source.update).not.toHaveBeenCalled();
    // Approval uses the authoritative source even for an older pending request.
    pending.overtime = false;
    const approved = await reviewWorkshopTimeRequest(chief, 200, { approve: true, note: 'Intervalo confirmado' });
    expect(approved.overtime).toBe(true);
    expect(WorkOrderItemSession.create).toHaveBeenCalledWith(expect.objectContaining({ overtime: true }), { transaction: tx });
    expect(source.overtime).toBe(true);
  });

  it('revalidates inherited overtime against the ordinary schedule on submission and approval', async () => {
    source.overtime = true;
    vi.mocked(getWorkerShift).mockResolvedValue({ configured: true, start: new Date(interval.startedAt), end: new Date(interval.endedAt) });
    await expect(createWorkshopTimeRequest(mechanic, { sourceSessionId: 30, ...interval })).rejects.toMatchObject({ statusCode: 400 });
    await expect(reviewWorkshopTimeRequest(chief, 200, { approve: true, note: 'Revisado' })).rejects.toMatchObject({ statusCode: 400 });
    expect(source.update).not.toHaveBeenCalled();
    expect(WorkOrderItemSession.create).not.toHaveBeenCalled();
  });
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
  it('counts all shift segments while excluding lunch and extra work from ordinary coverage', async () => {
    vi.mocked(getWorkerShift).mockResolvedValue({
      configured: true,
      start: new Date('2026-11-15T18:00:00Z'),
      end: new Date('2026-11-15T22:00:00Z'),
      intervals: [
        { start: new Date('2026-11-15T13:00:00Z'), end: new Date('2026-11-15T17:00:00Z') },
        { start: new Date('2026-11-15T18:00:00Z'), end: new Date('2026-11-15T22:00:00Z') },
      ],
    });
    vi.mocked(WorkOrderItemSession.findAll).mockResolvedValue([
      row<WorkOrderItemSession>({ ...source, startedAt: new Date('2026-11-15T13:00:00Z'), endedAt: new Date('2026-11-15T17:00:00Z'), durationMinutes: 240 }),
      row<WorkOrderItemSession>({ ...source, id: 31, overtime: true, startedAt: new Date('2026-11-15T17:00:00Z'), endedAt: new Date('2026-11-15T18:00:00Z'), durationMinutes: 60 }),
      row<WorkOrderItemSession>({ ...source, id: 32, overtime: true, supersededAt: new Date(), durationMinutes: 60 }),
    ]);
    const journal = await getWorkshopTimeJournal(mechanic, { fecha: '2026-11-15' });
    expect(journal.totals).toMatchObject({ registeredMinutes: 300, scheduledMinutes: 480, unregisteredMinutes: 240 });
    expect(journal.entries.find((entry) => entry.id === 31)?.overtime).toBe(true);
    expect(journal.entries.find((entry) => entry.id === 32)).toMatchObject({ overtime: true, minutesOnDate: 0 });
  });
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

describe('Explicit operational overtime', () => {
  beforeEach(() => {
    vi.mocked(getWorkshopDayRange).mockImplementation(async (date) => ({
      start: new Date(`${date}T04:00:00Z`),
      end: new Date(new Date(`${date}T04:00:00Z`).getTime() + 86_400_000),
    }));
    vi.mocked(getWorkerShift).mockImplementation(async (_userId, at) => {
      const local = new Date(at.getTime() - 4 * 60 * 60_000);
      const date = local.toISOString().slice(0, 10);
      const weekday = local.getUTCDay();
      if (weekday === 0) return { configured: true, start: null, end: null };
      const morning = { start: new Date(`${date}T13:00:00Z`), end: new Date(`${date}T17:00:00Z`) };
      if (weekday === 6) return { configured: true, ...morning };
      const afternoon = { start: new Date(`${date}T18:00:00Z`), end: new Date(`${date}T22:00:00Z`) };
      return { configured: true, ...(at < morning.end ? morning : afternoon), intervals: [morning, afternoon] };
    });
  });

  it('forbids a mechanic from declaring extra hours before acquiring locks or writing', async () => {
    await expect(createWorkshopTimeRequest(mechanic, { ...manual, overtime: true })).rejects.toMatchObject({ statusCode: 403 });
    expect(withWorkshopTransaction).not.toHaveBeenCalled();
    expect(WorkshopTimeRequest.create).not.toHaveBeenCalled();
  });

  it.each(['jefe', 'admin', 'desarrollador'])('allows explicit extra hours for a supervisor: %s', async (role) => {
    const result = await createWorkshopTimeRequest({ id: 1, role }, { ...manual, userId: 9, overtime: true,
      startedAt: '2026-11-13T18:00:00-04:00', endedAt: '2026-11-13T19:00:00-04:00' });
    expect(result).toMatchObject({ overtime: true, status: 'aprobada', durationMinutes: 60 });
    expect(WorkOrderItemSession.create).toHaveBeenCalledOnce();
    expect(WorkOrderItemSession.create).toHaveBeenCalledWith(expect.objectContaining({ overtime: true, durationMinutes: 60 }), { transaction: tx });
    expect(getWorkerShift).toHaveBeenCalledWith(9, expect.any(Date), tx);
  });

  it.each([
    ['2026-11-13T08:00:00-04:00', '2026-11-13T09:00:00-04:00'],
    ['2026-11-13T13:00:00-04:00', '2026-11-13T14:00:00-04:00'],
    ['2026-11-14T13:00:00-04:00', '2026-11-14T14:00:00-04:00'],
    ['2026-11-15T09:00:00-04:00', '2026-11-15T10:00:00-04:00'],
    ['2026-11-13T23:00:00-04:00', '2026-11-14T09:00:00-04:00'],
  ])('allows intervals completely outside ordinary work: %s — %s', async (startedAt, endedAt) => {
    expect((await createWorkshopTimeRequest(chief, { ...manual, userId: 9, overtime: true, startedAt, endedAt })).overtime).toBe(true);
  });

  it.each([
    ['2026-11-13T09:00:00-04:00', '2026-11-13T10:00:00-04:00'],
    ['2026-11-13T08:00:00-04:00', '2026-11-13T09:01:00-04:00'],
    ['2026-11-13T13:00:00-04:00', '2026-11-13T14:01:00-04:00'],
    ['2026-11-13T17:30:00-04:00', '2026-11-13T19:00:00-04:00'],
    ['2026-11-14T12:30:00-04:00', '2026-11-14T14:00:00-04:00'],
    ['2026-11-13T23:00:00-04:00', '2026-11-14T09:01:00-04:00'],
    ['2026-11-13T18:00:00-04:00', '2026-11-16T10:00:00-04:00'],
  ])('rejects any ordinary overlap, including subsequent days: %s — %s', async (startedAt, endedAt) => {
    await expect(createWorkshopTimeRequest(chief, { ...manual, userId: 9, overtime: true, startedAt, endedAt })).rejects.toMatchObject({ statusCode: 400 });
    expect(WorkshopTimeRequest.create).not.toHaveBeenCalled();
    expect(WorkOrderItemSession.create).not.toHaveBeenCalled();
  });

  it('uses all intervals even when start/end point to the last segment', async () => {
    vi.mocked(getWorkerShift).mockResolvedValue({ configured: true,
      start: new Date('2026-11-13T18:00:00Z'), end: new Date('2026-11-13T22:00:00Z'),
      intervals: [{ start: new Date('2026-11-13T13:00:00Z'), end: new Date('2026-11-13T17:00:00Z') },
        { start: new Date('2026-11-13T18:00:00Z'), end: new Date('2026-11-13T22:00:00Z') }] });
    await expect(createWorkshopTimeRequest(chief, { ...manual, userId: 9, overtime: true,
      startedAt: '2026-11-13T09:00:00-04:00', endedAt: '2026-11-13T10:00:00-04:00' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('requires a configured ordinary schedule to validate an extra interval', async () => {
    vi.mocked(getWorkerShift).mockResolvedValue({ configured: false, start: null, end: null });
    await expect(createWorkshopTimeRequest(chief, { ...manual, userId: 9, overtime: true })).rejects.toMatchObject({ statusCode: 422 });
  });

  it('rejects extra intervals longer than 24 hours before any daily schedule queries', async () => {
    await expect(createWorkshopTimeRequest(chief, { ...manual, userId: 9, overtime: true,
      startedAt: '1900-01-01T00:00:00Z', endedAt: '2026-11-15T00:00:00Z' })).rejects.toMatchObject({ statusCode: 400 });
    expect(getWorkerShift).not.toHaveBeenCalled();
    expect(getWorkshopDayRange).not.toHaveBeenCalled();
  });

  it('retains the shared overlap check and never automatically tags a late manual interval', async () => {
    const late = { ...manual, userId: 9, startedAt: '2026-11-13T18:00:00-04:00', endedAt: '2026-11-13T19:00:00-04:00' };
    expect((await createWorkshopTimeRequest(chief, late)).overtime).toBe(false);
    expect(getWorkerShift).not.toHaveBeenCalled();
    vi.mocked(WorkOrderItemSession.findAll).mockResolvedValue([row<WorkOrderItemSession>({ ...source,
      startedAt: new Date(late.startedAt), endedAt: new Date(late.endedAt) })]);
    await expect(createWorkshopTimeRequest(chief, { ...late, overtime: true })).rejects.toMatchObject({ statusCode: 409 });
  });
});
