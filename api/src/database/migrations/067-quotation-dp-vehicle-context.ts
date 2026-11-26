import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

const COLUMNS = [
  ['dp_body_type_id', DataTypes.STRING(60)],
  ['dp_size_id', DataTypes.STRING(60)],
  ['dp_vehicle_ref', DataTypes.STRING(140)],
] as const;

export async function up(qi: QueryInterface): Promise<void> {
  const existing = await qi.describeTable('quotations');
  for (const [column, type] of COLUMNS) {
    if (!existing[column]) {
      await qi.addColumn('quotations', column, { type, allowNull: true });
    }
  }
}

export async function down(qi: QueryInterface): Promise<void> {
  const existing = await qi.describeTable('quotations');
  for (const [column] of [...COLUMNS].reverse()) {
    if (existing[column]) {
      await qi.removeColumn('quotations', column);
    }
  }
}
