import type { Action, Module, Role } from '@unithor/shared';

export type RolePermissionMap = Record<Role, Partial<Record<Module, readonly Action[]>>>;

export const ROLE_LABELS: Record<Role, string> = {
  desarrollador: 'Desarrollador',
  admin: 'Administrador',
  jefe: 'Jefe de Taller',
  vendedor: 'Vendedor',
  bodeguero: 'Bodeguero',
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
  flota: 'Flota',
  admin: 'Administración',
};

const ALL_ACTIONS: readonly Action[] = ['read', 'create', 'update', 'delete', 'export', 'import'];

export const ROLE_PERMISSIONS: RolePermissionMap = {
  desarrollador: {
    taller: ALL_ACTIONS,
    comercial: ALL_ACTIONS,
    flota: ALL_ACTIONS,
    admin: ALL_ACTIONS,
  },
  admin: {
    taller: ALL_ACTIONS,
    comercial: ALL_ACTIONS,
    flota: ALL_ACTIONS,
    admin: ALL_ACTIONS,
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

export const getRoleLabel = (role: Role): string => ROLE_LABELS[role];

export const hasRolePermission = (role: Role, module: Module, action: Action): boolean =>
  ROLE_PERMISSIONS[role][module]?.includes(action) ?? false;

export const getRolePermissionEntries = (role: Role): [Module, readonly Action[]][] =>
  Object.entries(ROLE_PERMISSIONS[role]) as [Module, readonly Action[]][];
