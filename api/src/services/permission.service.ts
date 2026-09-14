import { Permission } from '../models/Permission.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';

interface CachedRolePermissions {
  permissions: Set<string>;
  expiresAt: number;
}

const permissionCache = new Map<number, CachedRolePermissions>();
const CACHE_TTL_MS = 60 * 1000; // 60 segundos

/**
 * Obtiene la lista de permisos asignados a un rol por su nombre.
 */
export const getPermissionsForRole = async (
  roleName: string,
): Promise<Array<{ modulo: string; accion: string }>> => {
  const role = await Role.findOne({
    where: { nombre: roleName },
    include: [
      {
        model: Permission,
        attributes: ['modulo', 'accion'],
        through: { attributes: [] },
      },
    ],
  });

  if (!role || !role.permissions) {
    return [];
  }

  return role.permissions.map((p) => ({
    modulo: p.modulo,
    accion: p.accion,
  }));
};

/**
 * Valida si un usuario posee permiso para ejecutar una acción en un módulo.
 * - El rol 'desarrollador' siempre retorna true sin consultar caché ni DB (bypass).
 * - Para los demás roles, se utiliza caché en memoria con TTL de 60s.
 */
export const hasPermission = async (
  userId: number,
  modulo: string,
  accion: string,
): Promise<boolean> => {
  const user = await User.findByPk(userId, {
    attributes: ['id', 'roleId', 'activo'],
    include: [{ model: Role, attributes: ['id', 'nombre'] }],
  });

  if (!user || !user.activo || !user.role) {
    return false;
  }

  // Bypass para desarrollador
  if (user.role.nombre === 'desarrollador') {
    return true;
  }

  const roleId = user.roleId;
  const now = Date.now();
  const cached = permissionCache.get(roleId);

  if (cached && cached.expiresAt > now) {
    return cached.permissions.has(`${modulo}:${accion}`);
  }

  // Cargar de DB y almacenar en caché
  const permissions = await getPermissionsForRole(user.role.nombre);
  const permissionSet = new Set(
    permissions.map((p) => `${p.modulo}:${p.accion}`),
  );

  permissionCache.set(roleId, {
    permissions: permissionSet,
    expiresAt: now + CACHE_TTL_MS,
  });

  return permissionSet.has(`${modulo}:${accion}`);
};

/**
 * Invalida la memoria caché de permisos para un rol específico o para todos los roles.
 */
export const invalidatePermissionCache = (roleId?: number): void => {
  if (roleId !== undefined) {
    permissionCache.delete(roleId);
  } else {
    permissionCache.clear();
  }
};
