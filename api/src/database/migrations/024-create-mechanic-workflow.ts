import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

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
  const indexes = (await queryInterface.showIndex(tableName)) as unknown as Array<{
    name: string;
  }>;
  return indexes.some((index) => index.name === indexName);
};

export async function up(queryInterface: QueryInterface): Promise<void> {
  const workOrderColumns = await queryInterface.describeTable('work_orders');
  if (!workOrderColumns.assigned_mechanic_id) {
    await queryInterface.addColumn('work_orders', 'assigned_mechanic_id', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });
  }
  if (!(await indexExists(queryInterface, 'work_orders', 'work_orders_assigned_mechanic_idx'))) {
    await queryInterface.addIndex('work_orders', ['assigned_mechanic_id'], {
      name: 'work_orders_assigned_mechanic_idx',
    });
  }

  if (!(await tableExists(queryInterface, 'work_order_progress_reports'))) {
    await queryInterface.createTable(
    'work_order_progress_reports',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      work_order_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'work_orders', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      mechanic_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      porcentaje: { type: DataTypes.INTEGER, allowNull: false },
      comentario: { type: DataTypes.TEXT, allowNull: false },
      bloqueos: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
  }
  if (
    !(await indexExists(
      queryInterface,
      'work_order_progress_reports',
      'work_order_progress_work_order_created_idx',
    ))
  ) {
    await queryInterface.addIndex('work_order_progress_reports', ['work_order_id', 'created_at'], {
      name: 'work_order_progress_work_order_created_idx',
    });
  }

  if (!(await tableExists(queryInterface, 'work_order_requests'))) {
    await queryInterface.createTable(
    'work_order_requests',
    {
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
      requested_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      tipo: { type: DataTypes.ENUM('repuesto', 'aumento_precio'), allowNull: false },
      estado: {
        type: DataTypes.ENUM('pendiente', 'aprobada', 'rechazada', 'cancelada'),
        allowNull: false,
        defaultValue: 'pendiente',
      },
      motivo: { type: DataTypes.TEXT, allowNull: false },
      cantidad: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      precio_sugerido: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      precio_aprobado: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      reviewed_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      review_note: { type: DataTypes.TEXT, allowNull: true },
      reviewed_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
  }
  if (
    !(await indexExists(
      queryInterface,
      'work_order_requests',
      'work_order_requests_work_order_status_idx',
    ))
  ) {
    await queryInterface.addIndex('work_order_requests', ['work_order_id', 'estado'], {
      name: 'work_order_requests_work_order_status_idx',
    });
  }
  if (
    !(await indexExists(
      queryInterface,
      'work_order_requests',
      'work_order_requests_requested_by_idx',
    ))
  ) {
    await queryInterface.addIndex('work_order_requests', ['requested_by'], {
      name: 'work_order_requests_requested_by_idx',
    });
  }

  await queryInterface.changeColumn('work_order_events', 'tipo', {
    type: DataTypes.ENUM(
      'creacion',
      'actualizacion',
      'cambio_estado',
      'entrega',
      'garantia_creada',
      'reingreso_creado',
      'asignacion_mecanico',
      'reporte_avance',
      'solicitud_creada',
      'solicitud_revisada',
      'eliminacion',
    ),
    allowNull: false,
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.changeColumn('work_order_events', 'tipo', {
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
  });
  await queryInterface.dropTable('work_order_requests');
  await queryInterface.dropTable('work_order_progress_reports');
  await queryInterface.removeIndex('work_orders', 'work_orders_assigned_mechanic_idx');
  await queryInterface.removeColumn('work_orders', 'assigned_mechanic_id');
}
