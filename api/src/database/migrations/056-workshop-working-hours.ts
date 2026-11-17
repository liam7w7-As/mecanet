import { DEFAULT_WORKSHOP_WEEKLY } from '@unithor/shared';
import { QueryTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

/** Initialize the confirmed operating hours; never replace an administrator's saved schedule. */
export async function up(queryInterface: QueryInterface): Promise<void> {
  const rows = await queryInterface.sequelize.query<{ id: number }>(
    'SELECT id FROM workshop_schedules WHERE id = 1', { type: QueryTypes.SELECT },
  );
  if (!rows.length) {
    await queryInterface.bulkInsert('workshop_schedules', [{
      id: 1, timezone: 'America/Santiago', weekly: JSON.stringify(DEFAULT_WORKSHOP_WEEKLY),
      updated_by: null, created_at: new Date(), updated_at: new Date(),
    }]);
  } else {
    await queryInterface.sequelize.query(
      'UPDATE workshop_schedules SET weekly = :weekly, updated_at = :now WHERE id = 1 AND updated_by IS NULL AND JSON_LENGTH(weekly) = 0',
      { replacements: { weekly: JSON.stringify(DEFAULT_WORKSHOP_WEEKLY), now: new Date() } },
    );
  }
}

/** Operational records and the configured schedule are deliberately retained. */
export async function down(_queryInterface: QueryInterface): Promise<void> {}
