import { describe, expect, it, vi } from 'vitest';

import { up } from '../../database/migrations/066-vehicle-dp-classification.js';

import type { QueryInterface } from 'sequelize';

describe('Vehicle D&P classification migration', () => {
  it('adds nullable fields without assigning guessed classifications to existing vehicles', async () => {
    const qi = { describeTable: vi.fn().mockResolvedValue({ id: {} }), addColumn: vi.fn(), sequelize: { query: vi.fn() } };
    await up(qi as unknown as QueryInterface);
    expect(qi.addColumn).toHaveBeenCalledTimes(2);
    expect(qi.addColumn).toHaveBeenCalledWith('vehicles', 'dp_body_type_id', expect.objectContaining({ allowNull: true }));
    expect(qi.addColumn).toHaveBeenCalledWith('vehicles', 'dp_size_id', expect.objectContaining({ allowNull: true }));
    expect(qi.sequelize.query).not.toHaveBeenCalled();
  });

  it('can run again without overwriting existing classification columns', async () => {
    const qi = { describeTable: vi.fn().mockResolvedValue({ dp_body_type_id: {}, dp_size_id: {} }), addColumn: vi.fn() };
    await up(qi as unknown as QueryInterface);
    expect(qi.addColumn).not.toHaveBeenCalled();
  });
});
