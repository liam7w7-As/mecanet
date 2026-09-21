import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.addColumn(
      'work_order_items',
      'stock_consumido',
      {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      { transaction },
    );
    await queryInterface.addColumn(
      'work_order_items',
      'stock_consumido_cantidad',
      {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      { transaction },
    );
    await queryInterface.addColumn(
      'work_order_items',
      'stock_consumido_at',
      {
        type: DataTypes.DATE,
        allowNull: true,
      },
      { transaction },
    );
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.removeColumn('work_order_items', 'stock_consumido_at', {
      transaction,
    });
    await queryInterface.removeColumn('work_order_items', 'stock_consumido_cantidad', {
      transaction,
    });
    await queryInterface.removeColumn('work_order_items', 'stock_consumido', {
      transaction,
    });
  });
}
