import { DataTypes, QueryTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

const ACTIONS = ['read', 'create', 'update', 'delete', 'export', 'import'] as const;

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.changeColumn('roles', 'nombre', {
    type: DataTypes.ENUM(
      'desarrollador',
      'admin',
      'jefe',
      'mecanico',
      'vendedor',
      'bodeguero',
      'finanzas',
    ),
    allowNull: false,
    unique: true,
  });
  await queryInterface.changeColumn('permissions', 'modulo', {
    type: DataTypes.ENUM('taller', 'comercial', 'finanzas', 'flota', 'admin'),
    allowNull: false,
  });

  const now = new Date();
  const roles = await queryInterface.sequelize.query<{ nombre: string }>(
    "SELECT nombre FROM roles WHERE nombre IN ('mecanico', 'finanzas')",
    { type: QueryTypes.SELECT },
  );
  const existingRoles = new Set(roles.map((role) => role.nombre));
  const newRoles = [
    {
      nombre: 'mecanico',
      descripcion: 'Mecánico con acceso restringido a órdenes asignadas',
      created_at: now,
      updated_at: now,
    },
    {
      nombre: 'finanzas',
      descripcion: 'Finanzas y contabilidad',
      created_at: now,
      updated_at: now,
    },
  ].filter((role) => !existingRoles.has(role.nombre));
  if (newRoles.length > 0) await queryInterface.bulkInsert('roles', newRoles);

  const financePermissions = await queryInterface.sequelize.query<{ accion: string }>(
    "SELECT accion FROM permissions WHERE modulo = 'finanzas'",
    { type: QueryTypes.SELECT },
  );
  const existingActions = new Set(financePermissions.map((permission) => permission.accion));
  const newPermissions = ACTIONS.filter((accion) => !existingActions.has(accion)).map((accion) => ({
    modulo: 'finanzas',
    accion,
    created_at: now,
    updated_at: now,
  }));
  if (newPermissions.length > 0) await queryInterface.bulkInsert('permissions', newPermissions);

  const roleRows = await queryInterface.sequelize.query<{ id: number; nombre: string }>(
    "SELECT id, nombre FROM roles WHERE nombre IN ('desarrollador', 'admin', 'mecanico', 'finanzas')",
    { type: QueryTypes.SELECT },
  );
  const permissionRows = await queryInterface.sequelize.query<{
    id: number;
    modulo: string;
    accion: string;
  }>('SELECT id, modulo, accion FROM permissions', { type: QueryTypes.SELECT });
  const existingRows = await queryInterface.sequelize.query<{
    role_id: number;
    permission_id: number;
  }>('SELECT role_id, permission_id FROM role_permissions', { type: QueryTypes.SELECT });
  const roleIds = new Map(roleRows.map((role) => [role.nombre, role.id]));
  const permissionIds = new Map(
    permissionRows.map((permission) => [`${permission.modulo}:${permission.accion}`, permission.id]),
  );
  const existing = new Set(existingRows.map((row) => `${row.role_id}:${row.permission_id}`));
  const matrix: Record<string, string[]> = {
    desarrollador: ACTIONS.map((action) => `finanzas:${action}`),
    admin: ACTIONS.map((action) => `finanzas:${action}`),
    mecanico: ['taller:read', 'taller:update'],
    finanzas: [
      'comercial:read',
      'finanzas:read',
      'finanzas:create',
      'finanzas:update',
      'finanzas:delete',
      'finanzas:export',
    ],
  };
  const relations: Array<{ role_id: number; permission_id: number }> = [];
  Object.entries(matrix).forEach(([roleName, permissions]) => {
    const roleId = roleIds.get(roleName);
    if (!roleId) return;
    permissions.forEach((permission) => {
      const permissionId = permissionIds.get(permission);
      if (!permissionId || existing.has(`${roleId}:${permissionId}`)) return;
      relations.push({ role_id: roleId, permission_id: permissionId });
    });
  });
  if (relations.length > 0) await queryInterface.bulkInsert('role_permissions', relations);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const adminRows = await queryInterface.sequelize.query<{ id: number }>(
    "SELECT id FROM roles WHERE nombre = 'admin' LIMIT 1",
    { type: QueryTypes.SELECT },
  );
  const removableRoles = await queryInterface.sequelize.query<{ id: number }>(
    "SELECT id FROM roles WHERE nombre IN ('mecanico', 'finanzas')",
    { type: QueryTypes.SELECT },
  );
  const removableIds = removableRoles.map((role) => role.id);
  if (removableIds.length > 0 && adminRows[0]) {
    await queryInterface.bulkUpdate('users', { role_id: adminRows[0].id }, { role_id: removableIds });
    await queryInterface.bulkDelete('role_permissions', { role_id: removableIds });
    await queryInterface.bulkDelete('roles', { id: removableIds });
  }
  await queryInterface.bulkDelete('permissions', { modulo: 'finanzas' });
  await queryInterface.changeColumn('permissions', 'modulo', {
    type: DataTypes.ENUM('taller', 'comercial', 'flota', 'admin'),
    allowNull: false,
  });
  await queryInterface.changeColumn('roles', 'nombre', {
    type: DataTypes.ENUM('desarrollador', 'admin', 'jefe', 'vendedor', 'bodeguero'),
    allowNull: false,
    unique: true,
  });
}
