import { createDefaultDpConfiguration } from '@unithor/shared';
import { DataTypes, QueryTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

/** Additive and safe to retry: never replace the workshop's saved configuration. */
export async function up(qi: QueryInterface): Promise<void> {
  const tables = new Set((await qi.showAllTables()).map(String));
  const userReference = { model: 'users', key: 'id' };
  if (!tables.has('dp_configurations')) {
    await qi.createTable(
      'dp_configurations',
      {
        id: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
        revision: { type: DataTypes.INTEGER, allowNull: false },
        configuration: { type: DataTypes.JSON, allowNull: false },
        updated_by: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: userReference,
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
        },
        created_at: { type: DataTypes.DATE, allowNull: false },
        updated_at: { type: DataTypes.DATE, allowNull: false },
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
  }
  if (!tables.has('dp_configuration_revisions')) {
    await qi.createTable(
      'dp_configuration_revisions',
      {
        revision: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
        configuration: { type: DataTypes.JSON, allowNull: false },
        created_by: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: userReference,
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
        },
        created_at: { type: DataTypes.DATE, allowNull: false },
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
  }
  const configuration = JSON.stringify(createDefaultDpConfiguration());
  await qi.sequelize.query(
    'INSERT IGNORE INTO dp_configurations (id, revision, configuration, created_at, updated_at) VALUES (1, 1, :configuration, NOW(), NOW())',
    { replacements: { configuration }, type: QueryTypes.INSERT },
  );
  // Recover an interrupted initial migration from the ACTUAL saved revision, not new defaults.
  await qi.sequelize.query(
    'INSERT IGNORE INTO dp_configuration_revisions (revision, configuration, created_by, created_at) SELECT revision, configuration, updated_by, updated_at FROM dp_configurations WHERE id = 1',
    { type: QueryTypes.INSERT },
  );
}

export async function down(qi: QueryInterface): Promise<void> {
  await qi.dropTable('dp_configuration_revisions');
  await qi.dropTable('dp_configurations');
}
