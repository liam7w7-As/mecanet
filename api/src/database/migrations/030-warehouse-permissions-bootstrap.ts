import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

const MODULE = 'almacen';
const ACTIONS = ['read', 'create', 'update', 'delete', 'export', 'import'] as const;

// Roles que reciben permisos del módulo (la matriz completa vive en
// seeders/003-role-permissions.ts y bootstrap.ts para instalaciones nuevas).
const ROLE_GRANTS: Record<string, readonly string[]> = {
  desarrollador: ['read', 'create', 'update', 'delete', 'export', 'import'],
  admin: ['read', 'create', 'update', 'delete', 'export', 'import'],
  jefe: ['read', 'create', 'update', 'export'],
  bodeguero: ['read', 'create', 'update', 'export'],
  vendedor: ['read'],
};

export async function up(queryInterface: QueryInterface): Promise<void> {
  const now = new Date();
  const sequelize = queryInterface.sequelize;

  // 0. Ampliar el ENUM de permissions.modulo (igual que 023 hizo con finanzas).
  await queryInterface.changeColumn('permissions', 'modulo', {
    type: DataTypes.ENUM('taller', 'comercial', 'finanzas', 'flota', 'almacen', 'admin'),
    allowNull: false,
  });
  await sequelize.query("DELETE FROM permissions WHERE modulo = '';", {});

  // 1. Permisos del módulo (idempotente)
  const [existingPerms] = (await sequelize.query(
    'SELECT modulo, accion FROM permissions WHERE modulo = ?;',
    { replacements: [MODULE] },
  )) as [{ modulo: string; accion: string }[], unknown];
  const existingSet = new Set(existingPerms.map((p) => `${p.modulo}:${p.accion}`));
  const toInsert = ACTIONS.filter((accion) => !existingSet.has(`${MODULE}:${accion}`)).map(
    (accion) => ({ modulo: MODULE, accion, created_at: now, updated_at: now }),
  );
  if (toInsert.length > 0) {
    await queryInterface.bulkInsert('permissions', toInsert);
  }

  // 2. Grants por rol (idempotente)
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
  const grantSet = new Set(existingGrants.map((g) => `${g.roleId}:${g.permissionId}`));

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

  // 3. Bodega Central + saldos iniciales desde el stock global actual.
  // Solo si no hay almacenes (instalación existente sin módulo).
  const [warehouses] = (await sequelize.query('SELECT id FROM warehouses LIMIT 1;')) as [
    { id: number }[],
    unknown,
  ];
  if (warehouses.length === 0) {
    await queryInterface.bulkInsert('warehouses', [
      {
        codigo: 'CENTRAL',
        nombre: 'Bodega Central',
        direccion: null,
        activo: true,
        created_at: now,
        updated_at: now,
      },
    ]);
    const [created] = (await sequelize.query(
      "SELECT id FROM warehouses WHERE codigo = 'CENTRAL' LIMIT 1;",
    )) as [{ id: number }[], unknown];
    const warehouseId = created[0]?.id;
    if (warehouseId !== undefined) {
      await sequelize.query(
        `INSERT INTO stock_balances (warehouse_id, catalog_item_id, cantidad, created_at, updated_at)
         SELECT :warehouseId, id, stock, :now, :now FROM catalog_items
         WHERE tipo = 'parte' AND stock > 0 AND deleted_at IS NULL;`,
        { replacements: { warehouseId, now } },
      );
      await sequelize.query(
        `INSERT INTO stock_movements
           (catalog_item_id, warehouse_id, tipo, cantidad, saldo_resultante, motivo, referencia, fecha, created_at)
         SELECT id, :warehouseId, 'ingreso', stock, stock, 'Saldo inicial Bodega Central', 'MIGRACION-030', :now, :now
         FROM catalog_items WHERE tipo = 'parte' AND stock > 0 AND deleted_at IS NULL;`,
        { replacements: { warehouseId, now } },
      );
    }
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;
  await sequelize.query('DELETE FROM stock_movements WHERE referencia = ?;', {
    replacements: ['MIGRACION-030'],
  });
  await sequelize.query('DELETE FROM stock_balances;');
  await sequelize.query("DELETE FROM warehouses WHERE codigo = 'CENTRAL';");
  await sequelize.query('DELETE FROM permissions WHERE modulo = ?;', {
    replacements: [MODULE],
  });
}
