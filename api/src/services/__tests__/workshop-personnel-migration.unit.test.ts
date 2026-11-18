import { describe, expect, it, vi } from 'vitest';

import { up } from '../../database/migrations/050-workshop-personnel.js';

import type { QueryInterface } from 'sequelize';

const fixture = (existingPrincipal = false) => {
  let generated = existingPrincipal;
  const indexes = new Map<string, string[]>();
  const query = {
    describeTable: vi.fn(async (table: string) => table === 'worker_specialties'
      ? { user_id: {}, is_principal: {}, ...(generated ? { principal_user_id: {} } : {}) } : {}),
    createTable: vi.fn(),
    showIndex: vi.fn(async (table: string) => (indexes.get(table) ?? []).map((name) => ({ name }))),
    addIndex: vi.fn(async (table: string, _fields: string[], options: { name: string; unique: boolean }) => {
      indexes.set(table, [...(indexes.get(table) ?? []), options.name]);
    }),
    bulkInsert: vi.fn(),
    sequelize: { query: vi.fn(async (sql: string) => {
      // Reproduce the MySQL restriction that MariaDB's local tests do not impose.
      if (/GENERATED ALWAYS.*STORED/.test(sql)) throw new Error("Function or expression 'user_id' cannot be used in the GENERATED ALWAYS AS clause");
      if (/ADD COLUMN `principal_user_id`/.test(sql)) generated = true;
      return /SELECT id FROM workshop_schedules/.test(sql) ? [{ id: 1 }] : [];
    }) },
  };
  return query;
};

describe('Personnel bootstrap compatibility with MySQL generated columns', () => {
  it('creates an indexed virtual column while preserving cascading user foreign keys', async () => {
    const query = fixture();
    await up(query as unknown as QueryInterface);
    expect(query.sequelize.query).toHaveBeenCalledWith(expect.stringMatching(/GENERATED ALWAYS.* VIRTUAL$/));
    expect(query.addIndex).toHaveBeenCalledWith('worker_specialties', ['principal_user_id'], { name: 'worker_specialties_principal_unique', unique: true });
    expect(query.sequelize.query.mock.calls.some(([sql]) => /DROP|DELETE|UPDATE|FOREIGN_KEY_CHECKS/.test(sql))).toBe(false);
    expect(query.createTable).not.toHaveBeenCalled();
  });
  it('resumes the interrupted bootstrap and remains idempotent across redeployments', async () => {
    const query = fixture();
    await up(query as unknown as QueryInterface);
    const count = query.addIndex.mock.calls.length;
    await up(query as unknown as QueryInterface);
    expect(query.addIndex).toHaveBeenCalledTimes(count);
    expect(query.sequelize.query.mock.calls.filter(([sql]) => /ADD COLUMN/.test(sql))).toHaveLength(1);
    expect(query.bulkInsert).not.toHaveBeenCalled();
  });
  it('preserves an existing generated column and its data on compatible installations', async () => {
    const query = fixture(true);
    await up(query as unknown as QueryInterface);
    expect(query.sequelize.query.mock.calls.some(([sql]) => /ALTER TABLE/.test(sql))).toBe(false);
  });
});
