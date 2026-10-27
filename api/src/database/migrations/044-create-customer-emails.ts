import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

export const up = async (queryInterface: QueryInterface): Promise<void> => {
  const tables = await queryInterface.showAllTables();
  if (tables.includes('customer_emails')) return;
  await queryInterface.createTable(
    'customer_emails',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      dedupe_key: { type: DataTypes.STRING(160), allowNull: false, unique: true },
      kind: { type: DataTypes.STRING(20), allowNull: false },
      entity_id: { type: DataTypes.INTEGER, allowNull: false },
      category: { type: DataTypes.STRING(20), allowNull: false },
      recipient: { type: DataTypes.STRING(180), allowNull: true },
      recipient_name: { type: DataTypes.STRING(180), allowNull: false },
      subject: { type: DataTypes.STRING(200), allowNull: false },
      payload: { type: DataTypes.JSON, allowNull: false },
      status: { type: DataTypes.STRING(24), allowNull: false },
      attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      next_attempt_at: { type: DataTypes.DATE, allowNull: false },
      locked_at: { type: DataTypes.DATE, allowNull: true },
      lock_token: { type: DataTypes.STRING(36), allowNull: true },
      accepted_at: { type: DataTypes.DATE, allowNull: true },
      last_error: { type: DataTypes.STRING(80), allowNull: true },
      requested_by: { type: DataTypes.INTEGER, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
  );
  await queryInterface.addIndex('customer_emails', ['status', 'next_attempt_at'], {
    name: 'customer_emails_queue_idx',
  });
  await queryInterface.addIndex('customer_emails', ['kind', 'entity_id', 'created_at'], {
    name: 'customer_emails_document_idx',
  });
};

export const down = async (queryInterface: QueryInterface): Promise<void> => {
  await queryInterface.dropTable('customer_emails');
};
