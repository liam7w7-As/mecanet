import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

// Startup may run this migration again. Repair only invalid/legacy combinations;
// valid DP, ACC/a_pedido and MEC classifications must never be reinterpreted.
const backfillClassification = async (
  queryInterface: QueryInterface,
  table: 'catalog_items' | 'quotation_items' | 'work_order_items',
  typeColumn: 'tipo' | 'tipo_linea',
): Promise<void> => {
  const type = `\`${typeColumn}\``;
  await queryInterface.sequelize.query(`
    UPDATE \`${table}\` SET
      \`division\` = CASE
        WHEN ${type} = 'parte' THEN 'ACC'
        WHEN ${type} = 'especifico' THEN 'MEC'
        WHEN \`division\` = 'DP' OR \`subtipo\` = 'servicio_dp' THEN 'DP'
        ELSE 'MEC' END,
      \`subtipo\` = CASE
        WHEN ${type} = 'parte' THEN CASE WHEN \`subtipo\` = 'a_pedido' THEN 'a_pedido' ELSE 'en_stock' END
        WHEN ${type} = 'especifico' THEN 'especifico'
        WHEN \`division\` = 'DP' OR \`subtipo\` = 'servicio_dp' THEN 'servicio_dp'
        ELSE 'estandar' END
    WHERE COALESCE(
      (${type} = 'parte' AND \`division\` = 'ACC' AND \`subtipo\` IN ('en_stock', 'a_pedido')) OR
      (${type} = 'estandar' AND \`division\` = 'DP' AND \`subtipo\` = 'servicio_dp') OR
      (${type} = 'estandar' AND \`division\` = 'MEC' AND \`subtipo\` = 'estandar') OR
      (${type} = 'especifico' AND \`division\` = 'MEC' AND \`subtipo\` = 'especifico'), 0
    ) = 0
  `);
};

const tableExists = async (queryInterface: QueryInterface, table: string): Promise<boolean> => {
  try {
    await queryInterface.describeTable(table);
    return true;
  } catch {
    return false;
  }
};

const columnExists = async (
  queryInterface: QueryInterface,
  table: string,
  column: string,
): Promise<boolean> => {
  try {
    const columns = await queryInterface.describeTable(table);
    return Boolean(columns[column]);
  } catch {
    return false;
  }
};

const hasIndex = async (
  queryInterface: QueryInterface,
  table: string,
  indexName: string,
): Promise<boolean> => {
  try {
    const indexes = (await queryInterface.showIndex(table)) as unknown as Array<{ name: string }>;
    return indexes.some((index) => index.name === indexName);
  } catch {
    return false;
  }
};

export async function up(queryInterface: QueryInterface): Promise<void> {
  // 1. Columnas de división y subtipo en catalog_items
  if (!(await columnExists(queryInterface, 'catalog_items', 'division'))) {
    await queryInterface.addColumn('catalog_items', 'division', {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'MEC',
    });
  }
  if (!(await columnExists(queryInterface, 'catalog_items', 'subtipo'))) {
    await queryInterface.addColumn('catalog_items', 'subtipo', {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'estandar',
    });
  }
  if (!(await hasIndex(queryInterface, 'catalog_items', 'catalog_items_division_subtipo_idx'))) {
    await queryInterface.addIndex('catalog_items', ['division', 'subtipo'], {
      name: 'catalog_items_division_subtipo_idx',
    });
  }

  // Backfill catalog_items existente
  await backfillClassification(queryInterface, 'catalog_items', 'tipo');

  // 2. Columnas en quotation_items
  if (!(await columnExists(queryInterface, 'quotation_items', 'division'))) {
    await queryInterface.addColumn('quotation_items', 'division', {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'MEC',
    });
  }
  if (!(await columnExists(queryInterface, 'quotation_items', 'subtipo'))) {
    await queryInterface.addColumn('quotation_items', 'subtipo', {
      type: DataTypes.STRING(30),
      allowNull: true,
      defaultValue: 'estandar',
    });
  }
  await backfillClassification(queryInterface, 'quotation_items', 'tipo_linea');

  // 3. Columnas en work_order_items (División, subtipo, trazabilidad ACC y CCF D&P)
  if (!(await columnExists(queryInterface, 'work_order_items', 'division'))) {
    await queryInterface.addColumn('work_order_items', 'division', {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'MEC',
    });
  }
  if (!(await columnExists(queryInterface, 'work_order_items', 'subtipo'))) {
    await queryInterface.addColumn('work_order_items', 'subtipo', {
      type: DataTypes.STRING(30),
      allowNull: true,
      defaultValue: 'estandar',
    });
  }

  // Columnas ACC
  if (!(await columnExists(queryInterface, 'work_order_items', 'bodeguero_user_id'))) {
    await queryInterface.addColumn('work_order_items', 'bodeguero_user_id', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });
  }
  if (!(await columnExists(queryInterface, 'work_order_items', 'entregado_bodega'))) {
    await queryInterface.addColumn('work_order_items', 'entregado_bodega', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  }
  if (!(await columnExists(queryInterface, 'work_order_items', 'entregado_bodega_at'))) {
    await queryInterface.addColumn('work_order_items', 'entregado_bodega_at', {
      type: DataTypes.DATE,
      allowNull: true,
    });
  }
  if (!(await columnExists(queryInterface, 'work_order_items', 'armador_user_id'))) {
    await queryInterface.addColumn('work_order_items', 'armador_user_id', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });
  }
  if (!(await columnExists(queryInterface, 'work_order_items', 'recibido_taller'))) {
    await queryInterface.addColumn('work_order_items', 'recibido_taller', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  }
  if (!(await columnExists(queryInterface, 'work_order_items', 'recibido_taller_at'))) {
    await queryInterface.addColumn('work_order_items', 'recibido_taller_at', {
      type: DataTypes.DATE,
      allowNull: true,
    });
  }
  if (!(await columnExists(queryInterface, 'work_order_items', 'nota_entrega'))) {
    await queryInterface.addColumn('work_order_items', 'nota_entrega', {
      type: DataTypes.TEXT,
      allowNull: true,
    });
  }
  if (!(await columnExists(queryInterface, 'work_order_items', 'es_a_pedido'))) {
    await queryInterface.addColumn('work_order_items', 'es_a_pedido', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  }

  // Columnas CCF D&P
  if (!(await columnExists(queryInterface, 'work_order_items', 'ccf_status'))) {
    await queryInterface.addColumn('work_order_items', 'ccf_status', {
      type: DataTypes.STRING(20),
      allowNull: true,
    });
  }
  if (!(await columnExists(queryInterface, 'work_order_items', 'ccf_reviewed_by'))) {
    await queryInterface.addColumn('work_order_items', 'ccf_reviewed_by', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });
  }
  if (!(await columnExists(queryInterface, 'work_order_items', 'ccf_reviewed_at'))) {
    await queryInterface.addColumn('work_order_items', 'ccf_reviewed_at', {
      type: DataTypes.DATE,
      allowNull: true,
    });
  }
  if (!(await columnExists(queryInterface, 'work_order_items', 'ccf_notes'))) {
    await queryInterface.addColumn('work_order_items', 'ccf_notes', {
      type: DataTypes.TEXT,
      allowNull: true,
    });
  }

  // Backfill work_order_items
  await backfillClassification(queryInterface, 'work_order_items', 'tipo_linea');

  // 4. Tabla de etapas D&P (work_order_dp_stages)
  if (!(await tableExists(queryInterface, 'work_order_dp_stages'))) {
    await queryInterface.createTable(
      'work_order_dp_stages',
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
        work_order_item_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'work_order_items', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        },
        stage_index: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },
        stage_key: {
          type: DataTypes.STRING(30),
          allowNull: false,
        },
        stage_label: {
          type: DataTypes.STRING(60),
          allowNull: false,
        },
        assigned_user_id: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
        },
        assigned_user_name: {
          type: DataTypes.STRING(180),
          allowNull: true,
        },
        status: {
          type: DataTypes.STRING(20),
          allowNull: false,
          defaultValue: 'pendiente',
        },
        started_at: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        completed_at: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        note: {
          type: DataTypes.TEXT,
          allowNull: true,
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
  }

  // Índices para work_order_dp_stages
  if (!(await hasIndex(queryInterface, 'work_order_dp_stages', 'work_order_dp_stages_item_stage_unique'))) {
    await queryInterface.addIndex('work_order_dp_stages', ['work_order_item_id', 'stage_index'], {
      name: 'work_order_dp_stages_item_stage_unique',
      unique: true,
    });
  }
  if (!(await hasIndex(queryInterface, 'work_order_dp_stages', 'work_order_dp_stages_work_order_idx'))) {
    await queryInterface.addIndex('work_order_dp_stages', ['work_order_id'], {
      name: 'work_order_dp_stages_work_order_idx',
    });
  }
  if (!(await hasIndex(queryInterface, 'work_order_dp_stages', 'work_order_dp_stages_user_status_idx'))) {
    await queryInterface.addIndex('work_order_dp_stages', ['assigned_user_id', 'status'], {
      name: 'work_order_dp_stages_user_status_idx',
    });
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  if (await tableExists(queryInterface, 'work_order_dp_stages')) {
    await queryInterface.dropTable('work_order_dp_stages');
  }

  const woColumns = [
    'ccf_notes',
    'ccf_reviewed_at',
    'ccf_reviewed_by',
    'ccf_status',
    'es_a_pedido',
    'nota_entrega',
    'recibido_taller_at',
    'recibido_taller',
    'armador_user_id',
    'entregado_bodega_at',
    'entregado_bodega',
    'bodeguero_user_id',
    'subtipo',
    'division',
  ];
  for (const col of woColumns) {
    if (await columnExists(queryInterface, 'work_order_items', col)) {
      await queryInterface.removeColumn('work_order_items', col);
    }
  }

  for (const col of ['subtipo', 'division']) {
    if (await columnExists(queryInterface, 'quotation_items', col)) {
      await queryInterface.removeColumn('quotation_items', col);
    }
  }

  if (await hasIndex(queryInterface, 'catalog_items', 'catalog_items_division_subtipo_idx')) {
    await queryInterface.removeIndex('catalog_items', 'catalog_items_division_subtipo_idx');
  }
  for (const col of ['subtipo', 'division']) {
    if (await columnExists(queryInterface, 'catalog_items', col)) {
      await queryInterface.removeColumn('catalog_items', col);
    }
  }
}
