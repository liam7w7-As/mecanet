import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

type ColumnDefinition = Parameters<QueryInterface['addColumn']>[2];

const tableExists = async (queryInterface: QueryInterface, tableName: string): Promise<boolean> => {
  const tables = (await queryInterface.showAllTables()) as string[];
  return tables.includes(tableName);
};

const columnExists = async (
  queryInterface: QueryInterface,
  tableName: string,
  columnName: string,
): Promise<boolean> => {
  const columns = await queryInterface.describeTable(tableName);
  return Boolean(columns[columnName]);
};

const addColumnIfMissing = async (
  queryInterface: QueryInterface,
  tableName: string,
  columnName: string,
  definition: ColumnDefinition,
): Promise<void> => {
  if (await columnExists(queryInterface, tableName, columnName)) return;
  await queryInterface.addColumn(tableName, columnName, definition);
};

export async function up(queryInterface: QueryInterface): Promise<void> {
  await addColumnIfMissing(queryInterface, 'catalog_items', 'horas_hombre_estandar', {
    type: DataTypes.DECIMAL(6, 2),
    allowNull: true,
  });

  await addColumnIfMissing(queryInterface, 'work_order_items', 'horas_hombre_estimadas', {
    type: DataTypes.DECIMAL(6, 2),
    allowNull: true,
  });
  await addColumnIfMissing(queryInterface, 'work_order_items', 'horas_hombre_reales', {
    type: DataTypes.DECIMAL(6, 2),
    allowNull: true,
  });
  await addColumnIfMissing(queryInterface, 'work_order_items', 'assigned_user_id', {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  });
  await addColumnIfMissing(queryInterface, 'work_order_items', 'labor_validated_by', {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  });
  await addColumnIfMissing(queryInterface, 'work_order_items', 'labor_validated_at', {
    type: DataTypes.DATE,
    allowNull: true,
  });
  await addColumnIfMissing(queryInterface, 'work_order_items', 'labor_validation_note', {
    type: DataTypes.TEXT,
    allowNull: true,
  });

  await addColumnIfMissing(queryInterface, 'work_order_progress_reports', 'horas_cerradas', {
    type: DataTypes.DECIMAL(7, 2),
    allowNull: true,
  });
  await addColumnIfMissing(queryInterface, 'work_order_progress_reports', 'items_snapshot', {
    type: DataTypes.JSON,
    allowNull: true,
  });

  if (!(await tableExists(queryInterface, 'work_order_item_sessions'))) {
    await queryInterface.createTable('work_order_item_sessions', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
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
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      user_name: { type: DataTypes.STRING(180), allowNull: true },
      kind: {
        type: DataTypes.ENUM('cronometro', 'ajuste'),
        allowNull: false,
        defaultValue: 'cronometro',
      },
      status: {
        type: DataTypes.ENUM('abierta', 'cerrada'),
        allowNull: false,
        defaultValue: 'abierta',
      },
      started_at: { type: DataTypes.DATE, allowNull: false },
      ended_at: { type: DataTypes.DATE, allowNull: true },
      duration_minutes: { type: DataTypes.INTEGER, allowNull: true },
      close_reason: {
        type: DataTypes.ENUM('pausa', 'completado', 'omitido', 'cierre_manual', 'sistema'),
        allowNull: true,
      },
      note: { type: DataTypes.TEXT, allowNull: true },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex('work_order_item_sessions', ['work_order_item_id', 'status'], {
      name: 'work_order_item_sessions_item_status_idx',
    });
    await queryInterface.addIndex('work_order_item_sessions', ['user_id', 'status'], {
      name: 'work_order_item_sessions_user_status_idx',
    });
    await queryInterface.addIndex('work_order_item_sessions', ['work_order_id', 'started_at'], {
      name: 'work_order_item_sessions_order_started_idx',
    });
  }

  if (!(await tableExists(queryInterface, 'work_order_item_progress_events'))) {
    await queryInterface.createTable('work_order_item_progress_events', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      work_order_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'work_orders', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      work_order_item_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'work_order_items', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      item_descripcion: { type: DataTypes.STRING(255), allowNull: false },
      from_status: {
        type: DataTypes.ENUM('pendiente', 'en_proceso', 'completado', 'omitido'),
        allowNull: true,
      },
      to_status: {
        type: DataTypes.ENUM('pendiente', 'en_proceso', 'completado', 'omitido'),
        allowNull: false,
      },
      performed_by_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      assigned_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      horas_estimadas: { type: DataTypes.DECIMAL(6, 2), allowNull: true },
      horas_reales: { type: DataTypes.DECIMAL(6, 2), allowNull: true },
      horas_delta: { type: DataTypes.DECIMAL(7, 2), allowNull: false, defaultValue: 0 },
      fecha_efectiva: { type: DataTypes.DATEONLY, allowNull: false },
      progress_report_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'work_order_progress_reports', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      session_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'work_order_item_sessions', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      source: {
        type: DataTypes.ENUM('check', 'reverso', 'ajuste', 'migracion'),
        allowNull: false,
        defaultValue: 'check',
      },
      note: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex(
      'work_order_item_progress_events',
      ['work_order_id', 'fecha_efectiva'],
      { name: 'work_order_item_events_order_date_idx' },
    );
    await queryInterface.addIndex(
      'work_order_item_progress_events',
      ['work_order_item_id', 'created_at'],
      { name: 'work_order_item_events_item_created_idx' },
    );
    await queryInterface.addIndex(
      'work_order_item_progress_events',
      ['assigned_user_id', 'fecha_efectiva'],
      { name: 'work_order_item_events_user_date_idx' },
    );
  }

  if (!(await tableExists(queryInterface, 'work_order_observations'))) {
    await queryInterface.createTable('work_order_observations', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      work_order_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'work_orders', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      work_order_item_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'work_order_items', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      progress_report_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'work_order_progress_reports', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      author_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      author_name: { type: DataTypes.STRING(180), allowNull: true },
      texto: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex('work_order_observations', ['work_order_id', 'created_at'], {
      name: 'work_order_observations_order_created_idx',
    });
    await queryInterface.addIndex('work_order_observations', ['work_order_item_id'], {
      name: 'work_order_observations_item_idx',
    });
  }

  if (!(await tableExists(queryInterface, 'work_order_observation_files'))) {
    await queryInterface.createTable('work_order_observation_files', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      observation_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'work_order_observations', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      storage_key: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      nombre_original: { type: DataTypes.STRING(255), allowNull: false },
      mime_type: { type: DataTypes.STRING(100), allowNull: false },
      size_bytes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      uploaded_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      created_at: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex('work_order_observation_files', ['observation_id'], {
      name: 'work_order_observation_files_observation_idx',
    });
  }

  if (!(await tableExists(queryInterface, 'work_order_price_suggestions'))) {
    await queryInterface.createTable('work_order_price_suggestions', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      work_order_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'work_orders', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      work_order_item_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'work_order_items', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      catalog_item_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'catalog_items', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      created_by_name: { type: DataTypes.STRING(180), allowNull: true },
      horas_estimadas: { type: DataTypes.DECIMAL(6, 2), allowNull: true },
      horas_reales: { type: DataTypes.DECIMAL(6, 2), allowNull: true },
      precio_actual_ot: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      precio_actual_catalogo: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      precio_sugerido: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      alcance: {
        type: DataTypes.ENUM('ot', 'catalogo', 'ambos'),
        allowNull: false,
        defaultValue: 'catalogo',
      },
      motivo: { type: DataTypes.TEXT, allowNull: false },
      estado: {
        type: DataTypes.ENUM('pendiente', 'aprobada', 'rechazada'),
        allowNull: false,
        defaultValue: 'pendiente',
      },
      reviewed_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      review_note: { type: DataTypes.TEXT, allowNull: true },
      reviewed_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex(
      'work_order_price_suggestions',
      ['work_order_id', 'estado'],
      { name: 'work_order_price_suggestions_order_status_idx' },
    );
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('work_order_price_suggestions').catch(() => undefined);
  await queryInterface.dropTable('work_order_observation_files').catch(() => undefined);
  await queryInterface.dropTable('work_order_observations').catch(() => undefined);
  await queryInterface.dropTable('work_order_item_progress_events').catch(() => undefined);
  await queryInterface.dropTable('work_order_item_sessions').catch(() => undefined);

  await queryInterface.removeColumn('work_order_progress_reports', 'items_snapshot').catch(() => undefined);
  await queryInterface.removeColumn('work_order_progress_reports', 'horas_cerradas').catch(() => undefined);
  await queryInterface.removeColumn('work_order_items', 'labor_validation_note').catch(() => undefined);
  await queryInterface.removeColumn('work_order_items', 'labor_validated_at').catch(() => undefined);
  await queryInterface.removeColumn('work_order_items', 'labor_validated_by').catch(() => undefined);
  await queryInterface.removeColumn('work_order_items', 'assigned_user_id').catch(() => undefined);
  await queryInterface.removeColumn('work_order_items', 'horas_hombre_reales').catch(() => undefined);
  await queryInterface.removeColumn('work_order_items', 'horas_hombre_estimadas').catch(() => undefined);
  await queryInterface.removeColumn('catalog_items', 'horas_hombre_estandar').catch(() => undefined);
}
