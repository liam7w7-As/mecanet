import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

const tables = ['workshop_time_requests', 'work_order_item_sessions'] as const;

export async function up(queryInterface: QueryInterface): Promise<void> {
  for (const table of tables) {
    const columns = await queryInterface.describeTable(table);
    if (!columns.reported_date) {
      await queryInterface.addColumn(table, 'reported_date', { type: DataTypes.DATEONLY, allowNull: true });
    }
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Never erase declared hours or reinterpret them as measured clock intervals.
  const removable: string[] = [];
  for (const table of tables) {
    const columns = await queryInterface.describeTable(table);
    if (!columns.reported_date) continue;
    const [rows] = await queryInterface.sequelize.query(`SELECT id FROM ${table} WHERE reported_date IS NOT NULL LIMIT 1`);
    if (Array.isArray(rows) && rows.length) throw new Error('Existen horas declaradas; conserva reported_date para preservar su significado');
    removable.push(table);
  }
  for (const table of removable) await queryInterface.removeColumn(table, 'reported_date');
}
