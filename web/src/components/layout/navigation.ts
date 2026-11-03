import { BookOpen, Car, ClipboardList, FileBarChart2, Gauge, Landmark, ReceiptText, Settings, ShoppingCart, Timer, UserCog, Users, Warehouse } from 'lucide-react';

import { hasUserPermission } from '../../lib/permissions';

import type { UserPublic } from '../../stores/auth.store';
import type { AnimateIconVariant } from '../animate-ui/animate-icon';
import type { PermissionDefinition, Role } from '@unithor/shared';
import type { LucideIcon } from 'lucide-react';

/** Contadores del inbox operativo que se pintan como badge en la navegación. */
export type BadgeKey = 'dashboard' | 'workOrders' | 'quotations' | 'finance' | 'warehouses' | 'vehicles';

export interface NavigationItem {
  label: string;
  path: string;
  icon: LucideIcon;
  variant: AnimateIconVariant;
  permissions: PermissionDefinition[];
  badge?: BadgeKey;
  /** Si se indica, el enlace solo se muestra a esos roles. */
  roles?: Role[];
  /** Si se indica, el enlace se oculta a esos roles. */
  hiddenForRoles?: Role[];
}

export interface NavigationGroup {
  heading: string;
  items: NavigationItem[];
}

export const navigationGroups: NavigationGroup[] = [
  {
    heading: 'Principal',
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: Gauge, variant: 'pulse', badge: 'dashboard', permissions: [{ modulo: 'taller', accion: 'read' }, { modulo: 'comercial', accion: 'read' }] },
      { label: 'Reportes', path: '/reports', icon: FileBarChart2, variant: 'hover-lift', permissions: [{ modulo: 'finanzas', accion: 'read' }, { modulo: 'comercial', accion: 'read' }, { modulo: 'taller', accion: 'read' }, { modulo: 'almacen', accion: 'read' }, { modulo: 'admin', accion: 'read' }] },
    ],
  },
  {
    heading: 'Taller',
    items: [
      { label: 'Mi ficha', path: '/work-orders/mine', icon: ClipboardList, variant: 'bounce', badge: 'workOrders', permissions: [{ modulo: 'taller', accion: 'read' }], roles: ['mecanico'] },
      { label: 'Taller / OT', path: '/work-orders', icon: ClipboardList, variant: 'bounce', badge: 'workOrders', permissions: [{ modulo: 'taller', accion: 'read' }] },
      { label: 'Reporte diario', path: '/work-orders/daily-report', icon: Timer, variant: 'pulse', permissions: [{ modulo: 'taller', accion: 'read' }], roles: ['desarrollador', 'admin', 'jefe'] },
      { label: 'Vehículos', path: '/vehicles', icon: Car, variant: 'slide-right', badge: 'vehicles', permissions: [{ modulo: 'taller', accion: 'read' }, { modulo: 'comercial', accion: 'read' }, { modulo: 'flota', accion: 'read' }] },
      { label: 'Almacenes', path: '/warehouses', icon: Warehouse, variant: 'bounce', badge: 'warehouses', permissions: [{ modulo: 'almacen', accion: 'read' }] },
    ],
  },
  {
    heading: 'Comercial',
    items: [
      { label: 'Cotizaciones', path: '/quotations', icon: ReceiptText, variant: 'slide-right', badge: 'quotations', permissions: [{ modulo: 'comercial', accion: 'read' }] },
      { label: 'Clientes', path: '/clients', icon: Users, variant: 'hover-lift', permissions: [{ modulo: 'comercial', accion: 'read' }, { modulo: 'taller', accion: 'read' }] },
      { label: 'Catálogo', path: '/catalog', icon: BookOpen, variant: 'wiggle', permissions: [{ modulo: 'taller', accion: 'read' }, { modulo: 'comercial', accion: 'read' }] },
    ],
  },
  {
    heading: 'Administración',
    items: [
      { label: 'Compras', path: '/purchases', icon: ShoppingCart, variant: 'bounce', permissions: [{ modulo: 'compras', accion: 'read' }] },
      { label: 'Finanzas / Contabilidad', path: '/finance', icon: Landmark, variant: 'pulse', badge: 'finance', permissions: [{ modulo: 'finanzas', accion: 'read' }] },
      { label: 'Usuarios', path: '/users', icon: UserCog, variant: 'spin', permissions: [{ modulo: 'admin', accion: 'read' }] },
      { label: 'Configuración', path: '/settings', icon: Settings, variant: 'hover-lift', permissions: [{ modulo: 'admin', accion: 'read' }] },
    ],
  },
];

export const getNavigationGroups = (user: UserPublic | null): NavigationGroup[] => navigationGroups.map((group) => ({
  ...group,
  items: group.items.filter((item) => {
    if (!user) return false;
    if (user.role === 'mecanico') return item.roles?.includes('mecanico') ?? false;
    if (item.roles && !item.roles.includes(user.role)) return false;
    if (item.hiddenForRoles?.includes(user.role)) return false;
    return item.permissions.some((permission) => hasUserPermission(user, permission.modulo, permission.accion));
  }),
})).filter((group) => group.items.length > 0);
