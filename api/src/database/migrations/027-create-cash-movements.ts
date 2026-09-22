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
  if (!(await tableExists(queryInterface, 'cash_movements'))) {
    await queryInterface.createTable(
      'cash_movements',
      {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        tipo: { type: DataTypes.ENUM('ingreso', 'egreso'), allowNull: false },
        categoria: {
          type: DataTypes.ENUM(
            'apertura_caja',
            'gasto_operativo',
            'compra_repuesto',
            'pago_proveedor',
            'devolucion',
            'retiro',
            'ajuste',
            'otro',
          ),
          allowNull: false,
        },
        monto: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
        metodo: {
          type: DataTypes.ENUM(
            'efectivo',
            'transferencia',
            'tarjeta_debito',
            'tarjeta_credito',
            'cheque',
            'otro',
          ),
          allowNull: false,
        },
        descripcion: { type: DataTypes.STRING(255), allowNull: false },
        referencia: { type: DataTypes.STRING(120), allowNull: true },
        fecha: { type: DataTypes.DATE, allowNull: false },
        created_by: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
        },
        voided_at: { type: DataTypes.DATE, allowNull: true },
        voided_by: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
        },
        void_reason: { type: DataTypes.STRING(500), allowNull: true },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );

    await queryInterface.addIndex('cash_movements', ['fecha', 'voided_at'], {
      name: 'cash_movements_fecha_voided_idx',
    });
    await queryInterface.addIndex('cash_movements', ['tipo', 'metodo'], {
      name: 'cash_movements_tipo_metodo_idx',
    });
    await queryInterface.addIndex('cash_movements', ['created_by'], {
      name: 'cash_movements_created_by_idx',
    });
  }

  const closureColumns = await queryInterface.describeTable('daily_cash_closures');
  if (!closureColumns.total_ingresos_manuales) {
    await queryInterface.addColumn('daily_cash_closures', 'total_ingresos_manuales', {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    });
  }
  if (!closureColumns.total_egresos) {
    await queryInterface.addColumn('daily_cash_closures', 'total_egresos', {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    });
  }
  if (!closureColumns.total_neto) {
    await queryInterface.addColumn('daily_cash_closures', 'total_neto', {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    });
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const closureColumns = await queryInterface.describeTable('daily_cash_closures');
  if (closureColumns.total_neto) await queryInterface.removeColumn('daily_cash_closures', 'total_neto');
  if (closureColumns.total_egresos) await queryInterface.removeColumn('daily_cash_closures', 'total_egresos');
  if (closureColumns.total_ingresos_manuales) {
    await queryInterface.removeColumn('daily_cash_closures', 'total_ingresos_manuales');
  }
  await queryInterface.dropTable('cash_movements');
}
