import { describe, expect, it, vi } from 'vitest';

import { down, up } from '../../database/migrations/058-workshop-time-operational.js';

import type { QueryInterface } from 'sequelize';

describe('Operational migration 058 without database access', () => {
  const fixture = (migrated = false) => ({
    describeTable: vi.fn().mockResolvedValue({
      duration_minutes: { type: migrated ? 'DECIMAL(14,8)' : 'INT' },
      ...(migrated ? { assignment_id: {}, state_event_id: {}, activity_status: {} } : {}),
    }),
    addColumn: vi.fn(), changeColumn: vi.fn(), removeColumn: vi.fn(),
    sequelize: { query: vi.fn() },
  });
  it('adds only time metadata, backfills historical assignments and retains fractional minute precision', async () => {
    const query = fixture();
    await up(query as unknown as QueryInterface);
    expect(query.addColumn.mock.calls.map((call) => call[1])).toEqual(['assignment_id', 'state_event_id', 'activity_status']);
    expect(query.changeColumn.mock.calls.map((call) => [call[0], call[1], String(call[2].type)])).toEqual([
      ['workshop_time_requests', 'duration_minutes', 'DECIMAL(14,8)'],
      ['work_order_item_sessions', 'duration_minutes', 'DECIMAL(14,8)'],
    ]);
    expect(query.sequelize.query).toHaveBeenCalledWith(expect.stringMatching(/a\.created_at <= r\.started_at/));
    expect(query.sequelize.query).toHaveBeenCalledWith(expect.stringMatching(/r\.kind = 'manual' AND r\.assignment_id IS NULL/));
  });
  it('can be bootstrapped repeatedly without duplicate fields or destructive precision changes', async () => {
    const query = fixture(true);
    await up(query as unknown as QueryInterface);
    expect(query.addColumn).not.toHaveBeenCalled();
    expect(query.changeColumn).not.toHaveBeenCalled();
    await down(query as unknown as QueryInterface);
    expect(query.removeColumn).toHaveBeenCalledTimes(3);
    expect(query.changeColumn).not.toHaveBeenCalled();
  });
});
