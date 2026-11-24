import { describe, expect, it } from 'vitest';

import { dailyInterval, dailyLocalDate } from '../useWorkshopDailyLog';

describe('daily entries use the workshop clock', () => {
  it.each([
    ['2026-11-19', '2026-11-19T12:00:00.000Z'],
    ['2026-07-15', '2026-07-15T13:00:00.000Z'],
  ])('keeps 09:00 in Santiago on %s independently of the device', (date, start) => {
    const interval = dailyInterval(date, '09:00', '1,5');
    expect(interval?.startedAt).toBe(start);
    expect(Date.parse(interval!.endedAt) - Date.parse(start)).toBe(90 * 60_000);
  });

  it('uses the configured zone rather than hardcoding Chile offsets', () => {
    expect(dailyInterval('2026-11-19', '09:00', '1', 'Pacific/Auckland')?.startedAt).toBe(
      '2026-11-18T20:00:00.000Z',
    );
  });

  it('rejects the missing hour during the Chilean daylight-saving change', () => {
    expect(dailyInterval('2026-09-06', '00:30', '1')).toBeNull();
  });

  it.each([
    ['2026-02-30', '09:00', '1'],
    ['2026-11-19', '25:00', '1'],
    ['2026-11-19', '09:00', '0'],
    ['2026-11-19', '09:00', '-1'],
  ])('rejects invalid civil time or duration: %s %s %s', (date, time, duration) => {
    expect(dailyInterval(date, time, duration)).toBeNull();
  });

  it('selects the workshop calendar day around midnight', () => {
    const instant = new Date('2026-11-19T02:00:00Z');
    expect(dailyLocalDate(instant)).toBe('2026-11-18');
    expect(dailyLocalDate(instant, 'Pacific/Auckland')).toBe('2026-11-19');
  });
});
