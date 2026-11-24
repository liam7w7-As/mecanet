import { afterEach, describe, expect, it, vi } from 'vitest';

import { canonicalSessionMinutes, exactIntervalMinutes, sessionMinutesInRange } from '../../utils/workshop-session-time.js';
import { closeSession, getSessionMinutes, getSessionMinutesInRange, recalculateItemHours } from '../work-order-labor-sessions.js';
import { calculateWorkshopCostReport, costReportSessionMinutes } from '../workshop-cost-report.calculator.js';

import type { WorkOrderItem } from '../../models/WorkOrderItem.js';
import type { WorkOrderItemSession } from '../../models/WorkOrderItemSession.js';
import type { CostReportSession } from '../workshop-cost-report.calculator.js';
import type { Transaction } from 'sequelize';

const mocks = vi.hoisted(() => ({ sessions: { findAll: vi.fn() }, items: {} }));
vi.mock('../../models/WorkOrderItem.js', () => ({ WorkOrderItem: mocks.items }));
vi.mock('../../models/WorkOrderItemSession.js', () => ({ WorkOrderItemSession: mocks.sessions }));
vi.mock('../work-order-labor-events.js', () => ({ minutesToHours: (minutes: number) => Math.round(Math.max(0, minutes) / 60 * 100) / 100 }));

const instant = new Date('2026-11-16T12:00:00Z');
const dayStart = new Date('2026-11-16T03:00:00Z');
const dayEnd = new Date('2026-11-17T03:00:00Z');
const clock = (seconds: number, id = 1, extra: Partial<CostReportSession> = {}): CostReportSession => ({
  id, workOrderId: 1, workOrderItemId: 11, assignmentId: 21, userId: 7, userName: 'Mecánico', kind: 'cronometro', status: 'cerrada',
  startedAt: new Date(instant.getTime() - seconds * 1000), endedAt: instant, scheduledEndAt: null, durationMinutes: Math.floor(seconds / 60), supersededAt: null, ...extra,
});
const model = (session: CostReportSession) => session as unknown as WorkOrderItemSession;
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('Canonical labor seconds without any database', () => {
  it('counts declared daily hours as a dated quantity rather than a midnight interval', () => {
    const session = clock(0, 1, {
      kind: 'manual', startedAt: dayStart, endedAt: dayStart,
      durationMinutes: 90, reportedDate: '2026-11-16',
    });
    expect(canonicalSessionMinutes(session, instant)).toBe(90);
    expect(sessionMinutesInRange(session, dayStart, dayEnd, instant)).toBe(90);
    expect(sessionMinutesInRange(session, dayEnd, new Date(dayEnd.getTime() + 86_400_000), instant)).toBe(0);
  });
  it('recovers 44s + 45s despite the historical zero-minute storage marker', () => {
    const sessions = [clock(44), clock(45, 2)];
    expect(sessions.every((s) => s.durationMinutes === 0)).toBe(true);
    expect(sessions.reduce((sum, s) => sum + getSessionMinutes(model(s), instant), 0)).toBeCloseTo(89 / 60, 12);
    expect(sessions.reduce((sum, s) => sum + getSessionMinutesInRange(model(s), dayStart, dayEnd, instant), 0)).toBeCloseTo(89 / 60, 12);
    expect(sessions.reduce((sum, s) => sum + costReportSessionMinutes(s, dayStart, dayEnd, instant), 0)).toBeCloseTo(89 / 60, 12);
  });
  it('recovers fractional elapsed time only for matching floored clock totals', () => {
    expect(canonicalSessionMinutes(clock(89), instant)).toBeCloseTo(89 / 60, 12);
    expect(canonicalSessionMinutes(clock(89, 1, { durationMinutes: 0 }), instant)).toBe(0);
    expect(canonicalSessionMinutes(clock(89, 1, { durationMinutes: 10 }), instant)).toBe(10);
    expect(canonicalSessionMinutes(clock(89, 1, { durationMinutes: 1.25 }), instant)).toBe(1.25);
  });
  it('preserves explicit manual durations and signed adjustments', () => {
    expect(canonicalSessionMinutes(clock(44, 1, { kind: 'manual', durationMinutes: 5 }), instant)).toBe(5);
    const adjustment = clock(44, 2, { kind: 'ajuste', durationMinutes: -15 });
    expect(canonicalSessionMinutes(adjustment, instant)).toBe(-15);
    expect(sessionMinutesInRange(adjustment, dayStart, dayEnd, instant)).toBe(-15);
    expect(costReportSessionMinutes(adjustment, dayStart, dayEnd, instant)).toBe(-15);
  });
  it('excludes superseded clocks and signed adjustments from effective totals', () => {
    for (const kind of ['cronometro', 'manual', 'ajuste']) {
      const replaced = clock(44, 1, { kind, supersededAt: instant, durationMinutes: kind === 'ajuste' ? -15 : 0 });
      expect(canonicalSessionMinutes(replaced, instant)).toBe(0);
      expect(sessionMinutesInRange(replaced, dayStart, dayEnd, instant)).toBe(0);
      expect(costReportSessionMinutes(replaced, dayStart, dayEnd, instant)).toBe(0);
    }
  });
  it('keeps open milliseconds and caps physical intervals at now and scheduled end', () => {
    const open = clock(44.5, 1, { status: 'abierta', endedAt: null, durationMinutes: null });
    expect(canonicalSessionMinutes(open, instant)).toBeCloseTo(44.5 / 60, 12);
    const cutoff = new Date(instant.getTime() - 20_000);
    expect(canonicalSessionMinutes({ ...open, scheduledEndAt: cutoff }, instant)).toBeCloseTo(24.5 / 60, 12);
    expect(costReportSessionMinutes({ ...open, scheduledEndAt: cutoff }, dayStart, dayEnd, instant)).toBeCloseTo(24.5 / 60, 12);
    expect(costReportSessionMinutes(clock(44, 1, { endedAt: new Date(instant.getTime() + 60000) }), dayStart, dayEnd, instant)).toBeCloseTo(44 / 60, 12);
  });
  it('clips subminute intervals without losing seconds at adjacent range boundaries', () => {
    const session = clock(44);
    const boundary = new Date(instant.getTime() - 20_000);
    const before = exactIntervalMinutes(session.startedAt, instant, dayStart, boundary);
    const after = exactIntervalMinutes(session.startedAt, instant, boundary, dayEnd);
    expect(before + after).toBeCloseTo(44 / 60, 12);
    expect(sessionMinutesInRange(session, dayStart, boundary, instant) + sessionMinutesInRange(session, boundary, dayEnd, instant)).toBeCloseTo(44 / 60, 12);
  });
  it('leaves persisted records untouched on reads and recalculates the derived aggregate only on a legitimate mutation', async () => {
    const sessions = [clock(44), clock(45, 2)];
    const saved = structuredClone(sessions);
    const update = vi.fn();
    mocks.sessions.findAll.mockResolvedValue(sessions);
    const historyMinutes = sessions.reduce((sum, s) => sum + getSessionMinutes(model(s), instant), 0);
    expect(sessions).toEqual(saved);
    expect(update).not.toHaveBeenCalled();
    const hours = await recalculateItemHours({ id: 11, update } as unknown as WorkOrderItem, {} as Transaction);
    expect(hours).toBe(0.02);
    expect(historyMinutes).toBeCloseTo(89 / 60, 12);
    expect(update).toHaveBeenCalledWith({ horasHombreReales: 0.02 }, expect.any(Object));
    expect(sessions).toEqual(saved);
  });
  it('stores the existing integer floor marker on close, returning and later recovering exact seconds', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(instant);
    const open = { ...clock(44.5, 1, { status: 'abierta', endedAt: null, durationMinutes: null }), update: vi.fn() };
    open.update.mockImplementation(async (values) => Object.assign(open, values));
    expect(await closeSession(open as unknown as WorkOrderItemSession, 'pausa', {} as Transaction)).toBeCloseTo(44.5 / 60, 12);
    expect(open.durationMinutes).toBe(0);
    expect(getSessionMinutes(open as unknown as WorkOrderItemSession, instant)).toBeCloseTo(44.5 / 60, 12);
  });
  it('matches history/worksheet and report raw minutes, while money uses exact time instead of rounded displayed hours', () => {
    const sessions = [clock(44), clock(45, 2)];
    const report = calculateWorkshopCostReport({ fechaDesde: '2026-11-16', fechaHasta: '2026-11-16' }, {
      sessions,
      items: [{ id: 11, workOrderId: 1, descripcion: 'Diagnóstico', tipoLinea: 'especifico', cantidad: 1, horasHombreEstimadas: 1, assignedUserId: 7, createdAt: dayStart, workOrder: { id: 1, codigo: 'OT1', estado: 'en_progreso' } }],
      assignments: [{ id: 21, workOrderId: 1, workOrderItemId: 11, userId: 7, userName: 'Mecánico', active: true, specialtyId: null, specialtyName: null, costHourly: 3600, saleHourly: 7200, estimatedHours: 1, originalEstimatedHours: 1, createdAt: dayStart }],
    }, dayStart, dayEnd, instant);
    const historyMinutes = sessions.reduce((sum, s) => sum + getSessionMinutes(model(s), instant), 0);
    expect(report.totals.actualMinutes).toBeCloseTo(historyMinutes, 12);
    expect(report.rows[0].actualMinutes).toBeCloseTo(89 / 60, 12);
    expect(report.rows[0].actualHours).toBe(0.02);
    expect(report.totals.actualCost).toBe(89);
    expect(report.totals.actualSale).toBe(178);
    expect(report.totals.actualCost).not.toBe(report.rows[0].actualHours * 3600);
  });
});
