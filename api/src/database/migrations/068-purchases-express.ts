import { DataTypes } from 'sequelize';

import type { ModelAttributeColumnOptions, QueryInterface } from 'sequelize';

export async function up(qi: QueryInterface): Promise<void> {
  const columns: Record<string, Record<string, ModelAttributeColumnOptions>> = {
    purchases: {
      express_key: { type: DataTypes.STRING(36), allowNull: true, unique: true },
      express_fingerprint: { type: DataTypes.STRING(64), allowNull: true },
    },
    purchase_items: {
      source_request_id: { type: DataTypes.INTEGER, allowNull: true },
      work_order_item_id: { type: DataTypes.INTEGER, allowNull: true },
      venta_unitario: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      previous_sale_price: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      express_created_item: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    work_order_items: {
      minimum_sale_price: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      express_purchase_id: { type: DataTypes.INTEGER, allowNull: true },
    },
  };
  for (const [table, fields] of Object.entries(columns)) {
    const existing = await qi.describeTable(table);
    for (const [name, definition] of Object.entries(fields)) {
      if (!existing[name]) await qi.addColumn(table, name, definition);
    }
  }
}

export async function down(qi: QueryInterface): Promise<void> {
  for (const [table, names] of Object.entries({
    purchase_items: [
      'source_request_id',
      'work_order_item_id',
      'venta_unitario',
      'previous_sale_price',
      'express_created_item',
    ],
    work_order_items: ['minimum_sale_price', 'express_purchase_id'],
    purchases: ['express_key', 'express_fingerprint'],
  })) {
    const columns = await qi.describeTable(table);
    for (const name of names) if (columns[name]) await qi.removeColumn(table, name);
  }
}
