import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const columns = await queryInterface.describeTable('users');
  if (columns.sales_access_all) return;
  await queryInterface.addColumn('users', 'sales_access_all', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const columns = await queryInterface.describeTable('users');
  if (columns.sales_access_all) await queryInterface.removeColumn('users', 'sales_access_all');
}
