import { Op, Transaction, UniqueConstraintError } from 'sequelize';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { User } from '../../models/User.js';
import { Vehicle } from '../../models/Vehicle.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { WorkOrderItem } from '../../models/WorkOrderItem.js';
import { WorkOrderItemAssignment } from '../../models/WorkOrderItemAssignment.js';
import { WorkOrderItemProgressEvent } from '../../models/WorkOrderItemProgressEvent.js';
import { WorkOrderItemSession } from '../../models/WorkOrderItemSession.js';
import { WorkshopTimeRequest } from '../../models/WorkshopTimeRequest.js';
import { recordItemProgressEvent, synchronizeTeamCompletion } from '../work-order-labor-events.js';
import * as sessionHelpers from '../work-order-labor-sessions.js';
import { invalidateItemQuality } from '../work-order-quality-state.js';
import { getAssignedOrderIds, isAssignedToItem } from '../work-order-team-access.js';
import { syncMirrorQuotationFromWorkOrder } from '../work-order.service.js';
import { getWorkerShift, getWorkshopDayRange } from '../workshop-personnel.service.js';
import { settleExpiredLaborSessions } from '../workshop-shift-worker.service.js';
import {
  createWorkshopDailyEntry,
  createWorkshopTimeRequest,
  getWorkshopTimeEligibleItems,
  getWorkshopTimeJournal,
  reviewWorkshopTimeRequest,
} from '../workshop-time.service.js';
import { withWorkshopTransaction } from '../workshop-transaction.js';

vi.mock('../../models/User.js', () => ({ User: { findByPk: vi.fn(), findAll: vi.fn() } }));
vi.mock('../../models/Role.js', () => ({ Role: class {} }));
vi.mock('../../models/Vehicle.js', () => ({ Vehicle: { findByPk: vi.fn() } }));
vi.mock('../../models/WorkOrderItemProgressEvent.js', () => ({ WorkOrderItemProgressEvent: { findOne: vi.fn() } }));
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
  WorkOrderItemAssignment: { findOne: vi.fn(), findAll: vi.fn() },
}));
vi.mock('../../models/WorkshopTimeRequest.js', () => ({
  WorkshopTimeRequest: { findByPk: vi.fn(), findOne: vi.fn(), findAll: vi.fn(), create: vi.fn() },
}));
vi.mock('../work-order-labor-events.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../work-order-labor-events.js')>(),
  recordItemProgressEvent: vi.fn(),
  synchronizeTeamCompletion: vi.fn(),
}));
vi.mock('../work-order-quality-state.js', () => ({ invalidateItemQuality: vi.fn() }));
vi.mock('../work-order-item-links.js', () => ({ ensureQuotationItemLinks: vi.fn() }));
vi.mock('../../models/Quotation.js', () => ({ Quotation: {} }));
vi.mock('../../models/WorkOrderEvent.js', () => ({ WorkOrderEvent: { create: vi.fn() } }));
vi.mock('../../models/WorkOrderQualityReview.js', () => ({ WorkOrderQualityReview: {} }));
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
    vehicleId: 5,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    total: 99000,
    client: { deuda: 8000 },
  });
  item = row<WorkOrderItem>({
    id: 20,
    workOrderId: 12,
    descripcion: 'Diagnóstico',
    tipoLinea: 'especifico',
    createdAt: new Date('2026-11-01T00:00:00Z'),
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
  vi.mocked(Vehicle.findByPk).mockResolvedValue(row<Vehicle>({ id: 5 }));
  vi.mocked(WorkOrderItemProgressEvent.findOne).mockResolvedValue(null);
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
    row<WorkOrderItemAssignment>({ id: 44, userId: 9, active: true, completedAt: null, createdAt: new Date('2026-11-01T00:00:00Z') }),
  );
  vi.mocked(WorkOrderItemAssignment.findAll).mockResolvedValue([]);
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
  vi.restoreAllMocks();
});

describe('Manual time authorization and validation', () => {
  it('captures optional activity and assignment, without applying either before chief approval', async () => {
    item.estadoOperativo = 'pendiente';
    vi.mocked(WorkOrderItemProgressEvent.findOne).mockResolvedValue(row<WorkOrderItemProgressEvent>({ id: 7 }));
    const request = await createWorkshopTimeRequest(mechanic, { ...manual, activityStatus: 'completado' });
    expect(request).toMatchObject({ status: 'pendiente', activityStatus: 'completado' });
    expect(WorkshopTimeRequest.create).toHaveBeenCalledWith(expect.objectContaining({ assignmentId: 44, stateEventId: 7, activityStatus: 'completado' }), { transaction: tx });
    expect(item.update).not.toHaveBeenCalled();
    expect(synchronizeTeamCompletion).not.toHaveBeenCalled();
  });
  it.each(['order', 'item', 'assignment'])('rejects API intervals predating their %s origin', async (origin) => {
    const afterStart = new Date('2026-11-15T12:00:01Z');
    if (origin === 'order') order.createdAt = afterStart;
    if (origin === 'item') item.createdAt = afterStart;
    if (origin === 'assignment') vi.mocked(WorkOrderItemAssignment.findOne).mockResolvedValue(row<WorkOrderItemAssignment>({ id: 44, createdAt: afterStart }));
    await expect(createWorkshopTimeRequest(mechanic, manual)).rejects.toMatchObject({ statusCode: 400 });
    expect(WorkshopTimeRequest.create).not.toHaveBeenCalled();
  });
  it('rejects missing/removed vehicles and quality-approved or omitted services', async () => {
    order.vehicleId = null;
    await expect(createWorkshopTimeRequest(mechanic, manual)).rejects.toMatchObject({ statusCode: 400 });
    order.vehicleId = 5;
    vi.mocked(Vehicle.findByPk).mockResolvedValueOnce(null);
    await expect(createWorkshopTimeRequest(mechanic, manual)).rejects.toMatchObject({ statusCode: 400 });
    item.qualityStatus = 'aprobado';
    await expect(createWorkshopTimeRequest(mechanic, manual)).rejects.toMatchObject({ statusCode: 400 });
    item.qualityStatus = 'pendiente';
    item.estadoOperativo = 'omitido';
    await expect(createWorkshopTimeRequest(mechanic, manual)).rejects.toMatchObject({ statusCode: 400 });
    expect(WorkshopTimeRequest.create).not.toHaveBeenCalled();
  });
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
  it.each(['finalizada', 'entregada', 'cancelada'])('refuses new manual hours on %s orders', async (estado) => {
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

describe('Approval applies only the current worker activity', () => {
  let member: WorkOrderItemAssignment;
  let partner: WorkOrderItemAssignment;
  beforeEach(() => {
    item.estadoOperativo = 'en_proceso';
    item.teamManaged = true;
    item.qualityStatus = 'pendiente';
    pending.kind = 'manual';
    pending.sourceSessionId = null;
    pending.assignmentId = 44;
    pending.activityStatus = 'completado';
    pending.stateEventId = null;
    member = row<WorkOrderItemAssignment>({ id: 44, userId: 9, active: true, completedAt: null, createdAt: new Date('2026-11-01T00:00:00Z') });
    partner = row<WorkOrderItemAssignment>({ id: 45, userId: 10, active: true, completedAt: null });
    vi.mocked(WorkOrderItemAssignment.findOne).mockResolvedValue(member);
    vi.mocked(WorkOrderItemAssignment.findAll).mockResolvedValue([member, partner]);
    vi.mocked(WorkOrderItemSession.findOne).mockResolvedValue(null);
  });
  const approve = () => reviewWorkshopTimeRequest(chief, 200, { approve: true, note: 'Actividad verificada' });
  it('finishes just the applicant part while retaining the unfinished team', async () => {
    await approve();
    expect(member.completedAt).toEqual(pending.endedAt);
    expect(partner.update).not.toHaveBeenCalled();
    expect(item.estadoOperativo).toBe('en_proceso');
    expect(synchronizeTeamCompletion).not.toHaveBeenCalled();
    expect(WorkOrderItemSession.create).toHaveBeenCalledWith(expect.objectContaining({ assignmentId: 44 }), { transaction: tx });
    expect(recordItemProgressEvent).toHaveBeenCalledWith(expect.objectContaining({ fromStatus: 'en_proceso', toStatus: 'en_proceso' }), tx);
  });
  it('completes the service only after every active team member finishes and requires quality', async () => {
    partner.completedAt = new Date('2026-11-15T11:00:00Z');
    await approve();
    expect(item.estadoOperativo).toBe('completado');
    expect(synchronizeTeamCompletion).toHaveBeenCalledWith(item, 'en_proceso', tx);
    expect(invalidateItemQuality).toHaveBeenCalledWith(item, 1, expect.any(String), tx);
    expect(item.qualityStatus).toBe('pendiente');
    expect(recordItemProgressEvent).toHaveBeenCalledWith(expect.objectContaining({ fromStatus: 'en_proceso', toStatus: 'completado' }), tx);
  });
  it('can advance pending work to in-progress without clearing completed teammate progress', async () => {
    item.estadoOperativo = 'pendiente';
    pending.activityStatus = 'en_proceso';
    partner.completedAt = new Date('2026-11-15T11:00:00Z');
    await approve();
    expect(item.estadoOperativo).toBe('en_proceso');
    expect(member.completedAt).toBeNull();
    expect(partner.completedAt).not.toBeNull();
    expect(partner.update).not.toHaveBeenCalled();
  });
  it.each(['revoked', 'new-state', 'new-timer', 'quality', 'closed', 'already-completed'])('accepts historical hours but does not replay activity after %s', async (change) => {
    if (change === 'revoked') vi.mocked(WorkOrderItemAssignment.findAll).mockResolvedValue([partner]);
    if (change === 'new-state') vi.mocked(WorkOrderItemProgressEvent.findOne).mockResolvedValue(row<WorkOrderItemProgressEvent>({ id: 99 }));
    if (change === 'new-timer') vi.mocked(WorkOrderItemSession.findOne).mockResolvedValue(source);
    if (change === 'quality') item.qualityStatus = 'aprobado';
    if (change === 'closed') order.estado = 'entregada';
    if (change === 'already-completed') { item.estadoOperativo = 'completado'; pending.activityStatus = 'en_proceso'; }
    const previousStatus = item.estadoOperativo;
    const result = await approve();
    expect(result.status).toBe('aprobada');
    expect(member.update).not.toHaveBeenCalled();
    expect(partner.update).not.toHaveBeenCalled();
    expect(item.estadoOperativo).toBe(previousStatus);
    expect(invalidateItemQuality).not.toHaveBeenCalled();
    expect(WorkOrderItemSession.create).toHaveBeenCalledWith(expect.objectContaining({ assignmentId: 44 }), { transaction: tx });
  });
  it('rejects retroactive interval tampering again during approval', async () => {
    pending.startedAt = new Date('2026-10-01T12:00:00Z');
    await expect(approve()).rejects.toMatchObject({ statusCode: 400 });
    expect(WorkOrderItemSession.create).not.toHaveBeenCalled();
  });
});

describe('Real time calculation through approval and correction', () => {
  it('preserves fractional manual/overtime minutes and recalculates actual hours from accepted sessions', async () => {
    vi.mocked(sessionHelpers.recalculateItemHours).mockRestore();
    const sessions: WorkOrderItemSession[] = [];
    vi.mocked(WorkOrderItemSession.findAll).mockImplementation(async () => sessions);
    vi.mocked(WorkOrderItemSession.create).mockImplementation(async (values) => {
      const session = row<WorkOrderItemSession>({ id: 100, ...values });
      sessions.push(session);
      return session;
    });
    vi.mocked(getWorkerShift).mockResolvedValue({ configured: true, start: null, end: null });
    const result = await createWorkshopTimeRequest(chief, { ...manual, userId: 9, overtime: true, endedAt: '2026-11-15T12:01:29Z' });
    expect(result.durationMinutes).toBeCloseTo(89 / 60, 8);
    expect(sessions[0].durationMinutes).toBeCloseTo(89 / 60, 8);
    expect(item.horasHombreReales).toBe(0.02);
    const journal = await getWorkshopTimeJournal(mechanic, { fecha: '2026-11-15' });
    expect(journal.totals.registeredMinutes).toBeCloseTo(89 / 60, 8);
    expect(journal.entries[0].durationMinutes).toBeCloseTo(89 / 60, 8);
  });
  it('replaces the original exactly once, keeping attribution and never replaying a correction state', async () => {
    vi.mocked(sessionHelpers.recalculateItemHours).mockRestore();
    source.assignmentId = 33;
    pending.endedAt = new Date('2026-11-15T13:30:00Z');
    pending.durationMinutes = 90;
    pending.activityStatus = 'en_proceso'; // Even malformed legacy metadata cannot replay state.
    const sessions = [source];
    vi.mocked(WorkOrderItemSession.findAll).mockImplementation(async (options) => {
      const filter = options?.where as { workOrderItemId?: number } | undefined;
      return filter?.workOrderItemId ? sessions : sessions.filter((session) => session.id !== 30);
    });
    vi.mocked(WorkOrderItemSession.create).mockImplementation(async (values) => {
      const session = row<WorkOrderItemSession>({ id: 100, ...values });
      sessions.push(session);
      return session;
    });
    const original = { startedAt: source.startedAt, endedAt: source.endedAt, durationMinutes: source.durationMinutes, assignmentId: source.assignmentId, note: source.note };
    await reviewWorkshopTimeRequest(chief, 200, { approve: true, note: 'Corrección verificada' });
    expect(source).toMatchObject(original);
    expect(source.supersededAt).toBeInstanceOf(Date);
    expect(sessions[1].assignmentId).toBe(33);
    expect(item.horasHombreReales).toBe(1.5);
    expect(item.estadoOperativo).toBe('completado');
    expect(synchronizeTeamCompletion).not.toHaveBeenCalled();
    expect(invalidateItemQuality).not.toHaveBeenCalled();
    expect(recordItemProgressEvent).toHaveBeenCalledWith(expect.objectContaining({ horasDelta: 0.5, fromStatus: 'completado', toStatus: 'completado' }), tx);
    await expect(reviewWorkshopTimeRequest(chief, 200, { approve: true, note: 'Intento repetido' })).rejects.toMatchObject({ statusCode: 409 });
    expect(sessions).toHaveLength(2);
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
  it('validates eligibility dates at the service boundary and uses vehicle/order/item creation gates', async () => {
    await expect(getWorkshopTimeEligibleItems(mechanic, undefined, '2026-02-30')).rejects.toMatchObject({ statusCode: 400 });
    await expect(getWorkshopTimeEligibleItems(mechanic, undefined, '2999-01-01')).rejects.toMatchObject({ statusCode: 400 });
    expect(getAssignedOrderIds).not.toHaveBeenCalled();
    await getWorkshopTimeEligibleItems(mechanic, undefined, '2026-11-14');
    const end = new Date('2026-11-15T03:00:00Z');
    expect(WorkOrder.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ createdAt: { [Op.lt]: end }, vehicleId: { [Op.ne]: null }, estado: { [Op.notIn]: ['finalizada', 'entregada', 'cancelada'] } }),
      include: [expect.objectContaining({ model: Vehicle, required: true })],
    }));
    expect(WorkOrderItem.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ createdAt: { [Op.lt]: end }, qualityStatus: { [Op.ne]: 'aprobado' }, tipoLinea: { [Op.ne]: 'parte' } }) }));
  });
  it('does not offer a current assignment on dates before that assignment existed', async () => {
    item.teamManaged = true;
    vi.mocked(WorkOrderItemAssignment.findOne).mockResolvedValue(row<WorkOrderItemAssignment>({ id: 44, createdAt: new Date('2026-11-15T12:00:00Z') }));
    expect(await getWorkshopTimeEligibleItems(mechanic, undefined, '2026-11-14')).toEqual([]);
    expect(await getWorkshopTimeEligibleItems(mechanic, undefined, '2026-11-15')).toHaveLength(1);
  });
  it('accepts a partial day and reports the remaining ordinary coverage without imposing eight hours', async () => {
    const manualSession = row<WorkOrderItemSession>({ ...source, kind: 'manual', durationMinutes: 150, startedAt: new Date('2026-11-15T11:00:00Z'), endedAt: new Date('2026-11-15T13:30:00Z') });
    vi.mocked(WorkOrderItemSession.findAll).mockResolvedValue([manualSession]);
    vi.mocked(getWorkerShift).mockResolvedValue({ configured: true, start: new Date('2026-11-15T11:00:00Z'), end: new Date('2026-11-15T19:00:00Z') });
    const journal = await getWorkshopTimeJournal(mechanic, { fecha: '2026-11-15' });
    expect(journal.totals).toMatchObject({ registeredMinutes: 150, scheduledMinutes: 480, unregisteredMinutes: 330 });
  });
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
      /"(?:precio[^"]*|subtotal|total|deuda|password[^"]*|client|clientRequestHash|costHourly|saleHourly)"|SECRET/i,
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
  it('reports the current service execution on historical timer entries without financial fields', async () => {
    item.estadoOperativo = 'completado';
    vi.mocked(WorkOrderItemSession.findAll).mockResolvedValue([source]);
    const journal = await getWorkshopTimeJournal(mechanic, { fecha: '2026-11-15' });
    expect(journal.entries[0]).toMatchObject({ id: 30, kind: 'cronometro', activityStatus: 'completado' });
    expect(journal.entries[0]).not.toHaveProperty('ownPartCompleted');
    expect(journal.entries[0]).not.toHaveProperty('precioUnitario');
    expect(WorkOrderItem.findAll).toHaveBeenCalledWith(expect.objectContaining({ attributes: ['id', 'descripcion', 'estadoOperativo', 'teamManaged'] }));
  });
  it('reports only the worker own active team completion while the service remains in progress', async () => {
    item.estadoOperativo = 'en_proceso';
    item.teamManaged = true;
    vi.mocked(WorkOrderItemSession.findAll).mockResolvedValue([source]);
    vi.mocked(WorkOrderItemAssignment.findAll).mockResolvedValue([
      row<WorkOrderItemAssignment>({ workOrderItemId: 20, userId: 9, completedAt: new Date() }),
    ]);
    const journal = await getWorkshopTimeJournal(mechanic, { fecha: '2026-11-15' });
    expect(journal.entries[0]).toMatchObject({ activityStatus: 'en_proceso', ownPartCompleted: true });
    expect(WorkOrderItemAssignment.findAll).toHaveBeenCalledWith({
      attributes: ['workOrderItemId', 'userId', 'completedAt'], where: { userId: 9, workOrderItemId: { [Op.in]: [20] }, active: true },
    });
    expect(source.update).not.toHaveBeenCalled();
  });
  it('does not invent a false worker completion when the current assignment cannot be resolved', async () => {
    item.estadoOperativo = 'completado';
    item.teamManaged = true;
    vi.mocked(WorkOrderItemSession.findAll).mockResolvedValue([source]);
    vi.mocked(WorkOrderItemAssignment.findAll).mockResolvedValue([]);
    const journal = await getWorkshopTimeJournal(mechanic, { fecha: '2026-11-15' });
    expect(journal.entries[0].activityStatus).toBe('completado');
    expect(journal.entries[0]).not.toHaveProperty('ownPartCompleted');
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
        division: 'MEC',
        patente: null,
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

describe('Daily entries apply execution immediately, independently of reviewed hours', () => {
  const daily = { ...manual, clientRequestId: 'd2adf3f8-4a66-4c54-81be-10a6ce6f9ba1', fecha: '2026-11-15', activityStatus: 'completado' as const };
  let member: WorkOrderItemAssignment;
  beforeEach(() => {
    item.estadoOperativo = 'pendiente';
    item.teamManaged = true;
    item.qualityStatus = 'pendiente';
    item.qualityReviewedBy = null;
    order.qualityApprovedAt = null;
    member = row<WorkOrderItemAssignment>({ id: 44, userId: 9, active: true, completedAt: null, createdAt: order.createdAt });
    vi.mocked(WorkOrderItemAssignment.findOne).mockResolvedValue(member);
    vi.mocked(WorkOrderItemAssignment.findAll).mockResolvedValue([member]);
    vi.mocked(getWorkerShift).mockResolvedValue({ configured: true,
      start: new Date('2026-11-15T12:00:00Z'), end: new Date('2026-11-15T21:00:00Z'),
      intervals: [{ start: new Date('2026-11-15T12:00:00Z'), end: new Date('2026-11-15T16:00:00Z') },
        { start: new Date('2026-11-15T17:00:00Z'), end: new Date('2026-11-15T21:00:00Z') }],
    });
  });

  it('accepts hours used as a quantity without manufacturing a work interval', async () => {
    const { startedAt: _start, endedAt: _end, ...declared } = daily;
    const result = await createWorkshopDailyEntry(mechanic, { ...declared, horasUtilizadas: 1.5 });
    expect(result).toMatchObject({ reportedDate: declared.fecha, durationMinutes: 90, status: 'pendiente', dailyEntry: true });
    expect(result.startedAt).toBe(result.endedAt);
    expect(item.estadoOperativo).toBe('completado');
    expect(item.qualityStatus).toBe('pendiente');
    expect(WorkOrderItemSession.create).not.toHaveBeenCalled();
    expect(syncMirrorQuotationFromWorkOrder).toHaveBeenCalledWith(12, tx, true);
  });

  it('does not use other registered or pending hours as a cap on the declared quantity', async () => {
    const { startedAt: _start, endedAt: _end, ...declared } = daily;
    vi.mocked(WorkshopTimeRequest.findAll).mockResolvedValue([
      row<WorkshopTimeRequest>({ reportedDate: declared.fecha, durationMinutes: 420 }),
    ]);
    const result = await createWorkshopDailyEntry(mechanic, { ...declared, horasUtilizadas: 2 });
    expect(result).toMatchObject({ status: 'pendiente', durationMinutes: 120 });
    expect(WorkshopTimeRequest.create).toHaveBeenCalledOnce();
    expect(getWorkerShift).not.toHaveBeenCalled();
  });

  it.each([3, 5, 30])('accepts %s real hours regardless of a three-hour estimate, elapsed time or shift', async (hours) => {
    const { startedAt: _start, endedAt: _end, ...declared } = daily;
    vi.setSystemTime(new Date('2026-11-15T12:01:00Z'));
    item.horasHombreEstimadas = 3;
    vi.mocked(getWorkerShift).mockResolvedValue({ configured: false, start: null, end: null });
    const result = await createWorkshopDailyEntry(mechanic, { ...declared, horasUtilizadas: hours });
    expect(result).toMatchObject({ status: 'pendiente', durationMinutes: hours * 60 });
    expect(item.qualityStatus).toBe('pendiente');
    expect(getWorkerShift).not.toHaveBeenCalled();
  });

  it('lets the chief approve a declared quantity above the shift without approving quality', async () => {
    const { startedAt: _start, endedAt: _end, ...declared } = daily;
    await createWorkshopDailyEntry(mechanic, { ...declared, horasUtilizadas: 30 });
    const saved = await vi.mocked(WorkshopTimeRequest.create).mock.results[0].value;
    vi.mocked(WorkshopTimeRequest.findByPk).mockResolvedValue(saved);
    const approved = await reviewWorkshopTimeRequest(chief, saved.id, { approve: true, note: 'Horas revisadas por el jefe' });
    expect(approved.status).toBe('aprobada');
    expect(WorkOrderItemSession.create).toHaveBeenCalledWith(expect.objectContaining({ durationMinutes: 1800 }), { transaction: tx });
    expect(item.qualityStatus).toBe('pendiente');
    expect(getWorkerShift).not.toHaveBeenCalled();
  });

  it('preserves the declared quantity when the chief validates hours without approving quality', async () => {
    const { startedAt: _start, endedAt: _end, ...declared } = daily;
    const result = await createWorkshopDailyEntry(chief, { ...declared, userId: 9, horasUtilizadas: 1.5 });
    expect(result.status).toBe('aprobada');
    expect(WorkOrderItemSession.create).toHaveBeenCalledWith(expect.objectContaining({
      reportedDate: declared.fecha, kind: 'manual', durationMinutes: 90,
    }), { transaction: tx });
    expect(item.qualityStatus).toBe('pendiente');
  });

  it('saves pending real hours and completed execution in the same transaction and mirrors the COT', async () => {
    const result = await createWorkshopDailyEntry(mechanic, daily);
    expect(result).toMatchObject({ dailyEntry: true, clientRequestId: daily.clientRequestId, status: 'pendiente', durationMinutes: 60, teamPending: false });
    expect(item.estadoOperativo).toBe('completado');
    expect(member.completedAt).toEqual(new Date(daily.endedAt));
    expect(item.qualityStatus).toBe('pendiente');
    expect(item.qualityReviewedBy).toBeNull();
    expect(order.estado).toBe('en_progreso');
    expect(order.qualityApprovedAt).toBeNull();
    expect(order.update).not.toHaveBeenCalled();
    expect(WorkOrderItemSession.create).not.toHaveBeenCalled();
    expect(sessionHelpers.recalculateItemHours).not.toHaveBeenCalled();
    expect(synchronizeTeamCompletion).not.toHaveBeenCalled();
    expect(WorkshopTimeRequest.create).toHaveBeenCalledWith(expect.objectContaining({ clientRequestId: daily.clientRequestId, clientRequestHash: expect.stringMatching(/^[a-f0-9]{64}$/), overtime: false }), { transaction: tx });
    expect(recordItemProgressEvent).toHaveBeenCalledWith(expect.objectContaining({ fromStatus: 'pendiente', toStatus: 'completado', source: 'check', fechaEfectiva: daily.fecha, assignedUserId: 9 }), tx);
    expect(syncMirrorQuotationFromWorkOrder).toHaveBeenCalledWith(12, tx, true);
    expect(withWorkshopTransaction).toHaveBeenCalledOnce();
    expect(vi.mocked(User.findByPk).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(WorkOrder.findByPk).mock.invocationCallOrder[0]);
  });

  it('advances pending work without completing an assignment when the declared activity is in progress', async () => {
    await createWorkshopDailyEntry(mechanic, { ...daily, activityStatus: 'en_proceso' });
    expect(item.estadoOperativo).toBe('en_proceso');
    expect(member.completedAt).toBeNull();
    expect(member.update).not.toHaveBeenCalled();
    expect(syncMirrorQuotationFromWorkOrder).toHaveBeenCalledWith(12, tx, true);
  });

  it('finishes only the selected team member, reporting teamPending until the second mechanic finishes', async () => {
    const partner = row<WorkOrderItemAssignment>({ id: 45, userId: 10, active: true, completedAt: null, createdAt: order.createdAt });
    vi.mocked(WorkOrderItemAssignment.findAll).mockResolvedValue([member, partner]);
    const first = await createWorkshopDailyEntry(mechanic, daily);
    expect(first.teamPending).toBe(true);
    expect(item.estadoOperativo).toBe('en_proceso');
    expect(member.completedAt).not.toBeNull();
    expect(partner.update).not.toHaveBeenCalled();
    vi.mocked(User.findByPk).mockResolvedValue(row<User>({ id: 10, nombre: 'Mecánico Dos', activo: true }));
    vi.mocked(WorkOrderItemAssignment.findOne).mockResolvedValue(partner);
    const second = await createWorkshopDailyEntry({ id: 10, role: 'mecanico' }, { ...daily, clientRequestId: '886b59b7-8de8-4285-b6b3-a44fb4aad617' });
    expect(second.teamPending).toBe(false);
    expect(item.estadoOperativo).toBe('completado');
    expect(partner.completedAt).not.toBeNull();
    expect(synchronizeTeamCompletion).not.toHaveBeenCalled();
    expect(item.qualityStatus).toBe('pendiente');
  });

  it('uses the real quality invalidation to move a corrected rejected service back to pending chief review', async () => {
    const quality = await vi.importActual<typeof import('../work-order-quality-state.js')>('../work-order-quality-state.js');
    vi.mocked(invalidateItemQuality).mockImplementationOnce(quality.invalidateItemQuality);
    item.qualityStatus = 'rechazado';
    item.qualityReviewedBy = 1;
    item.qualityReviewedAt = new Date('2026-11-15T11:00:00Z');
    item.qualityNote = 'Corregir fuga';
    await createWorkshopDailyEntry(mechanic, daily);
    expect(item).toMatchObject({ estadoOperativo: 'completado', qualityStatus: 'pendiente', qualityReviewedBy: null, qualityReviewedAt: null, qualityNote: null });
    expect(order.update).not.toHaveBeenCalled();
    expect(synchronizeTeamCompletion).not.toHaveBeenCalled();
  });

  it.each(['admin', 'desarrollador', 'jefe'])('auto-validates hours entered by %s without approving quality or nesting transactions', async (role) => {
    const result = await createWorkshopDailyEntry({ id: 1, role }, { ...daily, userId: 9 });
    expect(result).toMatchObject({ status: 'aprobada', reviewedBy: 1, dailyEntry: true });
    expect(WorkOrderItemSession.create).toHaveBeenCalledWith(expect.objectContaining({ kind: 'manual', userId: 9, createdBy: 1, durationMinutes: 60 }), { transaction: tx });
    expect(item.qualityStatus).toBe('pendiente');
    expect(order.qualityApprovedAt).toBeNull();
    expect(withWorkshopTransaction).toHaveBeenCalledOnce();
    expect(syncMirrorQuotationFromWorkOrder).toHaveBeenCalledOnce();
    expect(synchronizeTeamCompletion).not.toHaveBeenCalled();
  });

  it('approves older daily hours without replaying execution, member completion or a newer quality review', async () => {
    await createWorkshopDailyEntry(mechanic, { ...daily, activityStatus: 'en_proceso' });
    const saved = await vi.mocked(WorkshopTimeRequest.create).mock.results[0].value;
    vi.mocked(WorkshopTimeRequest.findByPk).mockResolvedValue(saved);
    item.estadoOperativo = 'completado';
    item.qualityStatus = 'aprobado';
    item.qualityReviewedBy = 1;
    order.estado = 'finalizada';
    order.qualityApprovedAt = new Date();
    member.completedAt = new Date();
    vi.mocked(invalidateItemQuality).mockClear();
    vi.mocked(synchronizeTeamCompletion).mockClear();
    vi.mocked(member.update).mockClear();
    const result = await reviewWorkshopTimeRequest(chief, 200, { approve: true, note: 'Horas contrastadas' });
    expect(result.status).toBe('aprobada');
    expect(item).toMatchObject({ estadoOperativo: 'completado', qualityStatus: 'aprobado', qualityReviewedBy: 1 });
    expect(order.estado).toBe('finalizada');
    expect(member.update).not.toHaveBeenCalled();
    expect(invalidateItemQuality).not.toHaveBeenCalled();
    expect(synchronizeTeamCompletion).not.toHaveBeenCalled();
    expect(WorkOrderItemSession.create).toHaveBeenCalledOnce();
  });

  it('rejects hours without reverting the execution or mirror already recorded by the daily entry', async () => {
    await createWorkshopDailyEntry(mechanic, daily);
    vi.mocked(WorkshopTimeRequest.findByPk).mockResolvedValue(await vi.mocked(WorkshopTimeRequest.create).mock.results[0].value);
    const result = await reviewWorkshopTimeRequest(chief, 200, { approve: false, note: 'Intervalo sin respaldo' });
    expect(result.status).toBe('rechazada');
    expect(item.estadoOperativo).toBe('completado');
    expect(member.completedAt).not.toBeNull();
    expect(WorkOrderItemSession.create).not.toHaveBeenCalled();
    expect(syncMirrorQuotationFromWorkOrder).toHaveBeenCalledOnce();
  });

  it('returns the same UUID after completion without repeating overlap checks, progress or hour writes', async () => {
    const input = { ...daily, startedAt: '2026-11-15T12:00:00.001Z', endedAt: '2026-11-15T13:00:00.001Z' };
    const first = await createWorkshopDailyEntry(mechanic, input);
    const saved = await vi.mocked(WorkshopTimeRequest.create).mock.results[0].value;
    // Simulate a DATETIME column dropping fractional milliseconds after persistence.
    saved.startedAt = new Date(daily.startedAt);
    saved.endedAt = new Date(daily.endedAt);
    vi.mocked(WorkshopTimeRequest.findOne).mockResolvedValue(saved);
    order.estado = 'entregada';
    const retry = await createWorkshopDailyEntry(mechanic, input);
    expect(retry.id).toBe(first.id);
    expect(retry.teamPending).toBe(false);
    expect(WorkOrderItem.findOne).toHaveBeenLastCalledWith(expect.objectContaining({ attributes: expect.arrayContaining(['estadoOperativo']) }));
    expect(WorkshopTimeRequest.create).toHaveBeenCalledOnce();
    expect(recordItemProgressEvent).toHaveBeenCalledOnce();
    expect(syncMirrorQuotationFromWorkOrder).toHaveBeenCalledOnce();
    expect(WorkOrderItemSession.findAll).toHaveBeenCalledOnce();
  });

  it.each([{ note: 'Otra carga' }, { activityStatus: 'en_proceso' as const }, { fecha: '2026-11-14' }, { itemId: 21 }, { workOrderId: 13 }, { endedAt: '2026-11-15T14:00:00Z' }])('rejects UUID reuse with a different payload: %j', async (change) => {
    await createWorkshopDailyEntry(mechanic, daily);
    vi.mocked(WorkshopTimeRequest.findOne).mockResolvedValue(await vi.mocked(WorkshopTimeRequest.create).mock.results[0].value);
    await expect(createWorkshopDailyEntry(mechanic, { ...daily, ...change })).rejects.toMatchObject({ statusCode: 409 });
    expect(WorkshopTimeRequest.create).toHaveBeenCalledOnce();
    expect(recordItemProgressEvent).toHaveBeenCalledOnce();
  });

  it('rejects a UUID owned by another actor even when the chief selects the same worker', async () => {
    await createWorkshopDailyEntry(mechanic, daily);
    vi.mocked(WorkshopTimeRequest.findOne).mockResolvedValue(await vi.mocked(WorkshopTimeRequest.create).mock.results[0].value);
    await expect(createWorkshopDailyEntry(chief, { ...daily, userId: 9 })).rejects.toMatchObject({ statusCode: 409 });
    expect(WorkshopTimeRequest.create).toHaveBeenCalledOnce();
  });

  it('resolves a concurrent unique-key collision in a fresh transaction without applying activity twice', async () => {
    let concurrent: WorkshopTimeRequest | null = null;
    vi.mocked(WorkshopTimeRequest.findOne).mockImplementation(async () => concurrent);
    vi.mocked(WorkshopTimeRequest.create).mockImplementationOnce(async (values) => {
      concurrent = row<WorkshopTimeRequest>({ id: 201, createdAt: new Date(), ...values });
      throw new UniqueConstraintError({ message: 'Duplicate client_request_id' });
    });
    expect((await createWorkshopDailyEntry(mechanic, daily)).id).toBe(201);
    expect(withWorkshopTransaction).toHaveBeenCalledTimes(2);
    expect(WorkshopTimeRequest.create).toHaveBeenCalledOnce();
    expect(recordItemProgressEvent).not.toHaveBeenCalled();
    expect(member.update).not.toHaveBeenCalled();
  });

  it.each(['finalizada', 'entregada', 'cancelada'] as const)('blocks new daily execution on a %s order', async (state) => {
    order.estado = state;
    await expect(createWorkshopDailyEntry(mechanic, daily)).rejects.toMatchObject({ statusCode: 400 });
    expect(WorkshopTimeRequest.create).not.toHaveBeenCalled();
  });
  it.each(['approved-order', 'approved-item', 'completed-item', 'omitted-item', 'completed-member'])('blocks closed or approved work without reopening it: %s', async (state) => {
    if (state === 'approved-order') order.qualityApprovedAt = new Date();
    if (state === 'approved-item') item.qualityStatus = 'aprobado';
    if (state === 'completed-item') item.estadoOperativo = 'completado';
    if (state === 'omitted-item') item.estadoOperativo = 'omitido';
    if (state === 'completed-member') member.completedAt = new Date();
    await expect(createWorkshopDailyEntry(mechanic, daily)).rejects.toMatchObject({ statusCode: 400 });
    expect(WorkshopTimeRequest.create).not.toHaveBeenCalled();
    expect(invalidateItemQuality).not.toHaveBeenCalled();
  });

  it('rejects worker spoofing, revoked assignments and unsupported roles before creating a daily entry', async () => {
    await expect(createWorkshopDailyEntry(mechanic, { ...daily, userId: 9 })).rejects.toMatchObject({ statusCode: 403 });
    expect(withWorkshopTransaction).not.toHaveBeenCalled();
    for (const role of ['vendedor', 'finanzas', 'bodeguero']) await expect(createWorkshopDailyEntry({ id: 9, role }, daily)).rejects.toMatchObject({ statusCode: 403 });
    vi.mocked(isAssignedToItem).mockResolvedValue(false);
    await expect(createWorkshopDailyEntry(mechanic, daily)).rejects.toMatchObject({ statusCode: 403 });
    expect(WorkshopTimeRequest.create).not.toHaveBeenCalled();
  });

  it.each([
    { startedAt: '2026-11-15T11:00:00Z', endedAt: '2026-11-15T12:00:00Z' },
    { startedAt: '2026-11-15T16:00:00Z', endedAt: '2026-11-15T17:00:00Z' },
    { startedAt: '2026-11-15T15:30:00Z', endedAt: '2026-11-15T17:30:00Z' },
    { startedAt: '2026-11-15T21:00:00Z', endedAt: '2026-11-15T22:00:00Z' },
  ])('requires the existing chief overtime flow for outside-shift or lunch intervals: %j', async (change) => {
    await expect(createWorkshopDailyEntry(mechanic, { ...daily, ...change })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('horas extra') });
    expect(WorkshopTimeRequest.create).not.toHaveBeenCalled();
  });

  it('honors the shorter Saturday shift and configured days off', async () => {
    vi.mocked(getWorkerShift).mockResolvedValue({ configured: true, start: new Date('2026-11-14T12:00:00Z'), end: new Date('2026-11-14T16:00:00Z') });
    await expect(createWorkshopDailyEntry(mechanic, { ...daily, fecha: '2026-11-14', startedAt: '2026-11-14T16:00:00Z', endedAt: '2026-11-14T17:00:00Z' })).rejects.toMatchObject({ statusCode: 400 });
    vi.mocked(getWorkerShift).mockResolvedValue({ configured: true, start: null, end: null });
    await expect(createWorkshopDailyEntry(mechanic, daily)).rejects.toMatchObject({ statusCode: 400 });
    vi.mocked(getWorkerShift).mockResolvedValue({ configured: false, start: null, end: null });
    await expect(createWorkshopDailyEntry(mechanic, daily)).rejects.toMatchObject({ statusCode: 422 });
  });

  it('uses the configured workshop day instead of UTC or the host date', async () => {
    await expect(createWorkshopDailyEntry(mechanic, { ...daily, startedAt: '2026-11-15T01:00:00Z', endedAt: '2026-11-15T02:00:00Z' })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('zona horaria') });
    vi.mocked(getWorkerShift).mockResolvedValue({ configured: true, start: new Date('2026-11-15T22:00:00Z'), end: new Date('2026-11-16T03:00:00Z') });
    expect((await createWorkshopDailyEntry(mechanic, { ...daily, startedAt: '2026-11-16T01:00:00Z', endedAt: '2026-11-16T02:00:00Z' })).status).toBe('pendiente');
    expect(getWorkshopDayRange).toHaveBeenCalledWith('2026-11-15', tx);
  });

  it('rejects overlap with a timer or a pending interval on any order', async () => {
    source.endedAt = null;
    vi.mocked(WorkOrderItemSession.findAll).mockResolvedValue([source]);
    await expect(createWorkshopDailyEntry(mechanic, daily)).rejects.toMatchObject({ statusCode: 409 });
    expect(source.update).not.toHaveBeenCalled();
    vi.mocked(WorkOrderItemSession.findAll).mockResolvedValue([]);
    vi.mocked(WorkshopTimeRequest.findOne).mockImplementation(async (options) => (options?.where as { status?: string })?.status === 'pendiente' ? pending : null);
    await expect(createWorkshopDailyEntry(mechanic, daily)).rejects.toMatchObject({ statusCode: 409 });
    expect(WorkshopTimeRequest.create).not.toHaveBeenCalled();
  });

  it('does not close or rewrite a timer opened after the historical daily interval', async () => {
    source.startedAt = new Date('2026-11-15T14:00:00Z');
    source.endedAt = null;
    source.status = 'abierta';
    await createWorkshopDailyEntry(mechanic, daily);
    expect(source).toMatchObject({ status: 'abierta', endedAt: null });
    expect(source.update).not.toHaveBeenCalled();
    expect(WorkOrderItemSession.findOne).not.toHaveBeenCalled();
    expect(WorkOrderItemSession.create).not.toHaveBeenCalled();
  });

  it('propagates progress failure for rollback, keeping request, worker part and execution in the same transaction', async () => {
    vi.mocked(recordItemProgressEvent).mockRejectedValueOnce(new Error('Historial no disponible'));
    await expect(createWorkshopDailyEntry(mechanic, daily)).rejects.toThrow('Historial no disponible');
    expect(withWorkshopTransaction).toHaveBeenCalledOnce();
    expect(WorkshopTimeRequest.create).toHaveBeenCalledWith(expect.any(Object), { transaction: tx });
    expect(member.update).toHaveBeenCalledWith({ completedAt: new Date(daily.endedAt) }, { transaction: tx });
    expect(item.update).toHaveBeenCalledWith({ estadoOperativo: 'completado' }, { transaction: tx });
    expect(recordItemProgressEvent).toHaveBeenCalledWith(expect.any(Object), tx);
    expect(syncMirrorQuotationFromWorkOrder).not.toHaveBeenCalled();
    expect(WorkOrderItemSession.create).not.toHaveBeenCalled();
  });
});
