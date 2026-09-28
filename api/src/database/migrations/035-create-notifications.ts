import { DataTypes } from 'sequelize';

import type { QueryInterface, Transaction } from 'sequelize';

const tableExists = async (queryInterface: QueryInterface, tableName: string): Promise<boolean> => {
  try {
    await queryInterface.describeTable(tableName);
    return true;
  } catch {
    return false;
  }
};

const indexExists = async (
  queryInterface: QueryInterface,
  tableName: string,
  indexName: string,
): Promise<boolean> => {
  const indexes = (await queryInterface.showIndex(tableName)) as unknown as Array<{ name: string }>;
  return indexes.some((index) => index.name === indexName);
};

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction: Transaction) => {
    if (!(await tableExists(queryInterface, 'notifications'))) {
      await queryInterface.createTable(
        'notifications',
        {
          id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
          user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'users', key: 'id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
          },
          tipo: {
            type: DataTypes.ENUM(
              'solicitud_creada',
              'solicitud_aprobada',
              'solicitud_rechazada',
              'repuesto_por_entregar',
              'pago_por_verificar',
              'pago_verificado',
              'pago_rechazado',
              'ot_estado_cambiado',
              'ot_entregada',
              'mecanico_asignado',
              'reingreso_creado',
              'fecha_entrega_vencida',
              'cotizacion_creada',
              'cotizacion_convertida',
            ),
            allowNull: false,
          },
          nivel: {
            type: DataTypes.ENUM('info', 'warning', 'critical'),
            allowNull: false,
            defaultValue: 'info',
          },
          titulo: { type: DataTypes.STRING(160), allowNull: false },
          mensaje: { type: DataTypes.TEXT, allowNull: false },
          href: { type: DataTypes.STRING(200), allowNull: false },
          work_order_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'work_orders', key: 'id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
          },
          quotation_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'quotations', key: 'id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
          },
          payment_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'payments', key: 'id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
          },
          actor_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'users', key: 'id' },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE',
          },
          dedupe_key: { type: DataTypes.STRING(120), allowNull: true },
          leida_at: { type: DataTypes.DATE, allowNull: true },
          created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
          updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        },
        { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci', transaction },
      );
    }

    if (
      !(await indexExists(queryInterface, 'notifications', 'notifications_user_unread_created_idx'))
    ) {
      await queryInterface.addIndex(
        'notifications',
        ['user_id', 'leida_at', 'created_at'],
        { name: 'notifications_user_unread_created_idx', transaction },
      );
    }

    if (!(await indexExists(queryInterface, 'notifications', 'notifications_user_created_idx'))) {
      await queryInterface.addIndex(
        'notifications',
        ['user_id', 'created_at'],
        { name: 'notifications_user_created_idx', transaction },
      );
    }

    if (!(await indexExists(queryInterface, 'notifications', 'notifications_dedupe_key_idx'))) {
      await queryInterface.addIndex('notifications', ['dedupe_key'], {
        name: 'notifications_dedupe_key_idx',
        unique: true,
        transaction,
      });
    }
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  if (!(await tableExists(queryInterface, 'notifications'))) {
    return;
  }

  await queryInterface.sequelize.transaction(async (transaction: Transaction) => {
    for (const indexName of [
      'notifications_dedupe_key_idx',
      'notifications_user_created_idx',
      'notifications_user_unread_created_idx',
    ]) {
      if (await indexExists(queryInterface, 'notifications', indexName)) {
        await queryInterface.removeIndex('notifications', indexName, { transaction });
      }
    }
    await queryInterface.dropTable('notifications', { transaction });
  });
}
