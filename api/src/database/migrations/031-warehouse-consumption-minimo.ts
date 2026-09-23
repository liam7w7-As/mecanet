import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

const columnExists = async (
  queryInterface: QueryInterface,
  tableName: string,
  columnName: string,
): Promise<boolean> => {
  try {
    const definition = (await queryInterface.describeTable(tableName)) as Record<string, unknown>;
    return columnName in definition;
  } catch {
    return false;
  }
};

export async function up(queryInterface: QueryInterface): Promise<void> {
  if (!(await columnExists(queryInterface, 'catalog_items', 'stock_minimo'))) {
    await queryInterface.addColumn('catalog_items', 'stock_minimo', {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  }

  if (!(await columnExists(queryInterface, 'work_order_items', 'stock_consumido_warehouse_id'))) {
    await queryInterface.addColumn('work_order_items', 'stock_consumido_warehouse_id', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'warehouses', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  if (await columnExists(queryInterface, 'work_order_items', 'stock_consumido_warehouse_id')) {
    await queryInterface.removeColumn('work_order_items', 'stock_consumido_warehouse_id');
  }
  if (await columnExists(queryInterface, 'catalog_items', 'stock_minimo')) {
    await queryInterface.removeColumn('catalog_items', 'stock_minimo');
  }
}
