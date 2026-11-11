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
    if (!(await tableExists(queryInterface, 'sales_access_grants'))) {
      await queryInterface.createTable(
        'sales_access_grants',
        {
          id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
          user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'users', key: 'id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
          },
          scope_type: {
            type: DataTypes.ENUM('work_order', 'quotation'),
            allowNull: false,
          },
          target_id: { type: DataTypes.INTEGER, allowNull: false },
          granted_by: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'users', key: 'id' },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE',
          },
          expires_at: { type: DataTypes.DATE, allowNull: true },
          created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
          updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        },
        { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci', transaction },
      );
    }

    if (!(await indexExists(queryInterface, 'sales_access_grants', 'sales_access_grants_unique'))) {
      await queryInterface.addIndex(
        'sales_access_grants',
        ['user_id', 'scope_type', 'target_id'],
        { name: 'sales_access_grants_unique', unique: true, transaction },
      );
    }

    if (
      !(await indexExists(queryInterface, 'sales_access_grants', 'sales_access_grants_user_expiry'))
    ) {
      await queryInterface.addIndex('sales_access_grants', ['user_id', 'expires_at'], {
        name: 'sales_access_grants_user_expiry',
        transaction,
      });
    }
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  if (!(await tableExists(queryInterface, 'sales_access_grants'))) return;

  await queryInterface.sequelize.transaction(async (transaction: Transaction) => {
    for (const indexName of ['sales_access_grants_user_expiry', 'sales_access_grants_unique']) {
      if (await indexExists(queryInterface, 'sales_access_grants', indexName)) {
        await queryInterface.removeIndex('sales_access_grants', indexName, { transaction });
      }
    }
    await queryInterface.dropTable('sales_access_grants', { transaction });
  });
}
