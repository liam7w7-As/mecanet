import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

const indexExists = async (
  queryInterface: QueryInterface,
  tableName: string,
  indexName: string,
): Promise<boolean> => {
  const indexes = (await queryInterface.showIndex(tableName)) as unknown as Array<{ name: string }>;
  return indexes.some((index) => index.name === indexName);
};

export async function up(queryInterface: QueryInterface): Promise<void> {
  const columns = await queryInterface.describeTable('payments');

  if (!columns.estado) {
    await queryInterface.addColumn('payments', 'estado', {
      type: DataTypes.ENUM('confirmado', 'por_verificar', 'rechazado'),
      allowNull: false,
      defaultValue: 'confirmado',
    });
  }
  if (!columns.referencia) {
    await queryInterface.addColumn('payments', 'referencia', {
      type: DataTypes.STRING(120),
      allowNull: true,
    });
  }
  if (!columns.reviewed_by) {
    await queryInterface.addColumn('payments', 'reviewed_by', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });
  }
  if (!columns.reviewed_at) {
    await queryInterface.addColumn('payments', 'reviewed_at', {
      type: DataTypes.DATE,
      allowNull: true,
    });
  }
  if (!columns.review_note) {
    await queryInterface.addColumn('payments', 'review_note', {
      type: DataTypes.TEXT,
      allowNull: true,
    });
  }

  if (!(await indexExists(queryInterface, 'payments', 'payments_estado_fecha_idx'))) {
    await queryInterface.addIndex('payments', ['estado', 'fecha'], {
      name: 'payments_estado_fecha_idx',
    });
  }
  if (!(await indexExists(queryInterface, 'payments', 'payments_reviewed_by_idx'))) {
    await queryInterface.addIndex('payments', ['reviewed_by'], {
      name: 'payments_reviewed_by_idx',
    });
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeIndex('payments', 'payments_reviewed_by_idx');
  await queryInterface.removeIndex('payments', 'payments_estado_fecha_idx');
  await queryInterface.removeColumn('payments', 'review_note');
  await queryInterface.removeColumn('payments', 'reviewed_at');
  await queryInterface.removeColumn('payments', 'reviewed_by');
  await queryInterface.removeColumn('payments', 'referencia');
  await queryInterface.removeColumn('payments', 'estado');
}
