import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

const statuses = ['en_progreso', 'esperando_repuesto', 'finalizada', 'entregada', 'cancelada'];

export async function up(queryInterface: QueryInterface): Promise<void> {
  const tables = await queryInterface.showAllTables();
  if (!tables.includes('work_orders')) return;

  const columns = await queryInterface.describeTable('work_orders');
  if (!columns.estado.type.includes("'borrador'")) return;

  // Convert legacy rows before narrowing the ENUM, including soft-deleted orders.
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.sequelize.query(
      "UPDATE work_orders SET estado = 'en_progreso' WHERE estado = 'borrador'",
      { transaction },
    );
  });
  await queryInterface.changeColumn('work_orders', 'estado', {
    type: DataTypes.ENUM(...statuses),
    allowNull: false,
    defaultValue: 'en_progreso',
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.changeColumn('work_orders', 'estado', {
    type: DataTypes.ENUM('borrador', ...statuses),
    allowNull: false,
    defaultValue: 'borrador',
  });
}
