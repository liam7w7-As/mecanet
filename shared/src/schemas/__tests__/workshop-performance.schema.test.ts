import { describe, expect, it } from 'vitest';

import { createWorkshopCommercialReviewSchema, workshopPerformanceQuerySchema } from '../workshop-performance.schema.js';

describe('Workshop performance query and immutable commercial review input', () => {
  it('coerces scoped filters and defaults daily grouping', () => {
    expect(workshopPerformanceQuerySchema.parse({ fechaDesde: '2026-11-01', fechaHasta: '2026-11-17', vehicleId: '5', userId: '9' }))
      .toMatchObject({ vehicleId: 5, userId: 9, groupBy: 'day' });
  });
  it.each([
    { fechaDesde: '2026-11-17', fechaHasta: '2026-11-01' },
    { fechaDesde: '2020-01-01', fechaHasta: '2026-11-17' },
    { fechaDesde: '2026-11-01', fechaHasta: '2026-11-17', vehicleId: 0 },
    { fechaDesde: '2026-11-01', fechaHasta: '2026-11-17', groupBy: 'year' },
  ])('rejects invalid or unbounded report scopes: %o', (input) => {
    expect(workshopPerformanceQuerySchema.safeParse(input).success).toBe(false);
  });
  it('requires an explained reason and rejects client-supplied calculated snapshots', () => {
    const input = { workOrderItemId: 1, reason: 'garantia', note: '  Corrección en garantía  ', referenceHourlyRate: 10000 };
    expect(createWorkshopCommercialReviewSchema.parse(input).note).toBe('Corrección en garantía');
    for (const invalid of [{ ...input, note: ' ' }, { ...input, referenceHourlyRate: 0 }, { ...input, snapshot: { actualHours: 0 } }]) {
      expect(createWorkshopCommercialReviewSchema.safeParse(invalid).success).toBe(false);
    }
  });
});
