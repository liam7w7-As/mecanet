import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

export const up = async (queryInterface: QueryInterface): Promise<void> => {
  const columns = await queryInterface.describeTable('quotation_items');
  if (!columns.work_order_item_id) {
    await queryInterface.addColumn('quotation_items', 'work_order_item_id', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'work_order_items', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });
  }
};

export const down = async (queryInterface: QueryInterface): Promise<void> => {
  const columns = await queryInterface.describeTable('quotation_items');
  if (columns.work_order_item_id) {
    await queryInterface.removeColumn('quotation_items', 'work_order_item_id');
  }
};
