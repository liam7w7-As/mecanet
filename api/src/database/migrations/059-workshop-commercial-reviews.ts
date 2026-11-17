import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  if ((await queryInterface.showAllTables()).includes('workshop_commercial_reviews')) return;
  await queryInterface.createTable('workshop_commercial_reviews', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    work_order_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'work_orders', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
    work_order_item_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'work_order_items', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
    reason: { type: DataTypes.STRING(30), allowNull: false },
    note: { type: DataTypes.TEXT, allowNull: false },
    created_by: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
    created_by_name: { type: DataTypes.STRING(180), allowNull: false },
    snapshot: { type: DataTypes.JSON, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' });
  await queryInterface.addIndex('workshop_commercial_reviews', ['work_order_id', 'created_at']);
  await queryInterface.addIndex('workshop_commercial_reviews', ['work_order_item_id', 'created_at']);
}
export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('workshop_commercial_reviews');
}
