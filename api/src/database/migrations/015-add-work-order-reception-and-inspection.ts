import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const referenceColumn = {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'clients', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    };

    await queryInterface.addColumn('work_orders', 'contact_client_id', referenceColumn, {
      transaction,
    });
    await queryInterface.addColumn('work_orders', 'billing_client_id', referenceColumn, {
      transaction,
    });

    const snapshotColumns = [
      ['contact_name', DataTypes.STRING(180)],
      ['contact_rut', DataTypes.STRING(20)],
      ['contact_phone', DataTypes.STRING(30)],
      ['contact_email', DataTypes.STRING(180)],
      ['billing_name', DataTypes.STRING(180)],
      ['billing_rut', DataTypes.STRING(20)],
      ['billing_type', DataTypes.STRING(20)],
      ['billing_phone', DataTypes.STRING(30)],
      ['billing_email', DataTypes.STRING(180)],
      ['billing_address', DataTypes.STRING(255)],
      ['billing_region', DataTypes.STRING(100)],
      ['billing_comuna', DataTypes.STRING(100)],
    ] as const;

    for (const [name, type] of snapshotColumns) {
      await queryInterface.addColumn(
        'work_orders',
        name,
        { type, allowNull: true },
        { transaction },
      );
    }

    await queryInterface.addIndex('work_orders', ['contact_client_id'], {
      name: 'work_orders_contact_client_id_idx',
      transaction,
    });
    await queryInterface.addIndex('work_orders', ['billing_client_id'], {
      name: 'work_orders_billing_client_id_idx',
      transaction,
    });

    await queryInterface.createTable(
      'work_order_inspections',
      {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        work_order_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'work_orders', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        },
        nivel_combustible: {
          type: DataTypes.ENUM('vacio', 'cuarto', 'medio', 'tres_cuartos', 'lleno'),
          allowNull: true,
        },
        llanta_delantera_izquierda: {
          type: DataTypes.ENUM(
            'no_revisado',
            'bueno',
            'regular',
            'desgaste_severo',
            'baja_presion',
          ),
          allowNull: true,
        },
        llanta_delantera_derecha: {
          type: DataTypes.ENUM(
            'no_revisado',
            'bueno',
            'regular',
            'desgaste_severo',
            'baja_presion',
          ),
          allowNull: true,
        },
        llanta_trasera_izquierda: {
          type: DataTypes.ENUM(
            'no_revisado',
            'bueno',
            'regular',
            'desgaste_severo',
            'baja_presion',
          ),
          allowNull: true,
        },
        llanta_trasera_derecha: {
          type: DataTypes.ENUM(
            'no_revisado',
            'bueno',
            'regular',
            'desgaste_severo',
            'baja_presion',
          ),
          allowNull: true,
        },
        inventario: {
          type: DataTypes.JSON,
          allowNull: false,
        },
        objetos_valor: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        observaciones: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        inspected_by: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
        },
        created_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        updated_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
      },
      {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        transaction,
      },
    );

    await queryInterface.addIndex('work_order_inspections', ['work_order_id'], {
      name: 'work_order_inspections_work_order_id_unique',
      unique: true,
      transaction,
    });
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.dropTable('work_order_inspections', { transaction });
    await queryInterface.removeIndex('work_orders', 'work_orders_billing_client_id_idx', {
      transaction,
    });
    await queryInterface.removeIndex('work_orders', 'work_orders_contact_client_id_idx', {
      transaction,
    });

    const columns = [
      'billing_comuna',
      'billing_region',
      'billing_address',
      'billing_email',
      'billing_phone',
      'billing_type',
      'billing_rut',
      'billing_name',
      'contact_email',
      'contact_phone',
      'contact_rut',
      'contact_name',
      'billing_client_id',
      'contact_client_id',
    ];

    for (const column of columns) {
      await queryInterface.removeColumn('work_orders', column, { transaction });
    }
  });
}
