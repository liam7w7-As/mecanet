import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

const statuses = ['disponible', 'en_mantencion', 'fuera_de_servicio', 'dado_de_baja'];
const additions = {
  propietario: { type: DataTypes.STRING(180), allowNull: true },
  fecha_baja: { type: DataTypes.DATE, allowNull: true },
  motivo_baja: { type: DataTypes.STRING(500), allowNull: true },
};

export async function up(queryInterface: QueryInterface): Promise<void> {
  const existing = await queryInterface.describeTable('fleet_vehicles');
  for (const [column, definition] of Object.entries(additions)) {
    if (!existing[column]) await queryInterface.addColumn('fleet_vehicles', column, definition);
  }
  if (!existing.estado_operativo.type.includes('dado_de_baja')) {
    await queryInterface.changeColumn('fleet_vehicles', 'estado_operativo', {
      type: DataTypes.ENUM(...statuses), allowNull: false, defaultValue: 'disponible',
    });
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // The previous enum has no retirement state. Preserve the vehicle as out of service.
  await queryInterface.bulkUpdate('fleet_vehicles', { estado_operativo: 'fuera_de_servicio' }, { estado_operativo: 'dado_de_baja' });
  await queryInterface.changeColumn('fleet_vehicles', 'estado_operativo', {
    type: DataTypes.ENUM(...statuses.slice(0, 3)), allowNull: false, defaultValue: 'disponible',
  });
  const existing = await queryInterface.describeTable('fleet_vehicles');
  for (const column of Object.keys(additions)) {
    if (existing[column]) await queryInterface.removeColumn('fleet_vehicles', column);
  }
}
