import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const columns = await queryInterface.describeTable('work_orders');

    if (!columns.vehicle_owner_client_id) {
      await queryInterface.addColumn(
        'work_orders',
        'vehicle_owner_client_id',
        { type: DataTypes.INTEGER, allowNull: true },
        { transaction },
      );
    }
    if (!columns.vehicle_owner_name) {
      await queryInterface.addColumn(
        'work_orders',
        'vehicle_owner_name',
        { type: DataTypes.STRING(180), allowNull: true },
        { transaction },
      );
    }
    if (!columns.vehicle_owner_rut) {
      await queryInterface.addColumn(
        'work_orders',
        'vehicle_owner_rut',
        { type: DataTypes.STRING(20), allowNull: true },
        { transaction },
      );
    }
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const columns = await queryInterface.describeTable('work_orders');

    if (columns.vehicle_owner_rut) {
      await queryInterface.removeColumn('work_orders', 'vehicle_owner_rut', { transaction });
    }
    if (columns.vehicle_owner_name) {
      await queryInterface.removeColumn('work_orders', 'vehicle_owner_name', { transaction });
    }
    if (columns.vehicle_owner_client_id) {
      await queryInterface.removeColumn('work_orders', 'vehicle_owner_client_id', { transaction });
    }
  });
}
