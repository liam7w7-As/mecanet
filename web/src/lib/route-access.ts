import { matchRoutes } from 'react-router-dom';

import { hasUserPermission } from './permissions';

import type { UserPublic } from '../stores/auth.store';
import type { PermissionDefinition, Role } from '@unithor/shared';

export interface RouteAccess {
  path: string;
  allowedRoles?: readonly Role[];
  requiredAnyPermission?: readonly PermissionDefinition[];
}

/** Route guards and session redirects must use these same rules and paths. */
export const APP_ROUTES = {
  dashboard: {
    path: '/dashboard',
    requiredAnyPermission: [{ modulo: 'taller', accion: 'read' }, { modulo: 'comercial', accion: 'read' }],
  },
  workOrders: {
    path: '/work-orders',
    requiredAnyPermission: [{ modulo: 'taller', accion: 'read' }],
  },
  workOrderCreate: {
    path: '/work-orders/new',
    requiredAnyPermission: [{ modulo: 'taller', accion: 'create' }],
  },
  myWorkOrders: {
    path: '/work-orders/mine',
    requiredAnyPermission: [{ modulo: 'taller', accion: 'read' }],
  },
  dailyReport: {
    path: '/work-orders/daily-report',
    allowedRoles: ['desarrollador', 'admin', 'jefe'],
  },
  worksheet: {
    path: '/work-orders/:id/ficha',
    requiredAnyPermission: [{ modulo: 'taller', accion: 'read' }],
  },
  workOrderDetail: {
    path: '/work-orders/:id',
    requiredAnyPermission: [{ modulo: 'taller', accion: 'read' }],
  },
  quotations: {
    path: '/quotations',
    requiredAnyPermission: [{ modulo: 'comercial', accion: 'read' }],
  },
  quotationCreate: {
    path: '/quotations/new',
    requiredAnyPermission: [{ modulo: 'comercial', accion: 'create' }],
  },
  quotationConvert: {
    path: '/quotations/:quotationId/convert-to-ot',
    requiredAnyPermission: [{ modulo: 'comercial', accion: 'update' }, { modulo: 'taller', accion: 'create' }],
  },
  quotationDetail: {
    path: '/quotations/:id',
    requiredAnyPermission: [{ modulo: 'comercial', accion: 'read' }],
  },
  purchases: {
    path: '/purchases',
    requiredAnyPermission: [{ modulo: 'compras', accion: 'read' }],
  },
  purchaseCreate: {
    path: '/purchases/new',
    requiredAnyPermission: [{ modulo: 'compras', accion: 'create' }],
  },
  purchaseDetail: {
    path: '/purchases/:id',
    requiredAnyPermission: [{ modulo: 'compras', accion: 'read' }],
  },
  finance: {
    path: '/finance',
    requiredAnyPermission: [{ modulo: 'finanzas', accion: 'read' }],
  },
  reports: {
    path: '/reports',
    requiredAnyPermission: [
      { modulo: 'finanzas', accion: 'read' },
      { modulo: 'comercial', accion: 'read' },
      { modulo: 'taller', accion: 'read' },
      { modulo: 'almacen', accion: 'read' },
      { modulo: 'admin', accion: 'read' },
    ],
  },
  clients: {
    path: '/clients',
    requiredAnyPermission: [{ modulo: 'comercial', accion: 'read' }, { modulo: 'taller', accion: 'read' }],
  },
  vehicles: {
    path: '/vehicles',
    requiredAnyPermission: [
      { modulo: 'taller', accion: 'read' },
      { modulo: 'comercial', accion: 'read' },
      { modulo: 'flota', accion: 'read' },
    ],
  },
  vehicleDetail: {
    path: '/vehicles/:id',
    requiredAnyPermission: [{ modulo: 'taller', accion: 'read' }, { modulo: 'comercial', accion: 'read' }],
  },
  catalog: {
    path: '/catalog',
    requiredAnyPermission: [{ modulo: 'taller', accion: 'read' }, { modulo: 'comercial', accion: 'read' }],
  },
  warehouses: {
    path: '/warehouses',
    requiredAnyPermission: [{ modulo: 'almacen', accion: 'read' }],
  },
  users: {
    path: '/users',
    requiredAnyPermission: [{ modulo: 'admin', accion: 'read' }],
  },
  settings: {
    path: '/settings',
    requiredAnyPermission: [{ modulo: 'admin', accion: 'read' }],
  },
} as const satisfies Record<string, RouteAccess>;

export const hasRouteAccess = (user: UserPublic, route: RouteAccess): boolean =>
  (!route.allowedRoles || route.allowedRoles.includes(user.role)) &&
  (!route.requiredAnyPermission || route.requiredAnyPermission.some((permission) =>
    hasUserPermission(user, permission.modulo, permission.accion),
  ));

// Use the router's ranking and exact matching: /new must not inherit /:id's read rule.
export const getRouteAccess = (pathname: string): RouteAccess | undefined =>
  matchRoutes(Object.values(APP_ROUTES), pathname)?.[0]?.route;
