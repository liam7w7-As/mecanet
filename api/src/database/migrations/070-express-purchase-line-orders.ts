import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

export async function up(qi: QueryInterface): Promise<void> {
  const fields = await qi.describeTable('purchase_items');
  if (!fields.work_order_id) {
    await qi.addColumn('purchase_items', 'work_order_id', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'work_orders', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
  }
  // Existing express receipts belong to the original header order; ordinary purchases stay intact.
  await qi.sequelize.query(`
    UPDATE purchase_items AS line
    INNER JOIN purchases AS purchase ON purchase.id = line.purchase_id
    SET line.work_order_id = purchase.work_order_id
    WHERE line.work_order_id IS NULL AND purchase.express_key IS NOT NULL
      AND purchase.work_order_id IS NOT NULL
  `);
}

export async function down(qi: QueryInterface): Promise<void> {
  const fields = await qi.describeTable('purchase_items');
  if (fields.work_order_id) await qi.removeColumn('purchase_items', 'work_order_id');
}
