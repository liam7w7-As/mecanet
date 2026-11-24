import { beforeEach, describe, expect, it, vi } from 'vitest';

import { down, up } from '../../database/migrations/060-workshop-daily-entries.js';

import type { QueryInterface } from 'sequelize';

const columns: Record<string, object> = {};
const indexes = new Set<string>();
const query = {
  describeTable: vi.fn(async () => columns),
  showIndex: vi.fn(async () => [...indexes].map((name) => ({ name }))),
  addColumn: vi.fn(async (_table: string, name: string, definition: object) => { columns[name] = definition; }),
  addIndex: vi.fn(async (_table: string, _fields: string[], options: { name: string; unique: boolean }) => { indexes.add(options.name); }),
  removeColumn: vi.fn(async (_table: string, name: string) => { delete columns[name]; }),
  removeIndex: vi.fn(async (_table: string, name: string) => { indexes.delete(name); }),
  sequelize: { query: vi.fn() },
};
beforeEach(() => {
  vi.clearAllMocks();
  for (const name of Object.keys(columns)) delete columns[name];
  columns.activity_status = {};
  indexes.clear();
});

describe('Daily entry migration 060 without a database', () => {
  it('adds nullable UUID and payload hash columns so legacy requests need no backfill', async () => {
    await up(query as unknown as QueryInterface);
    expect(query.addColumn.mock.calls.map(([, name, definition]) => [name, String((definition as { type: object }).type), (definition as { allowNull: boolean }).allowNull])).toEqual([
      ['client_request_id', 'VARCHAR(36)', true], ['client_request_hash', 'VARCHAR(64)', true],
    ]);
    expect(query.addIndex).toHaveBeenCalledWith('workshop_time_requests', ['client_request_id'], {
      name: 'workshop_time_requests_client_request_unique', unique: true,
    });
    expect(query.sequelize.query).not.toHaveBeenCalled();
  });
  it('can restart safely after columns or the unique index have already been created', async () => {
    columns.client_request_id = {};
    await up(query as unknown as QueryInterface);
    expect(query.addColumn.mock.calls.map(([, name]) => name)).toEqual(['client_request_hash']);
    await up(query as unknown as QueryInterface);
    expect(query.addColumn).toHaveBeenCalledOnce();
    expect(query.addIndex).toHaveBeenCalledOnce();
  });
  it('prevents old versions from replaying daily progress on hours approval when rolling back', async () => {
    await up(query as unknown as QueryInterface);
    await down(query as unknown as QueryInterface);
    expect(query.sequelize.query).toHaveBeenCalledWith(expect.stringMatching(/UPDATE workshop_time_requests\s+SET activity_status = NULL WHERE client_request_id IS NOT NULL/));
    expect(query.sequelize.query.mock.invocationCallOrder[0]).toBeLessThan(query.removeColumn.mock.invocationCallOrder[0]);
    expect(query.removeIndex).toHaveBeenCalledWith('workshop_time_requests', 'workshop_time_requests_client_request_unique');
    expect(query.removeColumn.mock.calls.map(([, name]) => name)).toEqual(['client_request_hash', 'client_request_id']);
    expect(columns).toEqual({ activity_status: {} });
  });
  it('leaves existing requests and legacy activity metadata untouched if already rolled back', async () => {
    await down(query as unknown as QueryInterface);
    expect(query.sequelize.query).not.toHaveBeenCalled();
    expect(query.removeIndex).not.toHaveBeenCalled();
    expect(query.removeColumn).not.toHaveBeenCalled();
  });
});
