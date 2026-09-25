import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const columns = await queryInterface.describeTable('payments');

  if (!columns.banco_origen) {
    await queryInterface.addColumn('payments', 'banco_origen', {
      type: DataTypes.STRING(80),
      allowNull: true,
    });
  }
  if (!columns.numero_transaccion) {
    await queryInterface.addColumn('payments', 'numero_transaccion', {
      type: DataTypes.STRING(80),
      allowNull: true,
    });
  }
  if (!columns.comprobante_pago) {
    await queryInterface.addColumn('payments', 'comprobante_pago', {
      type: DataTypes.STRING(255),
      allowNull: true,
    });
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const columns = await queryInterface.describeTable('payments');

  if (columns.comprobante_pago) {
    await queryInterface.removeColumn('payments', 'comprobante_pago');
  }
  if (columns.numero_transaccion) {
    await queryInterface.removeColumn('payments', 'numero_transaccion');
  }
  if (columns.banco_origen) {
    await queryInterface.removeColumn('payments', 'banco_origen');
  }
}
