import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.addColumn(
      'work_orders',
      'tipo_ingreso',
      {
        type: DataTypes.ENUM('normal', 'garantia', 'reingreso'),
        allowNull: false,
        defaultValue: 'normal',
      },
      { transaction },
    );
    await queryInterface.addColumn(
      'work_orders',
      'source_work_order_id',
      {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'work_orders', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      { transaction },
    );
    await queryInterface.addColumn(
      'work_orders',
      'cobertura_garantia',
      {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      { transaction },
    );
    await queryInterface.addIndex('work_orders', ['source_work_order_id'], {
      name: 'work_orders_source_work_order_id_idx',
      transaction,
    });
    await queryInterface.addIndex('work_orders', ['tipo_ingreso'], {
      name: 'work_orders_tipo_ingreso_idx',
      transaction,
    });
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.removeIndex('work_orders', 'work_orders_tipo_ingreso_idx', {
      transaction,
    });
    await queryInterface.removeIndex('work_orders', 'work_orders_source_work_order_id_idx', {
      transaction,
    });
    await queryInterface.removeColumn('work_orders', 'cobertura_garantia', { transaction });
    await queryInterface.removeColumn('work_orders', 'source_work_order_id', { transaction });
    await queryInterface.removeColumn('work_orders', 'tipo_ingreso', { transaction });
  });
}
