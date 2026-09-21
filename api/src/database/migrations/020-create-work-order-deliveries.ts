import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable(
    'work_order_deliveries',
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
      kilometraje_salida: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      receptor_nombre: {
        type: DataTypes.STRING(180),
        allowNull: false,
      },
      receptor_rut: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      receptor_telefono: {
        type: DataTypes.STRING(30),
        allowNull: true,
      },
      checklist: {
        type: DataTypes.JSON,
        allowNull: false,
      },
      conformidad: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      firma_recepcion: {
        type: DataTypes.STRING(180),
        allowNull: false,
      },
      observaciones: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      delivered_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      delivered_at: {
        type: DataTypes.DATE,
        allowNull: false,
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
    { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
  );

  await queryInterface.addIndex('work_order_deliveries', ['work_order_id'], {
    name: 'work_order_deliveries_work_order_id_unique',
    unique: true,
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('work_order_deliveries');
}

