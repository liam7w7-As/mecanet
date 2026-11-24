import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

/** Keep hours attached to their exact stage, including after reassignment/reopening. */
export async function up(queryInterface: QueryInterface): Promise<void> {
  for (const table of ['workshop_time_requests', 'work_order_item_sessions']) {
    const columns = await queryInterface.describeTable(table);
    if (!columns.dp_stage_id) await queryInterface.addColumn(table, 'dp_stage_id', {
      type: DataTypes.INTEGER, allowNull: true,
      references: { model: 'work_order_dp_stages', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE',
    });
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  for (const table of ['workshop_time_requests', 'work_order_item_sessions']) {
    const columns = await queryInterface.describeTable(table);
    if (columns.dp_stage_id) await queryInterface.removeColumn(table, 'dp_stage_id');
  }
}
