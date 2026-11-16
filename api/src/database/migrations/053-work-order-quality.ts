import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

const nullableReviewer = () => ({
  type: DataTypes.INTEGER,
  allowNull: true,
  references: { model: 'users', key: 'id' },
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE',
});

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Older sync({ alter: true }) runs created codigo_2, codigo_3, etc.
  // Retain the original unique constraint while freeing slots for QA foreign keys.
  const orderIndexes = await queryInterface.showIndex('work_orders') as Array<{
    name: string; unique: boolean; fields: Array<{ attribute: string; length?: number | null }>;
  }>;
  const uniqueCodeIndexes = orderIndexes.filter((index) => index.unique && index.fields.length === 1
    && index.fields[0].attribute === 'codigo' && !index.fields[0].length);
  const originalCodeIndex = uniqueCodeIndexes.find((index) => !/^codigo_\d+$/.test(index.name));
  if (originalCodeIndex) {
    for (const index of uniqueCodeIndexes) {
      if (/^codigo_\d+$/.test(index.name)) await queryInterface.removeIndex('work_orders', index.name);
    }
  }
  const itemColumns = await queryInterface.describeTable('work_order_items');
  const orderColumns = await queryInterface.describeTable('work_orders');

  if (!itemColumns.quality_status) {
    await queryInterface.addColumn('work_order_items', 'quality_status', {
      type: DataTypes.ENUM('pendiente', 'aprobado', 'rechazado'),
      allowNull: false,
      defaultValue: 'pendiente',
    });
  }
  if (!itemColumns.quality_reviewed_by) {
    await queryInterface.addColumn('work_order_items', 'quality_reviewed_by', nullableReviewer());
  }
  if (!itemColumns.quality_reviewed_at) {
    await queryInterface.addColumn('work_order_items', 'quality_reviewed_at', {
      type: DataTypes.DATE, allowNull: true,
    });
  }
  if (!itemColumns.quality_note) {
    await queryInterface.addColumn('work_order_items', 'quality_note', {
      type: DataTypes.TEXT, allowNull: true,
    });
  }

  if (!orderColumns.quality_approved_by) {
    await queryInterface.addColumn('work_orders', 'quality_approved_by', nullableReviewer());
  }
  if (!orderColumns.quality_approved_at) {
    await queryInterface.addColumn('work_orders', 'quality_approved_at', {
      type: DataTypes.DATE, allowNull: true,
    });
  }
  if (!orderColumns.quality_approval_note) {
    await queryInterface.addColumn('work_orders', 'quality_approval_note', {
      type: DataTypes.TEXT, allowNull: true,
    });
  }

  // Legacy finalizada/entregada orders retain their state without fabricated QA.
  const tables = await queryInterface.showAllTables();
  if (!tables.includes('work_order_quality_reviews')) {
    await queryInterface.createTable('work_order_quality_reviews', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      work_order_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'work_orders', key: 'id' },
        onDelete: 'CASCADE', onUpdate: 'CASCADE',
      },
      work_order_item_id: {
        type: DataTypes.INTEGER, allowNull: true,
        references: { model: 'work_order_items', key: 'id' },
        onDelete: 'SET NULL', onUpdate: 'CASCADE',
      },
      decision: { type: DataTypes.ENUM('aprobado', 'rechazado'), allowNull: false },
      reviewed_by: nullableReviewer(),
      reviewer_name: { type: DataTypes.STRING(180), allowNull: false },
      note: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    }, { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' });
  }

  // Repair the early sidecar shape if a watcher applied it before integration.
  const reviewColumns = await queryInterface.describeTable('work_order_quality_reviews');
  if (!reviewColumns.reviewer_name) {
    if (reviewColumns.reviewed_by_name) {
      await queryInterface.renameColumn('work_order_quality_reviews', 'reviewed_by_name', 'reviewer_name');
    } else {
      await queryInterface.addColumn('work_order_quality_reviews', 'reviewer_name', {
        type: DataTypes.STRING(180), allowNull: true,
      });
    }
  }
  const repairedColumns = await queryInterface.describeTable('work_order_quality_reviews');
  if (repairedColumns.reviewer_name.allowNull || repairedColumns.reviewed_by_name) {
    const previousSnapshot = repairedColumns.reviewed_by_name ? "NULLIF(r.reviewed_by_name, ''), " : '';
    await queryInterface.sequelize.query(
      'UPDATE work_order_quality_reviews r LEFT JOIN users u ON u.id = r.reviewed_by '
      + `SET r.reviewer_name = COALESCE(NULLIF(r.reviewer_name, ''), ${previousSnapshot}u.nombre, 'Revisor no disponible') `
      + "WHERE r.reviewer_name IS NULL OR r.reviewer_name = ''",
    );
    await queryInterface.changeColumn('work_order_quality_reviews', 'reviewer_name', {
      type: DataTypes.STRING(180), allowNull: false,
    });
    if (repairedColumns.reviewed_by_name) {
      await queryInterface.removeColumn('work_order_quality_reviews', 'reviewed_by_name');
    }
  }
  if (/'(?:aprobar|rechazar|confirmar)'/.test(reviewColumns.decision.type)) {
    // Expand first: MySQL must accept the replacement values before converting rows.
    await queryInterface.changeColumn('work_order_quality_reviews', 'decision', {
      type: DataTypes.ENUM('aprobar', 'rechazar', 'confirmar', 'aprobado', 'rechazado'), allowNull: false,
    });
    await queryInterface.sequelize.query(
      "UPDATE work_order_quality_reviews SET decision = CASE decision WHEN 'rechazar' THEN 'rechazado' "
      + "WHEN 'aprobar' THEN 'aprobado' WHEN 'confirmar' THEN 'aprobado' ELSE decision END "
      + "WHERE decision IN ('aprobar', 'rechazar', 'confirmar')",
    );
    await queryInterface.changeColumn('work_order_quality_reviews', 'decision', {
      type: DataTypes.ENUM('aprobado', 'rechazado'), allowNull: false,
    });
  }

  const indexes = await queryInterface.showIndex('work_order_quality_reviews') as Array<{ name: string }>;
  for (const [name, fields] of [
    ['work_order_quality_reviews_order_created_idx', ['work_order_id', 'created_at']],
    ['work_order_quality_reviews_item_created_idx', ['work_order_item_id', 'created_at']],
  ] as const) {
    if (!indexes.some((index) => index.name === name)) {
      await queryInterface.addIndex('work_order_quality_reviews', [...fields], { name });
    }
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const tables = await queryInterface.showAllTables();
  if (tables.includes('work_order_quality_reviews')) {
    await queryInterface.dropTable('work_order_quality_reviews');
  }
  for (const [table, fields] of [
    ['work_order_items', ['quality_status', 'quality_reviewed_by', 'quality_reviewed_at', 'quality_note']],
    ['work_orders', ['quality_approved_by', 'quality_approved_at', 'quality_approval_note']],
  ] as const) {
    const columns = await queryInterface.describeTable(table);
    for (const field of fields) {
      if (columns[field]) await queryInterface.removeColumn(table, field);
    }
  }
}
