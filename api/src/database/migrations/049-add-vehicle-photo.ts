import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const vehicleColumns = await queryInterface.describeTable('vehicles');
  if (!vehicleColumns.foto_storage_key) {
    await queryInterface.addColumn('vehicles', 'foto_storage_key', {
      type: DataTypes.STRING(255),
      allowNull: true,
    });
  }

  const fleetColumns = await queryInterface.describeTable('fleet_vehicles');
  if (!fleetColumns.foto_storage_key) {
    await queryInterface.addColumn('fleet_vehicles', 'foto_storage_key', {
      type: DataTypes.STRING(255),
      allowNull: true,
    });
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const vehicleColumns = await queryInterface.describeTable('vehicles');
  if (vehicleColumns.foto_storage_key) {
    await queryInterface.removeColumn('vehicles', 'foto_storage_key');
  }

  const fleetColumns = await queryInterface.describeTable('fleet_vehicles');
  if (fleetColumns.foto_storage_key) {
    await queryInterface.removeColumn('fleet_vehicles', 'foto_storage_key');
  }
}
