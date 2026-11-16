import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

export async function up(q: QueryInterface): Promise<void> {
  const tables = await q.showAllTables() as string[];
  if (!tables.includes('work_order_item_assignments')) {
    await q.createTable('work_order_item_assignments', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      work_order_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'work_orders', key: 'id' }, onDelete: 'CASCADE' },
      work_order_item_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'work_order_items', key: 'id' }, onDelete: 'CASCADE' },
      user_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
      user_name: { type: DataTypes.STRING(180), allowNull: false },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      specialty_id: { type: DataTypes.INTEGER, allowNull: true }, specialty_name: { type: DataTypes.STRING(120), allowNull: true },
      rate_id: { type: DataTypes.INTEGER, allowNull: true },
      cost_hourly: { type: DataTypes.DECIMAL(12, 2), allowNull: true }, sale_hourly: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      estimated_hours: { type: DataTypes.DECIMAL(7, 2), allowNull: true }, original_estimated_hours: { type: DataTypes.DECIMAL(7, 2), allowNull: true },
      completed_at: { type: DataTypes.DATE, allowNull: true }, created_by: { type: DataTypes.INTEGER, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false }, updated_at: { type: DataTypes.DATE, allowNull: false },
    });
    await q.addIndex('work_order_item_assignments', ['work_order_item_id', 'active']);
    await q.addIndex('work_order_item_assignments', ['user_id', 'active']);
  }
  const columns = await q.describeTable('work_order_item_sessions');
  const itemColumns = await q.describeTable('work_order_items');
  if (!itemColumns.team_managed) {
    await q.addColumn('work_order_items', 'team_managed', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
    await q.sequelize.query('UPDATE work_order_items SET team_managed = 1 WHERE EXISTS (SELECT 1 FROM work_order_item_assignments a WHERE a.work_order_item_id = work_order_items.id)');
  }
  for (const name of ['scheduled_end_at', 'superseded_at']) {
    if (!columns[name]) await q.addColumn('work_order_item_sessions', name, { type: DataTypes.DATE, allowNull: true });
  }
  if (!columns.assignment_id) await q.addColumn('work_order_item_sessions', 'assignment_id', { type: DataTypes.INTEGER, allowNull: true });
  const indexes = await q.showIndex('work_order_item_sessions') as Array<{ name: string }>;
  if (!indexes.some((index) => index.name === 'work_order_item_sessions_shift_idx')) await q.addIndex('work_order_item_sessions', ['status', 'scheduled_end_at'], { name: 'work_order_item_sessions_shift_idx' });
  if (!columns.kind.type.includes('manual')) await q.changeColumn('work_order_item_sessions', 'kind', { type: DataTypes.ENUM('cronometro', 'ajuste', 'manual'), allowNull: false, defaultValue: 'cronometro' });
}

export async function down(q: QueryInterface): Promise<void> {
  await q.dropTable('work_order_item_assignments');
  // Keep session history and manual kinds: rollback must never discard registered time.
}
