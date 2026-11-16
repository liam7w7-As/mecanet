import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

// Session kind/superseded_at/scheduled_end_at are owned by the timer migration.
export async function up(queryInterface: QueryInterface): Promise<void> {
  const tables = await queryInterface.showAllTables();
  if (tables.includes('workshop_time_requests')) return;
  const reference = (model: string, nullable = false) => ({
    type: DataTypes.INTEGER,
    allowNull: nullable,
    references: { model, key: 'id' },
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  });
  await queryInterface.createTable('workshop_time_requests', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    kind: { type: DataTypes.ENUM('manual', 'correction'), allowNull: false },
    status: {
      type: DataTypes.ENUM('pendiente', 'aprobada', 'rechazada'),
      allowNull: false,
      defaultValue: 'pendiente',
    },
    work_order_id: reference('work_orders'),
    work_order_item_id: reference('work_order_items'),
    user_id: reference('users'),
    user_name: { type: DataTypes.STRING(180), allowNull: false },
    source_session_id: reference('work_order_item_sessions', true),
    replacement_session_id: { ...reference('work_order_item_sessions', true), unique: true },
    started_at: { type: DataTypes.DATE, allowNull: false },
    ended_at: { type: DataTypes.DATE, allowNull: false },
    duration_minutes: { type: DataTypes.INTEGER, allowNull: false },
    note: { type: DataTypes.TEXT, allowNull: false },
    created_by: reference('users'),
    reviewed_by: reference('users', true),
    reviewed_at: { type: DataTypes.DATE, allowNull: true },
    review_note: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await queryInterface.addIndex('workshop_time_requests', ['user_id', 'status', 'started_at'], {
    name: 'workshop_time_requests_user_status_start_idx',
  });
  await queryInterface.addIndex('workshop_time_requests', ['source_session_id', 'status'], {
    name: 'workshop_time_requests_source_status_idx',
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('workshop_time_requests');
}
