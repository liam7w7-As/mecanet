import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const orders = await queryInterface.describeTable('work_orders');
  if (!orders.price_approval_required) await queryInterface.addColumn('work_orders', 'price_approval_required', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true });
  const suggestions = await queryInterface.describeTable('work_order_price_suggestions');
  if (!suggestions.applied_directly) await queryInterface.addColumn('work_order_price_suggestions', 'applied_directly', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
  if (!suggestions.source_request_id) await queryInterface.addColumn('work_order_price_suggestions', 'source_request_id', { type: DataTypes.INTEGER, allowNull: true, references: { model: 'work_order_requests', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' });
  const indexes = await queryInterface.showIndex('work_order_price_suggestions') as Array<{ name: string }>;
  if (!indexes.some((index) => index.name === 'work_order_price_suggestions_source_unique')) await queryInterface.addIndex('work_order_price_suggestions', ['source_request_id'], { name: 'work_order_price_suggestions_source_unique', unique: true });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  for (const [table, names] of [['work_order_price_suggestions', ['source_request_id', 'applied_directly']], ['work_orders', ['price_approval_required']]] as const) {
    const columns = await queryInterface.describeTable(table);
    for (const name of names) if (columns[name]) await queryInterface.removeColumn(table, name);
  }
}
