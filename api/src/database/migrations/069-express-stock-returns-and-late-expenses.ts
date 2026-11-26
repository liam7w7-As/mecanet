import { DataTypes } from 'sequelize';

import type { ModelAttributeColumnOptions, QueryInterface } from 'sequelize';

export async function up(qi: QueryInterface): Promise<void> {
  const fields: Record<string, Record<string, ModelAttributeColumnOptions>> = {
    purchase_items: {
      stock_returned_at: { type: DataTypes.DATE, allowNull: true },
      stock_returned_by: { type: DataTypes.INTEGER, allowNull: true },
      stock_return_reason: { type: DataTypes.STRING(500), allowNull: true },
    },
    cash_movements: {
      after_closure_id: { type: DataTypes.INTEGER, allowNull: true },
    },
    work_order_items: {
      express_stock_returned_at: { type: DataTypes.DATE, allowNull: true },
    },
  };
  for (const [table, columns] of Object.entries(fields)) {
    const existing = await qi.describeTable(table);
    for (const [name, definition] of Object.entries(columns)) {
      if (!existing[name]) await qi.addColumn(table, name, definition);
    }
  }
}

export async function down(qi: QueryInterface): Promise<void> {
  for (const [table, names] of Object.entries({
    purchase_items: ['stock_returned_at', 'stock_returned_by', 'stock_return_reason'],
    cash_movements: ['after_closure_id'],
    work_order_items: ['express_stock_returned_at'],
  })) {
    const existing = await qi.describeTable(table);
    for (const name of names) if (existing[name]) await qi.removeColumn(table, name);
  }
}
