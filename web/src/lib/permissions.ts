import { MODULES } from '@unithor/shared';

import type { UserPublic } from '../stores/auth.store';
import type { Action, Module, Role } from '@unithor/shared';

export type RolePermissionMap = Record<Role, Partial<Record<Module, readonly Action[]>>>;

export const ROLE_LABELS: Record<Role, string> = {
  desarrollador: 'Desarrollador',
  admin: 'Administrador',
  jefe: 'Jefe de Taller',
  mecanico: 'Mecánico',
  vendedor: 'Vendedor',
  bodeguero: 'Bodeguero',
  finanzas: 'Finanzas / Contabilidad',
};

export const ACTION_LABELS: Record<Action, string> = {
  read: 'Lectura',
  create: 'Creación',
  update: 'Edición',
  delete: 'Eliminación',
  export: 'Exportación',
  import: 'Importación',
};

export const MODULE_LABELS: Record<Module, string> = {
  taller: 'Taller',
  comercial: 'Comercial',
  finanzas: 'Finanzas',
  flota: 'Flota',
  admin: 'Administración',
};

const ALL_ACTIONS: readonly Action[] = ['read', 'create', 'update', 'delete', 'export', 'import'];

export const ROLE_PERMISSIONS: RolePermissionMap = {
  desarrollador: {
    taller: ALL_ACTIONS,
    comercial: ALL_ACTIONS,
    finanzas: ALL_ACTIONS,
    flota: ALL_ACTIONS,
    admin: ALL_ACTIONS,
  },
  admin: {
    taller: ALL_ACTIONS,
    comercial: ALL_ACTIONS,
    finanzas: ALL_ACTIONS,
    flota: ALL_ACTIONS,
    admin: ALL_ACTIONS,
  },
  jefe: {
    taller: ['read', 'create', 'update', 'delete', 'export'],
    comercial: ['read', 'create', 'update', 'delete', 'export'],
    flota: ['read'],
    admin: ['read'],
  },
  mecanico: {
    taller: ['read', 'update'],
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
  finanzas: {
    comercial: ['read'],
    finanzas: ['read', 'create', 'update', 'delete', 'export'],
  },
};

export const getRoleLabel = (role: Role): string => ROLE_LABELS[role];

export const hasRolePermission = (role: Role, module: Module, action: Action): boolean =>
  ROLE_PERMISSIONS[role][module]?.includes(action) ?? false;

export const hasUserPermission = (
  user: UserPublic,
  module: Module,
  action: Action,
): boolean => {
  if (user.role === 'desarrollador') return true;
  if (user.role === 'finanzas' && module === 'comercial' && action === 'export') {
    return user.permissions
      ? user.permissions.some(
          (permission) => permission.modulo === 'finanzas' && permission.accion === 'export',
        )
      : hasRolePermission(user.role, 'finanzas', 'export');
  }
  if (!user.permissions) return hasRolePermission(user.role, module, action);
  return user.permissions.some(
    (permission) => permission.modulo === module && permission.accion === action,
  );
};

export const getRolePermissionEntries = (role: Role): [Module, readonly Action[]][] =>
  Object.entries(ROLE_PERMISSIONS[role]) as [Module, readonly Action[]][];

export const getUserPermissionEntries = (user: UserPublic): [Module, readonly Action[]][] => {
  if (!user.permissions) return getRolePermissionEntries(user.role);

  return MODULES.flatMap((module) => {
    const actions = user.permissions
      ?.filter((permission) => permission.modulo === module)
      .map((permission) => permission.accion) ?? [];
    return actions.length > 0 ? [[module, actions] as [Module, readonly Action[]]] : [];
  });
};
