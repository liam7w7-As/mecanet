import { describe, expect, it } from 'vitest';

import { workshopHistoryQuerySchema } from '../workshop-history.schema.js';

describe('Workshop historical comparison filters', () => {
  it('uses bounded pagination and correctly parses false from query strings', () => {
    expect(workshopHistoryQuerySchema.parse({ sameVehicle: 'false' })).toEqual({ page: 1, pageSize: 10, sameVehicle: false });
    expect(workshopHistoryQuerySchema.parse({ sameVehicle: 'true', page: '2' }).sameVehicle).toBe(true);
    expect(workshopHistoryQuerySchema.safeParse({ pageSize: 31 }).success).toBe(false);
  });
  it('rejects invalid/inverted dates and unrelated filter fields', () => {
    expect(workshopHistoryQuerySchema.safeParse({ fechaDesde: '2026-02-30' }).success).toBe(false);
    expect(workshopHistoryQuerySchema.safeParse({ fechaDesde: '2026-11-10', fechaHasta: '2026-11-01' }).success).toBe(false);
    expect(workshopHistoryQuerySchema.safeParse({ userId: 2 }).success).toBe(false);
  });
});
