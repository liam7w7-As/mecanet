import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

const tables = ['work_order_item_sessions', 'workshop_time_requests'];

export async function up(queryInterface: QueryInterface): Promise<void> {
  for (const table of tables) {
    const columns = await queryInterface.describeTable(table);
    if (!columns.overtime) {
      await queryInterface.addColumn(table, 'overtime', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  for (const table of [...tables].reverse()) {
    const columns = await queryInterface.describeTable(table);
    if (columns.overtime) await queryInterface.removeColumn(table, 'overtime');
  }
}
