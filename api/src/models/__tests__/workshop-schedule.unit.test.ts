import 'reflect-metadata';
import { Sequelize } from 'sequelize-typescript';
import { afterAll, describe, expect, it } from 'vitest';

import { WorkshopSchedule } from '../WorkshopSchedule.js';

import type { WorkshopWeeklyDay } from '@unithor/shared';

// Register metadata only: no authenticate/sync/query, and no connection is opened.
const metadata = new Sequelize({ dialect: 'mysql', database: 'unused', username: 'unused', logging: false, models: [WorkshopSchedule] });
afterAll(async () => { await metadata.close(); });
const weekly = [{ weekday: 1, start: '07:45', end: '14:20' }];
const hydrate = (value: unknown) => {
  const row = WorkshopSchedule.build({ id: 1, timezone: 'America/Santiago', weekly: [], updatedBy: null });
  row.setDataValue('weekly', value as WorkshopWeeklyDay[]);
  return row;
};

describe('MariaDB/MySQL weekly schedule hydration', () => {
  it('returns a validated array for native JSON values', () => {
    expect(hydrate(weekly).weekly).toEqual(weekly);
  });
  it('parses driver-returned JSON strings before service consumers call find/map', () => {
    const row = hydrate(JSON.stringify(weekly));
    expect(Array.isArray(row.weekly)).toBe(true);
    expect(row.weekly.find((day) => day.weekday === 1)?.end).toBe('14:20');
  });
  it.each([{ stored: [] }, { stored: '[]' }])('keeps empty stored configuration unconfigured (%j)', ({ stored }) => {
    expect(hydrate(stored).weekly).toEqual([]);
  });
  it.each(['not-json', '{}', 'null', '[{"weekday":9,"start":"09:00","end":"10:00"}]', '[{"weekday":1,"start":"10:00","end":"09:00"}]'])('rejects corrupt persisted configuration %s', (value) => {
    expect(() => hydrate(value).weekly).toThrow(/horario semanal almacenado/);
  });
});
