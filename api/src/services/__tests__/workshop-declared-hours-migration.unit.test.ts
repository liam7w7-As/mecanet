import { describe, expect, it, vi } from 'vitest';

import { down, up } from '../../database/migrations/061-workshop-declared-hours.js';

import type { QueryInterface } from 'sequelize';

const fixture = () => {
  const columns = new Set<string>();
  const schema = {
    describeTable: vi.fn(async (table: string) => columns.has(table) ? { reported_date: {} } : {}),
    addColumn: vi.fn(async (table: string) => { columns.add(table); }),
    removeColumn: vi.fn(),
    sequelize: { query: vi.fn(async (_sql: string): Promise<[Array<{ id: number }>, unknown[]]> => [[], []]) },
  };
  return { schema, qi: schema as unknown as QueryInterface };
};

describe('declared daily hours migration', () => {
  it('is idempotent and leaves existing clock and manual hours intact', async () => {
    const { schema, qi } = fixture();
    await up(qi);
    await up(qi);
    expect(schema.addColumn).toHaveBeenCalledTimes(2);
    expect(schema.addColumn.mock.calls.map(([table]) => table))
      .toEqual(['workshop_time_requests', 'work_order_item_sessions']);
    expect(schema.sequelize.query).not.toHaveBeenCalled();
    expect(schema.removeColumn).not.toHaveBeenCalled();
  });

  it('checks both tables before rolling back and refuses to discard declared hours', async () => {
    const { schema, qi } = fixture();
    await up(qi);
    schema.sequelize.query.mockImplementation(async (sql) =>
      sql.includes('work_order_item_sessions') ? [[{ id: 1 }], []] : [[], []]);
    await expect(down(qi)).rejects.toThrow('Existen horas declaradas');
    expect(schema.removeColumn).not.toHaveBeenCalled();
  });

  it('rolls back an unused migration without deleting records', async () => {
    const { schema, qi } = fixture();
    await up(qi);
    await down(qi);
    expect(schema.removeColumn).toHaveBeenCalledTimes(2);
    expect(schema.sequelize.query.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
  });
});
