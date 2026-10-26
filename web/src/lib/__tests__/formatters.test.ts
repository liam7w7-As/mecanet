import { describe, expect, it } from 'vitest';

import { formatDate } from '../formatters';

describe('formatDate', () => {
  it('mantiene el día de una fecha sin hora', () => {
    expect(formatDate('2026-10-31')).toBe('31-10-2026');
  });

  it('mantiene el primer día del mes sin retroceder al mes anterior', () => {
    expect(formatDate('2026-01-01')).toBe('01-01-2026');
  });

  it('devuelve un texto seguro cuando no hay fecha', () => {
    expect(formatDate(null)).toBe('Sin fecha');
    expect(formatDate('')).toBe('Sin fecha');
  });
});
