import { describe, expect, it } from 'vitest';

import {
  isWorkshopCostReportRole,
  workshopCostReportQuerySchema,
} from '../workshop-cost-report.schema.js';

describe('Internal workshop cost report query', () => {
  it('accepts explicit dates and coerces optional IDs and status', () => {
    expect(
      workshopCostReportQuerySchema.parse({
        fechaDesde: '2026-11-01',
        fechaHasta: '2026-11-02',
        userId: '3',
        specialtyId: '4',
        workOrderId: '5',
        estado: 'en_progreso',
        search: '  taller  ',
      }),
    ).toMatchObject({
      userId: 3,
      specialtyId: 4,
      workOrderId: 5,
      search: 'taller',
      estado: 'en_progreso',
    });
  });
  it.each([
    { fechaDesde: '2026-11-03', fechaHasta: '2026-11-01' },
    { fechaDesde: '2026-02-30' },
    { userId: 0 },
    { userId: '-1' },
    { specialtyId: 'abc' },
    { estado: 'inventado' },
    { search: 'x'.repeat(121) },
    { email: 'client@example.test' },
    { pageSize: 1 },
  ])('rejects invalid filters and unsupported delivery/query parameters %j', (query) => {
    expect(workshopCostReportQuerySchema.safeParse(query).success).toBe(false);
  });
  it('keeps only internal roles, irrespective of externally granted permissions', () => {
    for (const role of ['admin', 'desarrollador', 'jefe', 'finanzas'])
      expect(isWorkshopCostReportRole(role)).toBe(true);
    for (const role of ['mecanico', 'vendedor', 'bodeguero', 'unknown'])
      expect(isWorkshopCostReportRole(role)).toBe(false);
  });
});
