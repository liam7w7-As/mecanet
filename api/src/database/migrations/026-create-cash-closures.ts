import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

const tableExists = async (queryInterface: QueryInterface, tableName: string): Promise<boolean> => {
  try {
    await queryInterface.describeTable(tableName);
    return true;
  } catch {
    return false;
  }
};

export async function up(queryInterface: QueryInterface): Promise<void> {
  if (await tableExists(queryInterface, 'daily_cash_closures')) return;

  await queryInterface.createTable(
    'daily_cash_closures',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      fecha: { type: DataTypes.DATEONLY, allowNull: false, unique: true },
      totales_por_metodo: { type: DataTypes.JSON, allowNull: false },
      total_confirmado: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      efectivo_esperado: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      efectivo_declarado: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      diferencia_efectivo: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      observaciones: { type: DataTypes.TEXT, allowNull: true },
      closed_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      closed_at: { type: DataTypes.DATE, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
  );

  await queryInterface.addIndex('daily_cash_closures', ['fecha'], {
    name: 'daily_cash_closures_fecha_unique_idx',
    unique: true,
  });
  await queryInterface.addIndex('daily_cash_closures', ['closed_by'], {
    name: 'daily_cash_closures_closed_by_idx',
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('daily_cash_closures');
}
