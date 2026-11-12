import { APP_ROUTES, getRouteAccess, hasRouteAccess } from './route-access';

import type { UserPublic } from '../stores/auth.store';

// Prefer existing read destinations, then creation forms and the role-only report.
const homeRoutes = [
  APP_ROUTES.dashboard,
  APP_ROUTES.workOrders,
  APP_ROUTES.quotations,
  APP_ROUTES.purchases,
  APP_ROUTES.finance,
  APP_ROUTES.warehouses,
  APP_ROUTES.vehicles,
  APP_ROUTES.clients,
  APP_ROUTES.catalog,
  APP_ROUTES.users,
  APP_ROUTES.settings,
  APP_ROUTES.reports,
  APP_ROUTES.workOrderCreate,
  APP_ROUTES.quotationCreate,
  APP_ROUTES.purchaseCreate,
  APP_ROUTES.dailyReport,
];

export const getSessionHomePath = (user: UserPublic | null): string => {
  if (!user) return '/login';
  if (user.role === 'mecanico') {
    return hasRouteAccess(user, APP_ROUTES.myWorkOrders) ? APP_ROUTES.myWorkOrders.path : '/forbidden';
  }
  return homeRoutes.find((route) => hasRouteAccess(user, route))?.path ?? '/forbidden';
};

const getInternalPathname = (from: string): string | undefined => {
  if (!/^\/(?![/\\])/.test(from) || /\p{Cc}/u.test(from)) return undefined;
  const pathname = from.split(/[?#]/, 1)[0];
  try {
    const url = new URL(from, 'https://unithor.invalid');
    // Reject normalized paths (backslashes, dot segments, whitespace) rather
    // than checking one path and navigating to another. Keep query/hash intact.
    if (url.origin !== 'https://unithor.invalid' || url.pathname !== pathname) return undefined;
    if (/[\\\p{Cc}]/u.test(decodeURIComponent(pathname))) return undefined;
    return pathname;
  } catch {
    return undefined;
  }
};

/** Restore authorized internal deep links while keeping mechanics in their working area. */
export const getPostLoginPath = (user: UserPublic, from?: string): string => {
  const home = getSessionHomePath(user);
  if (typeof from !== 'string') return home;
  const pathname = getInternalPathname(from);
  if (!pathname) return home;
  const route = getRouteAccess(pathname);
  if (!route || !hasRouteAccess(user, route)) return home;
  if (user.role === 'mecanico') {
    return route.path === APP_ROUTES.myWorkOrders.path || /^\/work-orders\/\d+\/ficha$/.test(pathname)
      ? from : home;
  }
  if (route.path === APP_ROUTES.myWorkOrders.path) return home;
  return from;
};
