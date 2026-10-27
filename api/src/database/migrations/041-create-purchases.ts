import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

const MODULE = 'compras';
const MODULE_LIST = ['taller', 'comercial', 'finanzas', 'flota', 'almacen', 'compras', 'admin'];
const ACTIONS = ['read', 'create', 'update', 'delete', 'export', 'import'] as const;

const ROLE_GRANTS: Record<string, readonly string[]> = {
  desarrollador: ['read', 'create', 'update', 'delete', 'export', 'import'],
  admin: ['read', 'create', 'update', 'delete', 'export', 'import'],
  jefe: ['read', 'create', 'update', 'export'],
  finanzas: ['read', 'export'],
  bodeguero: ['read'],
};

const hasTable = async (queryInterface: QueryInterface, table: string): Promise<boolean> => {
  const tables = await queryInterface.showAllTables();
  return tables.includes(table);
};

const ensureSupplierTable = async (queryInterface: QueryInterface): Promise<void> => {
  if (await hasTable(queryInterface, 'suppliers')) return;

  await queryInterface.createTable('suppliers', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    nombre: { type: DataTypes.STRING(180), allowNull: false },
    rut: { type: DataTypes.STRING(20), allowNull: true, unique: true },
    telefono: { type: DataTypes.STRING(30), allowNull: true },
    email: { type: DataTypes.STRING(180), allowNull: true },
    direccion: { type: DataTypes.STRING(255), allowNull: true },
    contacto_nombre: { type: DataTypes.STRING(180), allowNull: true },
    notas: { type: DataTypes.TEXT, allowNull: true },
    datos_completos: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await queryInterface.addIndex('suppliers', ['nombre'], {
    name: 'suppliers_nombre_index',
  });
};

const ensurePurchaseTables = async (queryInterface: QueryInterface): Promise<void> => {
  if (!(await hasTable(queryInterface, 'purchases'))) {
    await queryInterface.createTable('purchases', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      codigo: { type: DataTypes.STRING(30), allowNull: false, unique: true },
      supplier_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'suppliers', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      vehicle_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'vehicles', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      fleet_vehicle_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'fleet_vehicles', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      work_order_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'work_orders', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      origen_vehiculo: {
        type: DataTypes.ENUM('taller', 'flota'),
        allowNull: true,
      },
      con_iva: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      neto: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      iva: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      total: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      forma_pago: {
        type: DataTypes.ENUM('contado', 'credito'),
        allowNull: false,
        defaultValue: 'contado',
      },
      metodo_pago: {
        type: DataTypes.ENUM(
          'efectivo',
          'transferencia',
          'tarjeta_debito',
          'tarjeta_credito',
          'cheque',
          'otro',
        ),
        allowNull: false,
        defaultValue: 'efectivo',
      },
      estado: {
        type: DataTypes.ENUM('registrada', 'anulada'),
        allowNull: false,
        defaultValue: 'registrada',
      },
      tipo_documento: {
        type: DataTypes.ENUM('factura', 'boleta', 'recibo', 'nota_credito', 'otro'),
        allowNull: false,
      },
      folio: { type: DataTypes.STRING(50), allowNull: false },
      fecha_emision: { type: DataTypes.DATEONLY, allowNull: false },
      monto_comprobante: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      numero_operacion: { type: DataTypes.STRING(80), allowNull: false },
      banco: { type: DataTypes.STRING(80), allowNull: false },
      comprobante_nombre: { type: DataTypes.STRING(255), allowNull: false },
      comprobante_storage_key: { type: DataTypes.STRING(255), allowNull: false },
      comprobante_mime_type: { type: DataTypes.STRING(100), allowNull: false },
      comprobante_size_bytes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      observaciones: { type: DataTypes.TEXT, allowNull: true },
      cash_movement_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'cash_movements', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      pagado_at: { type: DataTypes.DATE, allowNull: true },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      voided_at: { type: DataTypes.DATE, allowNull: true },
      voided_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      void_reason: { type: DataTypes.STRING(500), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex('purchases', ['estado'], {
      name: 'purchases_estado_index',
    });
    await queryInterface.addIndex('purchases', ['supplier_id'], {
      name: 'purchases_supplier_id_index',
    });
    await queryInterface.addIndex('purchases', ['vehicle_id'], {
      name: 'purchases_vehicle_id_index',
    });
    await queryInterface.addIndex('purchases', ['created_at'], {
      name: 'purchases_created_at_index',
    });
  }

  if (!(await hasTable(queryInterface, 'purchase_items'))) {
    await queryInterface.createTable('purchase_items', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      purchase_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'purchases', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      catalog_item_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'catalog_items', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      descripcion: { type: DataTypes.STRING(255), allowNull: false },
      cantidad: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      precio_unitario: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      subtotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      afecta_stock: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      warehouse_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'warehouses', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex('purchase_items', ['purchase_id'], {
      name: 'purchase_items_purchase_id_index',
    });
    await queryInterface.addIndex('purchase_items', ['catalog_item_id'], {
      name: 'purchase_items_catalog_item_id_index',
    });
  }
};

const ensureModuleEnum = async (queryInterface: QueryInterface): Promise<void> => {
  if (!(await hasTable(queryInterface, 'permissions'))) return;

  const [columns] = (await queryInterface.sequelize.query(
    `SELECT COLUMN_TYPE AS columnType
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'permissions' AND COLUMN_NAME = 'modulo'
     LIMIT 1;`,
  )) as [{ columnType: string }[], unknown];

  const columnType = columns[0]?.columnType ?? '';
  if (columnType.includes(`'${MODULE}'`)) return;

  await queryInterface.changeColumn('permissions', 'modulo', {
    type: DataTypes.ENUM(...MODULE_LIST),
    allowNull: false,
  });
  await queryInterface.sequelize.query("DELETE FROM permissions WHERE modulo = '';");
};

const ensurePermissionsAndGrants = async (queryInterface: QueryInterface): Promise<void> => {
  if (!(await hasTable(queryInterface, 'permissions'))) return;

  const now = new Date();
  const sequelize = queryInterface.sequelize;

  const [existingPerms] = (await sequelize.query(
    'SELECT modulo, accion FROM permissions WHERE modulo = ?;',
    { replacements: [MODULE] },
  )) as [{ modulo: string; accion: string }[], unknown];
  const existingSet = new Set(existingPerms.map((permission) => `${permission.modulo}:${permission.accion}`));
  const toInsert = ACTIONS.filter((accion) => !existingSet.has(`${MODULE}:${accion}`)).map((accion) => ({
    modulo: MODULE,
    accion,
    created_at: now,
    updated_at: now,
  }));
  if (toInsert.length > 0) {
    await queryInterface.bulkInsert('permissions', toInsert);
  }

  if (!(await hasTable(queryInterface, 'roles')) || !(await hasTable(queryInterface, 'role_permissions'))) {
    return;
  }

  const [roles] = (await sequelize.query('SELECT id, nombre FROM roles;')) as [
    { id: number; nombre: string }[],
    unknown,
  ];
  const [permissions] = (await sequelize.query(
    'SELECT id, modulo, accion FROM permissions WHERE modulo = ?;',
    { replacements: [MODULE] },
  )) as [{ id: number; modulo: string; accion: string }[], unknown];
  const [existingGrants] = (await sequelize.query(
    `SELECT rp.role_id AS roleId, rp.permission_id AS permissionId FROM role_permissions rp
     INNER JOIN permissions p ON p.id = rp.permission_id WHERE p.modulo = ?;`,
    { replacements: [MODULE] },
  )) as [{ roleId: number; permissionId: number }[], unknown];
  const grantSet = new Set(existingGrants.map((grant) => `${grant.roleId}:${grant.permissionId}`));

  for (const role of roles) {
    const allowed = ROLE_GRANTS[role.nombre];
    if (!allowed) continue;
    for (const permission of permissions) {
      if (!allowed.includes(permission.accion)) continue;
      if (grantSet.has(`${role.id}:${permission.id}`)) continue;
      await queryInterface.bulkInsert('role_permissions', [
        { role_id: role.id, permission_id: permission.id },
      ]);
      grantSet.add(`${role.id}:${permission.id}`);
    }
  }
};

export async function up(queryInterface: QueryInterface): Promise<void> {
  await ensureSupplierTable(queryInterface);
  await ensurePurchaseTables(queryInterface);
  await ensureModuleEnum(queryInterface);
  await ensurePermissionsAndGrants(queryInterface);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  if (await hasTable(queryInterface, 'purchase_items')) {
    await queryInterface.dropTable('purchase_items');
  }
  if (await hasTable(queryInterface, 'purchases')) {
    await queryInterface.dropTable('purchases');
  }
  if (await hasTable(queryInterface, 'suppliers')) {
    await queryInterface.dropTable('suppliers');
  }
  if (await hasTable(queryInterface, 'permissions')) {
    await queryInterface.sequelize.query('DELETE FROM permissions WHERE modulo = ?;', {
      replacements: [MODULE],
    });
    await queryInterface.changeColumn('permissions', 'modulo', {
      type: DataTypes.ENUM('taller', 'comercial', 'finanzas', 'flota', 'almacen', 'admin'),
      allowNull: false,
    });
  }
}
