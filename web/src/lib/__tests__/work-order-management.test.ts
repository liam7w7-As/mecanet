import { describe, expect, it } from 'vitest';

import { getWorkOrderManagementPath } from '../work-order-management';

describe('Unified work management destinations', () => {
  it('opens a mechanic order on the personal board', () => {
    expect(getWorkOrderManagementPath(42, 'mecanico')).toBe('/work-orders/mine?manage=42');
  });
  it.each(['jefe', 'admin', 'desarrollador'] as const)('opens the same managing modal for %s', (role) => {
    expect(getWorkOrderManagementPath(42, role)).toBe('/work-orders?manage=42');
  });
  it.each([0, -1, 1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('keeps an invalid ID %s out of the modal URL', (id) => {
    expect(getWorkOrderManagementPath(id, 'mecanico')).toBe('/work-orders/mine');
    expect(getWorkOrderManagementPath(id, 'jefe')).toBe('/work-orders');
  });
});
