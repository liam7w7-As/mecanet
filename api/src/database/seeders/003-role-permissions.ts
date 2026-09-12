import type { QueryInterface } from 'sequelize';

type Role = 'desarrollador' | 'admin' | 'jefe' | 'vendedor' | 'bodeguero';
type Module = 'taller' | 'comercial' | 'flota' | 'admin';
type Action = 'read' | 'create' | 'update' | 'delete' | 'export' | 'import';

type PermissionMap = Partial<Record<Module, readonly Action[]>>;

const ROLE_PERMISSIONS_MATRIX: Record<Role, PermissionMap> = {
  desarrollador: {
    taller: ['read', 'create', 'update', 'delete', 'export', 'import'],
    comercial: ['read', 'create', 'update', 'delete', 'export', 'import'],
    flota: ['read', 'create', 'update', 'delete', 'export', 'import'],
    admin: ['read', 'create', 'update', 'delete', 'export', 'import'],
  },
  admin: {
    taller: ['read', 'create', 'update', 'delete', 'export', 'import'],
    comercial: ['read', 'create', 'update', 'delete', 'export', 'import'],
    flota: ['read', 'create', 'update', 'delete', 'export', 'import'],
    admin: ['read', 'create', 'update', 'delete', 'export', 'import'],
  },
  jefe: {
    taller: ['read', 'create', 'update', 'delete', 'export'],
    comercial: ['read', 'create', 'update', 'delete', 'export'],
    flota: ['read'],
    admin: ['read'],
  },
  vendedor: {
    taller: ['read', 'create', 'update'],
    comercial: ['read', 'create', 'update', 'export'],
    flota: ['read'],
  },
  bodeguero: {
    taller: ['read', 'update'],
    comercial: ['read'],
    flota: ['read'],
  },
};

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Obtener roles de la BD
  const [roles] = (await queryInterface.sequelize.query('SELECT id, nombre FROM roles;')) as [
    { id: number; nombre: Role }[],
    unknown,
  ];

  // Obtener permisos de la BD
  const [permissions] = (await queryInterface.sequelize.query(
    'SELECT id, modulo, accion FROM permissions;',
  )) as [{ id: number; modulo: Module; accion: Action }[], unknown];

  // Obtener relaciones existentes para idempotencia
  const [existingRolePermissions] = (await queryInterface.sequelize.query(
    'SELECT role_id, permission_id FROM role_permissions;',
  )) as [{ role_id: number; permission_id: number }[], unknown];

  const existingSet = new Set(
    existingRolePermissions.map((rp) => `${rp.role_id}:${rp.permission_id}`),
  );

  const roleMap = new Map<string, number>(roles.map((r) => [r.nombre, r.id]));
  const permMap = new Map<string, number>(
    permissions.map((p) => [`${p.modulo}:${p.accion}`, p.id]),
  );

  const toInsert: { role_id: number; permission_id: number }[] = [];

  for (const [roleName, modulePermissions] of Object.entries(ROLE_PERMISSIONS_MATRIX)) {
    const roleId = roleMap.get(roleName);
    if (!roleId) continue;

    for (const [modulo, acciones] of Object.entries(modulePermissions)) {
      if (!acciones) continue;
      for (const accion of acciones) {
        const permissionId = permMap.get(`${modulo}:${accion}`);
        if (!permissionId) continue;

        const key = `${roleId}:${permissionId}`;
        if (!existingSet.has(key)) {
          toInsert.push({ role_id: roleId, permission_id: permissionId });
          existingSet.add(key);
        }
      }
    }
  }

  if (toInsert.length > 0) {
    await queryInterface.bulkInsert('role_permissions', toInsert);
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.bulkDelete('role_permissions', {});
}
