import { Op } from 'sequelize';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appendSpecialtyRate, appendWorkshopScheduleException, getWorkerRateSnapshot, getWorkerShift, getWorkshopDayRange, updateWorkerSpecialties, updateWorkshopSchedule, seedWorkshopSpecialties } from '../workshop-personnel.service.js';

import type { WorkshopWeeklyDay } from '@unithor/shared';
import type { Transaction } from 'sequelize';

const mocks = vi.hoisted(() => {
  const model = () => ({ findByPk: vi.fn(), findOne: vi.fn(), findAll: vi.fn(), create: vi.fn(), findOrCreate: vi.fn(), bulkCreate: vi.fn(), destroy: vi.fn() });
  return { specialty: model(), rate: model(), worker: model(), membership: model(), schedule: model(), exception: model(), session: model(), order: model(), item: model(), closeSession: vi.fn(), recalculateItemHours: vi.fn(), transaction: vi.fn() };
});
vi.mock('../../config/database.js', () => ({ sequelize: { transaction: mocks.transaction } }));
vi.mock('../../models/Specialty.js', () => ({ Specialty: mocks.specialty }));
vi.mock('../../models/SpecialtyRate.js', () => ({ SpecialtyRate: mocks.rate }));
vi.mock('../../models/User.js', () => ({ User: mocks.worker }));
vi.mock('../../models/WorkerSpecialty.js', () => ({ WorkerSpecialty: mocks.membership }));
vi.mock('../../models/WorkshopSchedule.js', () => ({ WorkshopSchedule: mocks.schedule }));
vi.mock('../../models/WorkshopScheduleException.js', () => ({ WorkshopScheduleException: mocks.exception }));
vi.mock('../../models/WorkOrderItemSession.js', () => ({ WorkOrderItemSession: mocks.session }));
vi.mock('../../models/WorkOrder.js', () => ({ WorkOrder: mocks.order }));
vi.mock('../../models/WorkOrderItem.js', () => ({ WorkOrderItem: mocks.item }));
vi.mock('../work-order-labor-sessions.js', () => ({ closeSession: mocks.closeSession, recalculateItemHours: mocks.recalculateItemHours }));


const transaction = { LOCK: { UPDATE: 'UPDATE' } } as unknown as Transaction;
const instant = new Date('2026-01-03T01:00:00.000Z'); // Friday Jan 2 in Santiago, Saturday in UTC.
const schedule = (weekly: WorkshopWeeklyDay[], timezone = 'America/Santiago') => ({ timezone, weekly });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation((run) => run(transaction));
  mocks.schedule.findByPk.mockResolvedValue(null);
  mocks.exception.findOne.mockResolvedValue(null);
  mocks.membership.findOne.mockResolvedValue(null);
  mocks.rate.findOne.mockResolvedValue(null);
  mocks.specialty.findByPk.mockResolvedValue({ id: 2, name: 'Electricista', active: true });
  mocks.worker.findByPk.mockResolvedValue({ id: 9, activo: true });
  mocks.session.findAll.mockResolvedValue([]);
});
afterEach(() => { vi.useRealTimers(); });

describe('worker shifts without a database', () => {
  it.each([schedule([])])('keeps an explicitly empty weekly configuration unconfigured %j', async (value) => {
    mocks.schedule.findByPk.mockResolvedValue(value);
    expect(await getWorkerShift(9, instant, transaction)).toEqual({ configured: false, start: null, end: null });
    expect(mocks.exception.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 9, date: '2026-01-02' }, transaction }));
  });
  it('uses the confirmed standard hours when no schedule has been stored', async () => {
    const shift = await getWorkerShift(9, new Date('2026-11-16T15:00:00Z'));
    expect(shift.end).toEqual(new Date('2026-11-16T16:00:00Z'));
    expect(shift.intervals).toEqual([
      { start: new Date('2026-11-16T12:00:00Z'), end: new Date('2026-11-16T16:00:00Z') },
      { start: new Date('2026-11-16T17:00:00Z'), end: new Date('2026-11-16T21:00:00Z') },
    ]);
  });
  it.each([
    ['2026-11-16T15:59:59Z', '2026-11-16T12:00:00Z', '2026-11-16T16:00:00Z'],
    ['2026-11-16T16:00:00Z', '2026-11-16T17:00:00Z', '2026-11-16T21:00:00Z'],
    ['2026-11-16T17:00:00Z', '2026-11-16T17:00:00Z', '2026-11-16T21:00:00Z'],
  ])('selects the correct segment at %s without counting lunch', async (at, start, end) => {
    const shift = await getWorkerShift(9, new Date(at));
    expect(shift.start).toEqual(new Date(start));
    expect(shift.end).toEqual(new Date(end));
  });
  it('closes Saturday at 13 and has no Sunday shift', async () => {
    expect(await getWorkerShift(9, new Date('2026-11-21T15:00:00Z'))).toEqual({ configured: true, start: new Date('2026-11-21T12:00:00Z'), end: new Date('2026-11-21T16:00:00Z') });
    expect(await getWorkerShift(9, new Date('2026-11-22T15:00:00Z'))).toEqual({ configured: true, start: null, end: null });
  });
  it('uses the Chilean date and configured times rather than an eight-hour fallback', async () => {
    mocks.schedule.findByPk.mockResolvedValue(schedule([{ weekday: 5, start: '07:30', end: '09:15' }]));
    expect(await getWorkerShift(9, instant)).toEqual({ configured: true, start: new Date('2026-01-02T10:30:00Z'), end: new Date('2026-01-02T12:15:00Z') });
  });
  it('returns a configured day off for a weekday omitted from a nonempty schedule', async () => {
    mocks.schedule.findByPk.mockResolvedValue(schedule([{ weekday: 1, start: '10:00', end: '11:00' }]));
    expect(await getWorkerShift(9, instant)).toEqual({ configured: true, start: null, end: null });
  });
  it('allows an exception to configure an otherwise unconfigured worker day', async () => {
    mocks.exception.findOne.mockResolvedValue({ dayOff: false, start: '11:15', end: '13:45', version: 3 });
    expect(await getWorkerShift(9, instant, transaction)).toEqual({ configured: true, start: new Date('2026-01-02T14:15:00Z'), end: new Date('2026-01-02T16:45:00Z') });
    expect(mocks.exception.findOne).toHaveBeenCalledWith(expect.objectContaining({ order: [['version', 'DESC'], ['id', 'DESC']], transaction }));
  });
  it('gives a day-off exception priority over weekly hours', async () => {
    mocks.schedule.findByPk.mockResolvedValue(schedule([{ weekday: 5, start: '10:00', end: '11:00' }]));
    mocks.exception.findOne.mockResolvedValue({ dayOff: true });
    expect(await getWorkerShift(9, instant)).toEqual({ configured: true, start: null, end: null });
  });
  it('applies winter offset and a configured IANA timezone', async () => {
    mocks.schedule.findByPk.mockResolvedValue(schedule([{ weekday: 3, start: '10:00', end: '12:00' }]));
    expect((await getWorkerShift(9, new Date('2026-07-15T15:00:00Z'))).start).toEqual(new Date('2026-07-15T14:00:00Z'));
    mocks.schedule.findByPk.mockResolvedValue(schedule([{ weekday: 3, start: '10:00', end: '12:00' }], 'Asia/Kathmandu'));
    expect((await getWorkerShift(9, new Date('2026-07-15T06:00:00Z'))).start).toEqual(new Date('2026-07-15T04:15:00Z'));
  });
  it('rejects a nonexistent wall time in the Chile DST gap', async () => {
    mocks.exception.findOne.mockResolvedValue({ dayOff: false, start: '00:30', end: '02:00' });
    await expect(getWorkerShift(9, new Date('2026-09-06T15:00:00Z'))).rejects.toMatchObject({ statusCode: 422 });
  });
});

describe('local-day ranges for journals and reports', () => {
  it.each([
    ['2026-01-15', '2026-01-15T03:00:00.000Z', '2026-01-16T03:00:00.000Z', 24],
    ['2026-07-15', '2026-07-15T04:00:00.000Z', '2026-07-16T04:00:00.000Z', 24],
    ['2026-09-06', '2026-09-06T04:00:00.000Z', '2026-09-07T03:00:00.000Z', 23],
    ['2026-04-04', '2026-04-04T03:00:00.000Z', '2026-04-05T04:00:00.000Z', 25],
  ])('resolves %s as a %s to %s interval lasting %s hours', async (date, start, end, hours) => {
    const result = await getWorkshopDayRange(date, transaction);
    expect(result).toEqual({ start: new Date(start), end: new Date(end) });
    expect(result.end.getTime() - result.start.getTime()).toBe(hours * 3_600_000);
    expect(mocks.schedule.findByPk).toHaveBeenCalledWith(1, { transaction });
  });
  it('rejects impossible dates before looking up configuration', async () => {
    await expect(getWorkshopDayRange('2026-02-30')).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.schedule.findByPk).not.toHaveBeenCalled();
  });
});

describe('rate snapshots and append-only history', () => {
  it('preserves null snapshots for legacy workers without specialties', async () => {
    expect(await getWorkerRateSnapshot(9, null, instant)).toEqual({ specialtyId: null, specialtyName: null, rateId: null, costHourly: null, saleHourly: null });
    expect(mocks.rate.findOne).not.toHaveBeenCalled();
  });
  it('rejects explicit specialties not belonging to the worker', async () => {
    await expect(getWorkerRateSnapshot(9, 2, instant)).rejects.toMatchObject({ statusCode: 400 });
  });
  it('selects the principal specialty and a historical rate using the workshop local date', async () => {
    mocks.membership.findOne.mockResolvedValue({ specialtyId: 2, isPrincipal: true });
    mocks.rate.findOne.mockResolvedValue({ id: 7, costHourly: '1000.00', saleHourly: '2500.50' });
    expect(await getWorkerRateSnapshot(9, null, instant, transaction)).toEqual({ specialtyId: 2, specialtyName: 'Electricista', rateId: 7, costHourly: 1000, saleHourly: 2500.5 });
    expect(mocks.membership.findOne).toHaveBeenCalledWith({ where: { userId: 9, isPrincipal: true }, transaction });
    expect(mocks.rate.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { specialtyId: 2, validityFrom: { [Op.lte]: '2026-01-02' } }, transaction }));
  });
  it('accepts an additional specialty without manufacturing a missing rate', async () => {
    mocks.membership.findOne.mockResolvedValue({ specialtyId: 2, isPrincipal: false });
    expect(await getWorkerRateSnapshot(9, 2, instant)).toEqual({ specialtyId: 2, specialtyName: 'Electricista', rateId: null, costHourly: null, saleHourly: null });
  });
  it('rejects inactive specialties for new snapshots', async () => {
    mocks.membership.findOne.mockResolvedValue({ specialtyId: 2 });
    mocks.specialty.findByPk.mockResolvedValue({ id: 2, name: 'Electricista', active: false });
    await expect(getWorkerRateSnapshot(9, 2, instant)).rejects.toMatchObject({ statusCode: 400 });
  });
  it('rejects duplicate or earlier validity dates without writing history', async () => {
    mocks.rate.findOne.mockResolvedValue({ validityFrom: '2026-01-01' });
    await expect(appendSpecialtyRate(2, { validityFrom: '2026-01-01', costHourly: 5, saleHourly: 9 }, 1)).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.rate.create).not.toHaveBeenCalled();
  });
  it('rejects backdating a later rate into elapsed dates', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-16T15:00:00Z'));
    mocks.rate.findOne.mockResolvedValue({ validityFrom: '2026-01-01' });
    await expect(appendSpecialtyRate(2, { validityFrom: '2026-02-01', costHourly: 5, saleHourly: 9 }, 1)).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.rate.create).not.toHaveBeenCalled();
  });
  it('appends a new exception version under a worker lock without updating the previous version', async () => {
    mocks.exception.findOne.mockResolvedValue({ version: 2 });
    mocks.exception.create.mockImplementation((value) => Promise.resolve({ ...value, id: 8, createdAt: instant }));
    const result = await appendWorkshopScheduleException(9, { date: '2026-01-02', dayOff: true, reason: 'Permiso' }, 1);
    expect(result).toMatchObject({ version: 3, dayOff: true, start: null, end: null, reason: 'Permiso', createdBy: 1 });
    expect(mocks.worker.findByPk).toHaveBeenCalledWith(9, { transaction, lock: 'UPDATE' });
    expect(mocks.exception.destroy).not.toHaveBeenCalled();
  });
  it('validates all assigned specialties before replacing a profile', async () => {
    mocks.specialty.findAll.mockResolvedValue([{ id: 2, active: false }]);
    await expect(updateWorkerSpecialties(9, { principalSpecialtyId: 2, additionalSpecialtyIds: [] }, 1)).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.membership.destroy).not.toHaveBeenCalled();
  });
  it('optional default seeds create names without inserting rates', async () => {
    mocks.specialty.findOrCreate.mockImplementation(({ where }) => Promise.resolve([{ id: 1, name: where.name, active: true }, true]));
    const result = await seedWorkshopSpecialties();
    expect(result.map((row) => row.name)).toEqual(['Mecánico', 'Electricista', 'Ayudante', 'Desabollador', 'Pintor']);
    expect(mocks.rate.create).not.toHaveBeenCalled();
  });
});

describe('configuration changes and open timer cutoffs', () => {
  const runningSession = (cutoff: Date | null = new Date('2026-11-16T21:00:00Z')) => {
    const session = { id: 3, userId: 9, workOrderId: 4, workOrderItemId: 5, status: 'abierta',
      startedAt: new Date('2026-11-16T14:00:00Z'), scheduledEndAt: cutoff, supersededAt: null, update: vi.fn() };
    session.update.mockImplementation((value) => { Object.assign(session, value); return Promise.resolve(session); });
    mocks.session.findAll.mockResolvedValue([session]);
    mocks.session.findByPk.mockResolvedValue(session);
    mocks.item.findByPk.mockResolvedValue({ id: 5 });
    return session;
  };
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-16T15:00:00Z'));
    const row = { id: 1, timezone: 'America/Santiago', weekly: [], updatedAt: new Date(), updatedBy: null, update: vi.fn() };
    row.update.mockImplementation((value) => { Object.assign(row, value); return Promise.resolve(row); });
    mocks.schedule.findOrCreate.mockResolvedValue([row, false]);
    mocks.schedule.findByPk.mockResolvedValue(row);
    mocks.worker.findAll.mockResolvedValue([]);
  });
  it.each(['16:00', '19:00'])('updates a still-future cutoff when the new exit is %s', async (end) => {
    const session = runningSession();
    await updateWorkshopSchedule({ timezone: 'America/Santiago', weekly: [{ weekday: 1, start: '10:00', end }] }, 1);
    expect(session.scheduledEndAt).toEqual(new Date(`2026-11-16T${end === '16:00' ? '19' : '22'}:00:00Z`));
    expect(mocks.closeSession).not.toHaveBeenCalled();
    expect(mocks.recalculateItemHours).toHaveBeenCalledWith({ id: 5 }, transaction);
  });
  it('never extends or rewrites an already elapsed old cutoff', async () => {
    const session = runningSession(new Date('2026-11-16T14:30:00Z'));
    await updateWorkshopSchedule({ timezone: 'America/Santiago', weekly: [{ weekday: 1, start: '10:00', end: '19:00' }] }, 1);
    expect(session.update).not.toHaveBeenCalled();
    expect(mocks.closeSession).not.toHaveBeenCalled();
  });
  it('does not retroactively remove elapsed time when lunch is added after the break', async () => {
    vi.setSystemTime(new Date('2026-11-16T18:00:00Z')); // 15:00 Chile, legacy timer started 11:00
    const session = runningSession();
    await updateWorkshopSchedule({ timezone: 'America/Santiago', weekly: [{ weekday: 1, start: '09:00', end: '18:00', breakStart: '13:00', breakEnd: '14:00' }] }, 1);
    expect(session.scheduledEndAt).toEqual(new Date('2026-11-16T18:00:00Z'));
    expect(mocks.closeSession).toHaveBeenCalledWith(session, 'sistema', transaction, expect.stringContaining('se conserva'));
  });
  it('preserves a known cutoff if the administrator unconfigures the weekly schedule', async () => {
    const session = runningSession();
    await updateWorkshopSchedule({ timezone: 'America/Santiago', weekly: [] }, 1);
    expect(session.scheduledEndAt).toEqual(new Date('2026-11-16T21:00:00Z'));
    expect(session.update).not.toHaveBeenCalled();
  });
  it('pauses now if the new schedule marks the current day off', async () => {
    const session = runningSession();
    await updateWorkshopSchedule({ timezone: 'America/Santiago', weekly: [{ weekday: 2, start: '10:00', end: '11:00' }] }, 1);
    expect(session.scheduledEndAt).toEqual(new Date('2026-11-16T15:00:00Z'));
    expect(mocks.closeSession).toHaveBeenCalledWith(session, 'sistema', transaction, expect.any(String));
  });
  it('pauses now rather than storing an end earlier than the session start', async () => {
    const session = runningSession();
    await updateWorkshopSchedule({ timezone: 'America/Santiago', weekly: [{ weekday: 1, start: '09:00', end: '10:30' }] }, 1);
    expect(session.scheduledEndAt).toEqual(new Date('2026-11-16T15:00:00Z'));
    expect(mocks.closeSession).toHaveBeenCalled();
  });
  it('closes a shortened elapsed shift at its exact cutoff rather than at save time', async () => {
    const session = runningSession(null);
    await updateWorkshopSchedule({ timezone: 'America/Santiago', weekly: [{ weekday: 1, start: '09:00', end: '11:30' }] }, 1);
    expect(session.scheduledEndAt).toEqual(new Date('2026-11-16T14:30:00Z'));
    expect(mocks.closeSession).toHaveBeenCalledWith(session, 'sistema', transaction, expect.any(String));
  });
  it('applies a worker exception to that worker and preserves previous versions', async () => {
    const session = runningSession();
    mocks.exception.findOne.mockResolvedValueOnce({ version: 2 }).mockResolvedValue({ dayOff: true });
    mocks.exception.create.mockImplementation((value) => Promise.resolve({ ...value, id: 10, createdAt: new Date() }));
    await appendWorkshopScheduleException(9, { date: '2026-11-16', dayOff: true, reason: 'Permiso' }, 1);
    expect(mocks.session.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 9 }), transaction }));
    expect(session.scheduledEndAt).toEqual(new Date('2026-11-16T15:00:00Z'));
    expect(mocks.closeSession).toHaveBeenCalled();
    expect(mocks.exception.destroy).not.toHaveBeenCalled();
  });
});
