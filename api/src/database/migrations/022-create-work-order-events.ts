import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable(
    'work_order_events',
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
      actor_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      tipo: {
        type: DataTypes.ENUM(
          'creacion',
          'actualizacion',
          'cambio_estado',
          'entrega',
          'garantia_creada',
          'reingreso_creado',
          'eliminacion',
        ),
        allowNull: false,
      },
      descripcion: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
  );

  const indexes = (await queryInterface.showIndex('work_order_events')) as Array<{ name: string }>;
  if (!indexes.some((index) => index.name === 'work_order_events_work_order_created_idx')) {
    await queryInterface.addIndex('work_order_events', ['work_order_id', 'created_at'], {
      name: 'work_order_events_work_order_created_idx',
    });
  }
  if (!indexes.some((index) => index.name === 'work_order_events_actor_user_idx')) {
    await queryInterface.addIndex('work_order_events', ['actor_user_id'], {
      name: 'work_order_events_actor_user_idx',
    });
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('work_order_events');
}
