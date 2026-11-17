import { describe, expect, it } from 'vitest';

import { commercialSnapshot, collectedServiceNet, discountedLineNets, totalCommercialSnapshots } from '../workshop-commercial.calculator.js';
import { calculateQuality, calculateUtilization } from '../workshop-performance.calculator.js';

import type { PerformanceSession, PerformanceDay } from '../workshop-performance.calculator.js';

const day = '2026-11-16';
const at = (time: string) => new Date(`${day}T${time}:00Z`);
const now = at('23:00');
const session = (id: number, start: string, end: string, options: Partial<PerformanceSession> = {}): PerformanceSession => ({
  id, userId: 9, workOrderItemId: 5, assignmentId: 1, kind: 'manual', status: 'cerrada',
  startedAt: at(start), endedAt: at(end), durationMinutes: (at(end).getTime() - at(start).getTime()) / 60_000,
  ...options,
});
const scheduled: PerformanceDay = { date: day, start: at('03:00'), end: new Date('2026-11-17T03:00:00Z'),
  workers: [{ userId: 9, intervals: [{ start: at('12:00'), end: at('16:00') }, { start: at('17:00'), end: at('21:00') }] }] };

describe('Commercial recovery is distinct from cash and labor cost', () => {
  it('reports five real hours versus three sold as two hours against, without changing payments', () => {
    expect(commercialSnapshot({ actualMinutes: 300, theoreticalNet: 50000, quotedNet: 30000, receivedNet: 30000, actualCost: 20000 })).toMatchObject({
      actualHours: 5, referenceHourlyRate: 10000, equivalentQuotedHours: 3, equivalentReceivedHours: 3,
      hoursDifference: -2, netDifference: -20000, commercialMargin: 10000,
    });
  });
  it('keeps an unpaid quotation distinct from its agreed commercial value', () => {
    const row = commercialSnapshot({ actualMinutes: 180, theoreticalNet: 30000, quotedNet: 50000, receivedNet: 0, actualCost: 15000 });
    expect(row).toMatchObject({ equivalentQuotedHours: 5, equivalentReceivedHours: 0, hoursDifference: 2 });
  });
  it('uses the gross IVA-inclusive COT denominator for a proportionate cash estimate', () => {
    expect(collectedServiceNet(30000, 100000, 59500)).toBe(15000);
    expect(collectedServiceNet(30000, 100000, 119000)).toBe(30000);
    expect(collectedServiceNet(30000, 100000, 999999)).toBe(30000);
  });
  it('allocates line/general discounts without duplication or lost cents', () => {
    const lines = [1, 2, 3].map((id) => ({ id, workOrderItemId: id, cantidad: 1, precioUnitario: 1,
      descuentoTipo: null, descuentoValor: 0 }));
    const allocated = discountedLineNets(lines, { descuentoTipo: 'fijo', descuentoValor: 1 });
    expect([...allocated.values()]).toEqual([0.67, 0.67, 0.66]);
    expect([...allocated.values()].reduce((a, b) => a + b, 0)).toBe(2);
  });
  it('does not invent an equivalent or margin when rates/cost are unknown', () => {
    expect(commercialSnapshot({ actualMinutes: 300, theoreticalNet: null, quotedNet: 30000, receivedNet: 0, actualCost: null })).toMatchObject({
      referenceHourlyRate: null, hoursDifference: null, commercialMargin: null,
    });
    expect(commercialSnapshot({ actualMinutes: 300, theoreticalNet: null, quotedNet: 30000, receivedNet: 0, actualCost: null, referenceHourlyRate: 10000 }).hoursDifference).toBe(-2);
  });
  it('adds equivalents per service with different specialties rather than mixing their reference rates', () => {
    const a = commercialSnapshot({ actualMinutes: 60, theoreticalNet: 10000, quotedNet: 30000, receivedNet: 0, actualCost: 5000 });
    const b = commercialSnapshot({ actualMinutes: 60, theoreticalNet: 30000, quotedNet: 30000, receivedNet: 0, actualCost: 10000 });
    const total = totalCommercialSnapshots([a, b]);
    expect(total.equivalentQuotedHours).toBe(4);
    expect(total.hoursDifference).toBe(2);
    expect(total.actualHours).toBe(2);
  });
  it('aggregates exact source minutes before rounding display hours', () => {
    const rows = [44, 45].map((seconds) => commercialSnapshot({ actualMinutes: seconds / 60,
      theoreticalNet: 1, quotedNet: 1, receivedNet: 0, actualCost: 0 }));
    expect(totalCommercialSnapshots(rows).actualHours).toBe(0.02);
  });
});

describe('Registered utilization excludes lunch and retains operational overtime', () => {
  it('shows five of eight hours and three unregistered, not an eight-hour completion requirement', () => {
    const report = calculateUtilization([scheduled], [session(1, '12:00', '16:00'), session(2, '17:00', '18:00')], now, 'day');
    expect(report.utilization).toMatchObject({ registeredHours: 5, scheduledHours: 8, unregisteredHours: 3, registeredPercent: 62.5 });
  });
  it('reports extra time once and does not use it to conceal an ordinary unregistered hour', () => {
    const report = calculateUtilization([scheduled], [session(1, '12:00', '16:00'), session(2, '21:00', '22:00', { overtime: true })], now, 'week');
    expect(report.utilization).toMatchObject({ registeredHours: 5, regularHours: 4, extraHours: 1, unregisteredHours: 4 });
    expect(report.periods).toHaveLength(1);
    expect(report.periods[0].label).toBe('Semana del 2026-11-16');
  });
  it('keeps unconfigured schedules unknown and empty denominators safe', () => {
    const report = calculateUtilization([{ ...scheduled, workers: [{ userId: 9, intervals: null }] }], [], now, 'month');
    expect(report.utilization.scheduledHours).toBeNull();
    expect(report.utilization.registeredPercent).toBeNull();
    expect(calculateUtilization([], [], now, 'day').utilization.registeredPercent).toBeNull();
  });
  it('preserves seconds and ignores a replaced session', () => {
    const report = calculateUtilization([scheduled], [session(1, '12:00', '12:01', { kind: 'cronometro', endedAt: new Date(at('12:00').getTime() + 44_000), durationMinutes: 0 }),
      session(2, '12:00', '13:00', { supersededAt: now })], now, 'day');
    expect(report.utilization.registeredHours).toBe(0.01);
  });
});

describe('Quality measures real review history and rework intervals', () => {
  it('distinguishes first-pass approval, rejection and extra technical rework', () => {
    const reviews = [
      { id: 1, workOrderItemId: 5, decision: 'rechazado' as const, createdAt: at('18:00') },
      { id: 2, workOrderItemId: 5, decision: 'aprobado' as const, createdAt: at('19:00') },
      { id: 3, workOrderItemId: 6, decision: 'aprobado' as const, createdAt: at('19:00') },
      { id: 4, workOrderItemId: null, decision: 'aprobado' as const, createdAt: at('19:01') },
    ];
    const report = calculateQuality([{ id: 5, estadoOperativo: 'completado', qualityStatus: 'aprobado' }, { id: 6, estadoOperativo: 'completado', qualityStatus: 'aprobado' }], reviews,
      [session(1, '17:00', '18:00'), session(2, '18:00', '18:30'), session(3, '18:00', '18:30', { supersededAt: now })], scheduled.start, scheduled.end, now);
    expect(report).toMatchObject({ reviewedServices: 2, firstPassApproved: 1, firstPassPercent: 50, rejections: 1, reworkHours: 0.5 });
  });
  it('keeps 100% completed pending quality and avoids a misleading 100% success with no reviews', () => {
    const report = calculateQuality([{ id: 5, estadoOperativo: 'completado', qualityStatus: 'pendiente' }], [], [], scheduled.start, scheduled.end, now);
    expect(report.pendingServices).toBe(1);
    expect(report.firstPassPercent).toBeNull();
  });
});
