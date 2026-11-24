import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

/** Nullable links preserve all existing hours and keep their historical attribution. */
export async function up(qi: QueryInterface): Promise<void> {
  for (const table of ['workshop_time_requests', 'work_order_item_sessions']) {
    const columns = await qi.describeTable(table);
    if (!columns.dp_stage_id) await qi.addColumn(table, 'dp_stage_id', {
      type: DataTypes.INTEGER, allowNull: true,
      references: { model: 'work_order_dp_stages', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE',
    });
  }
}

export async function down(qi: QueryInterface): Promise<void> {
  for (const table of ['workshop_time_requests', 'work_order_item_sessions']) {
    const columns = await qi.describeTable(table);
    if (columns.dp_stage_id) await qi.removeColumn(table, 'dp_stage_id');
  }
}
