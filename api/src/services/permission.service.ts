import { sequelize } from '../config/database.js';
import { Permission } from '../models/Permission.js';
import { Role } from '../models/Role.js';
import { RolePermission } from '../models/RolePermission.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';

import type { Action, Module, PermissionDefinition } from '@unithor/shared';

export interface RolePublic {
  id: number;
  nombre: string;
  descripcion: string | null;
}

export interface PermissionPublic {
  id: number;
  modulo: Module;
  accion: Action;
}

interface CachedRolePermissions {
  permissions: Set<string>;
  expiresAt: number;
}

const permissionCache = new Map<number, CachedRolePermissions>();
const CACHE_TTL_MS = 60 * 1000; // 60 segundos

const toRolePublic = (role: Role): RolePublic => ({
  id: role.id,
  nombre: role.nombre,
  descripcion: role.descripcion,
});

const toPermissionPublic = (permission: Permission): PermissionPublic => ({
  id: permission.id,
  modulo: permission.modulo,
  accion: permission.accion,
});

export const listAllRoles = async (): Promise<RolePublic[]> => {
  const roles = await Role.findAll({
    attributes: ['id', 'nombre', 'descripcion'],
    order: [['id', 'ASC']],
  });

  return roles.map(toRolePublic);
};

export const listAllPermissions = async (): Promise<PermissionPublic[]> => {
  const permissions = await Permission.findAll({
    attributes: ['id', 'modulo', 'accion'],
    order: [
      ['modulo', 'ASC'],
      ['accion', 'ASC'],
    ],
  });

  return permissions.map(toPermissionPublic);
};

export const getRolePermissions = async (roleId: number): Promise<PermissionPublic[]> => {
  const role = await Role.findByPk(roleId, {
    include: [
      {
        model: Permission,
        attributes: ['id', 'modulo', 'accion'],
        through: { attributes: [] },
      },
    ],
  });

  if (!role) {
    throw ApiError.notFound('Rol no encontrado');
  }

  return (role.permissions ?? [])
    .map(toPermissionPublic)
    .sort((a, b) => {
      const moduleComparison = a.modulo.localeCompare(b.modulo);
      return moduleComparison !== 0 ? moduleComparison : a.accion.localeCompare(b.accion);
    });
};

export const updateRolePermissions = async (
  roleId: number,
  permissionIds: number[],
): Promise<PermissionPublic[]> => {
  const uniquePermissionIds = [...new Set(permissionIds)];

  const role = await Role.findByPk(roleId);
  if (!role) {
    throw ApiError.notFound('Rol no encontrado');
  }

  if (role.nombre === 'desarrollador') {
    throw ApiError.badRequest('No se pueden modificar los permisos del rol desarrollador');
  }

  const permissionsCount = await Permission.count({
    where: { id: uniquePermissionIds },
  });

  if (permissionsCount !== uniquePermissionIds.length) {
    throw ApiError.badRequest('Uno o más IDs de permiso no existen');
  }

  await sequelize.transaction(async (transaction) => {
    await RolePermission.destroy({
      where: { roleId },
      transaction,
    });

    await RolePermission.bulkCreate(
      uniquePermissionIds.map((permissionId) => ({
        roleId,
        permissionId,
      })),
      { transaction },
    );
  });

  invalidatePermissionCache(roleId);

  return getRolePermissions(roleId);
};

/**
 * Obtiene la lista de permisos asignados a un rol por su nombre.
 */
export const getPermissionsForRole = async (
  roleName: string,
): Promise<PermissionDefinition[]> => {
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
