import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

const columnExists = async (
  queryInterface: QueryInterface,
  tableName: string,
  columnName: string,
): Promise<boolean> => {
  const definition = (await queryInterface.describeTable(tableName)) as Record<string, unknown>;
  return columnName in definition;
};

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.changeColumn('work_order_requests', 'estado', {
    type: DataTypes.ENUM('pendiente', 'aprobada', 'entregada', 'rechazada', 'cancelada'),
    allowNull: false,
    defaultValue: 'pendiente',
  });

  if (!(await columnExists(queryInterface, 'work_order_requests', 'delivered_warehouse_id'))) {
    await queryInterface.addColumn('work_order_requests', 'delivered_warehouse_id', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'warehouses', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });
  }
  if (!(await columnExists(queryInterface, 'work_order_requests', 'delivered_by'))) {
    await queryInterface.addColumn('work_order_requests', 'delivered_by', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });
  }
  if (!(await columnExists(queryInterface, 'work_order_requests', 'delivered_at'))) {
    await queryInterface.addColumn('work_order_requests', 'delivered_at', {
      type: DataTypes.DATE,
      allowNull: true,
    });
  }
  if (!(await columnExists(queryInterface, 'work_order_requests', 'delivery_note'))) {
    await queryInterface.addColumn('work_order_requests', 'delivery_note', {
      type: DataTypes.TEXT,
      allowNull: true,
    });
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  for (const column of ['delivery_note', 'delivered_at', 'delivered_by', 'delivered_warehouse_id']) {
    if (await columnExists(queryInterface, 'work_order_requests', column)) {
      await queryInterface.removeColumn('work_order_requests', column);
    }
  }

  await queryInterface.changeColumn('work_order_requests', 'estado', {
    type: DataTypes.ENUM('pendiente', 'aprobada', 'rechazada', 'cancelada'),
    allowNull: false,
    defaultValue: 'pendiente',
  });
}
