import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const columns = await queryInterface.describeTable('quotations');
  if (!columns.archived_at) {
    await queryInterface.addColumn('quotations', 'archived_at', {
      type: DataTypes.DATE,
      allowNull: true,
    });
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const columns = await queryInterface.describeTable('quotations');
  if (columns.archived_at) await queryInterface.removeColumn('quotations', 'archived_at');
}
