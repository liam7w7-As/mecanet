import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const tables = await queryInterface.showAllTables();
  if (tables.includes('workshop_alert_settings')) return;
  await queryInterface.createTable('workshop_alert_settings', {
    id: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
    time_tolerance_percent: { type: DataTypes.DECIMAL(7, 2), allowNull: false, defaultValue: 0 },
    commercial_tolerance_percent: {
      type: DataTypes.DECIMAL(7, 2),
      allowNull: false,
      defaultValue: 0,
    },
    updated_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
}
export async function down(queryInterface: QueryInterface): Promise<void> {
  if ((await queryInterface.showAllTables()).includes('workshop_alert_settings'))
    await queryInterface.dropTable('workshop_alert_settings');
}
