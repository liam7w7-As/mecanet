import { DataTypes, QueryTypes } from 'sequelize';

import type { ModelAttributeColumnOptions, QueryInterface } from 'sequelize';

const tableExists = async (queryInterface: QueryInterface, table: string): Promise<boolean> => {
  try { await queryInterface.describeTable(table); return true; } catch { return false; }
};

/** Idempotent for bootstrap and sequelize-cli. Optional specialty seeds live in the service; no rates are seeded. */
export async function up(queryInterface: QueryInterface): Promise<void> {
  const id = { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false };
  const timestamp = { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW };
  const user = { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' };
  const specialty = { type: DataTypes.INTEGER, allowNull: false, references: { model: 'specialties', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' };
  const definitions: Array<{ table: string; columns: Record<string, ModelAttributeColumnOptions> }> = [
    { table: 'specialties', columns: {
      id, name: { type: DataTypes.STRING(100), allowNull: false }, active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: timestamp, updated_at: timestamp,
    } },
    { table: 'specialty_rates', columns: {
      id, specialty_id: specialty, validity_from: { type: DataTypes.DATEONLY, allowNull: false },
      cost_hourly: { type: DataTypes.DECIMAL(12, 2), allowNull: false }, sale_hourly: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      created_by: user, created_at: timestamp,
    } },
    { table: 'worker_specialties', columns: {
      id, user_id: { ...user, allowNull: false }, specialty_id: specialty, is_principal: { type: DataTypes.BOOLEAN, allowNull: false },
      updated_by: user, created_at: timestamp, updated_at: timestamp,
    } },
    { table: 'workshop_schedules', columns: {
      id: { ...id, autoIncrement: false }, timezone: { type: DataTypes.STRING(64), allowNull: false },
      weekly: { type: DataTypes.JSON, allowNull: false }, updated_by: user, created_at: timestamp, updated_at: timestamp,
    } },
    { table: 'workshop_schedule_exceptions', columns: {
      id, user_id: { ...user, allowNull: false }, date: { type: DataTypes.DATEONLY, allowNull: false },
      version: { type: DataTypes.INTEGER, allowNull: false }, day_off: { type: DataTypes.BOOLEAN, allowNull: false },
      start: { type: DataTypes.STRING(5), allowNull: true }, end: { type: DataTypes.STRING(5), allowNull: true },
      reason: { type: DataTypes.STRING(1000), allowNull: false }, created_by: user, created_at: timestamp,
    } },
  ];
  for (const { table, columns } of definitions) {
    if (!(await tableExists(queryInterface, table))) await queryInterface.createTable(table, columns, { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' });
  }
  // MySQL has no partial unique indexes. NULL additional rows do not collide.
  const workerColumns = await queryInterface.describeTable('worker_specialties');
  if (!workerColumns.principal_user_id) {
    await queryInterface.sequelize.query('ALTER TABLE `worker_specialties` ADD COLUMN `principal_user_id` INTEGER GENERATED ALWAYS AS (CASE WHEN `is_principal` = 1 THEN `user_id` ELSE NULL END) STORED');
  }
  for (const [table, fields, name] of [
    ['specialties', ['name'], 'specialties_name_unique'],
    ['specialty_rates', ['specialty_id', 'validity_from'], 'specialty_rates_validity_unique'],
    ['worker_specialties', ['user_id', 'specialty_id'], 'worker_specialties_membership_unique'],
    ['worker_specialties', ['principal_user_id'], 'worker_specialties_principal_unique'],
    ['workshop_schedule_exceptions', ['user_id', 'date', 'version'], 'workshop_exceptions_version_unique'],
  ] as const) {
    const indexes = await queryInterface.showIndex(table) as unknown as Array<{ name: string }>;
    if (!indexes.some((index) => index.name === name)) await queryInterface.addIndex(table, [...fields], { name, unique: true });
  }
  const schedules = await queryInterface.sequelize.query<{ id: number }>('SELECT id FROM workshop_schedules WHERE id = 1', { type: QueryTypes.SELECT });
  if (!schedules.length) await queryInterface.bulkInsert('workshop_schedules', [{
    id: 1, timezone: 'America/Santiago', weekly: JSON.stringify([]), updated_by: null, created_at: new Date(), updated_at: new Date(),
  }]);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  for (const table of ['workshop_schedule_exceptions', 'workshop_schedules', 'worker_specialties', 'specialty_rates', 'specialties']) {
    if (await tableExists(queryInterface, table)) await queryInterface.dropTable(table);
  }
}
