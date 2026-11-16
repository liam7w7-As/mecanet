import { describe, expect, it } from 'vitest';

import { formatWorkshopMinutes } from '../workshop-time-format';

describe('Workshop duration labels', () => {
  it('preserves existing labels for complete minutes', () => {
    expect(formatWorkshopMinutes(0)).toBe('0 h 00 min');
    expect(formatWorkshopMinutes(90)).toBe('1 h 30 min');
  });
  it('shows short recorded intervals and their accumulated seconds', () => {
    expect(formatWorkshopMinutes(44 / 60)).toBe('0 h 00 min 44 s');
    expect(formatWorkshopMinutes(89 / 60)).toBe('0 h 01 min 29 s');
    expect(formatWorkshopMinutes(149 / 60)).toBe('0 h 02 min 29 s');
  });
  it('formats signed corrections and unknown values without floating point tails', () => {
    expect(formatWorkshopMinutes(-0.5)).toBe('-0 h 00 min 30 s');
    expect(formatWorkshopMinutes(Number.NaN)).toBe('Sin registro');
  });
});
