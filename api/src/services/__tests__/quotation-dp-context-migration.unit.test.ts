import { describe, expect, it, vi } from 'vitest';

import { up } from '../../database/migrations/067-quotation-dp-vehicle-context.js';

import type { QueryInterface } from 'sequelize';

describe('Quotation D&P vehicle context migration', () => {
  it('adds nullable D&P vehicle classification columns to quotations', async () => {
    const qi = {
      describeTable: vi.fn().mockResolvedValue({ id: {}, vehicle_id: {} }),
      addColumn: vi.fn(),
    };
    await up(qi as unknown as QueryInterface);
    expect(qi.addColumn).toHaveBeenCalledTimes(3);
    expect(qi.addColumn).toHaveBeenCalledWith(
      'quotations',
      'dp_body_type_id',
      expect.objectContaining({ allowNull: true }),
    );
    expect(qi.addColumn).toHaveBeenCalledWith(
      'quotations',
      'dp_size_id',
      expect.objectContaining({ allowNull: true }),
    );
    expect(qi.addColumn).toHaveBeenCalledWith(
      'quotations',
      'dp_vehicle_ref',
      expect.objectContaining({ allowNull: true }),
    );
  });

  it('skips existing columns safely on re-run', async () => {
    const qi = {
      describeTable: vi.fn().mockResolvedValue({
        dp_body_type_id: {},
        dp_size_id: {},
        dp_vehicle_ref: {},
      }),
      addColumn: vi.fn(),
    };
    await up(qi as unknown as QueryInterface);
    expect(qi.addColumn).not.toHaveBeenCalled();
  });
});
