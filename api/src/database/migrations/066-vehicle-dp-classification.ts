import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

export async function up(qi: QueryInterface): Promise<void> {
  const columns = await qi.describeTable('vehicles');
  for (const column of ['dp_body_type_id', 'dp_size_id']) {
    if (!columns[column]) {
      await qi.addColumn('vehicles', column, { type: DataTypes.STRING(60), allowNull: true });
    }
  }
}

export async function down(qi: QueryInterface): Promise<void> {
  const columns = await qi.describeTable('vehicles');
  for (const column of ['dp_size_id', 'dp_body_type_id']) {
    if (columns[column]) await qi.removeColumn('vehicles', column);
  }
}
