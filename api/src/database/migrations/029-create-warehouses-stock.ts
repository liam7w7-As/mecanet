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
  if (!(await tableExists(queryInterface, 'warehouses'))) {
    await queryInterface.createTable(
      'warehouses',
      {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        codigo: { type: DataTypes.STRING(20), allowNull: false, unique: true },
        nombre: { type: DataTypes.STRING(120), allowNull: false },
        direccion: { type: DataTypes.STRING(255), allowNull: true },
        activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
  }

  if (!(await tableExists(queryInterface, 'stock_balances'))) {
    await queryInterface.createTable(
      'stock_balances',
      {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        warehouse_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'warehouses', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        },
        catalog_item_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'catalog_items', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        },
        cantidad: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
    await queryInterface.addIndex('stock_balances', ['warehouse_id', 'catalog_item_id'], {
      name: 'stock_balances_warehouse_item_unique',
      unique: true,
    });
  }

  if (!(await tableExists(queryInterface, 'stock_movements'))) {
    await queryInterface.createTable(
      'stock_movements',
      {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        catalog_item_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'catalog_items', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE',
        },
        warehouse_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'warehouses', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE',
        },
        tipo: {
          type: DataTypes.ENUM(
            'ingreso',
            'salida',
            'ajuste',
            'traslado_salida',
            'traslado_ingreso',
            'consumo_ot',
          ),
          allowNull: false,
        },
        cantidad: { type: DataTypes.INTEGER, allowNull: false },
        saldo_resultante: { type: DataTypes.INTEGER, allowNull: false },
        motivo: { type: DataTypes.STRING(255), allowNull: false },
        referencia: { type: DataTypes.STRING(120), allowNull: true },
        created_by: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
        },
        fecha: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
    await queryInterface.addIndex('stock_movements', ['warehouse_id', 'catalog_item_id'], {
      name: 'stock_movements_warehouse_item_idx',
    });
    await queryInterface.addIndex('stock_movements', ['fecha'], {
      name: 'stock_movements_fecha_idx',
    });
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  if (await tableExists(queryInterface, 'stock_movements')) {
    await queryInterface.dropTable('stock_movements');
  }
  if (await tableExists(queryInterface, 'stock_balances')) {
    await queryInterface.dropTable('stock_balances');
  }
  if (await tableExists(queryInterface, 'warehouses')) {
    await queryInterface.dropTable('warehouses');
  }
}
