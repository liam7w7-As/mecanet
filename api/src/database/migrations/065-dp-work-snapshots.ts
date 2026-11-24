import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

const columns = [
  ['work_order_items', 'dp_pricing_snapshot'],
  ['quotation_items', 'dp_pricing_snapshot'],
  ['work_order_dp_stages', 'allowed_specialties'],
] as const;

/** Historical prices and stage assignments remain intact; only new calculations carry snapshots. */
export async function up(qi: QueryInterface): Promise<void> {
  for (const [table, column] of columns) {
    const existing = await qi.describeTable(table);
    if (!existing[column]) await qi.addColumn(table, column, { type: DataTypes.JSON, allowNull: true });
  }
  const stages = await qi.describeTable('work_order_dp_stages');
  if (stages.stage_label && stages.stage_label.type.toUpperCase() !== 'VARCHAR(180)') {
    await qi.changeColumn('work_order_dp_stages', 'stage_label', { type: DataTypes.STRING(180), allowNull: false });
  }
}

export async function down(qi: QueryInterface): Promise<void> {
  // Keep the widened label column: shrinking it could truncate configured historical labels.
  for (const [table, column] of [...columns].reverse()) {
    const existing = await qi.describeTable(table);
    if (existing[column]) await qi.removeColumn(table, column);
  }
}
