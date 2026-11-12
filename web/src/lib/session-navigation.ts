import { hasUserPermission } from './permissions';
import { getNavigationGroups } from '../components/layout/navigation';

import type { UserPublic } from '../stores/auth.store';

export const getSessionHomePath = (user: UserPublic | null): string =>
  user?.role === 'mecanico' ? '/work-orders/mine' : '/dashboard';

/** Restore internal deep links while keeping mechanics in their working area. */
export const getPostLoginPath = (user: UserPublic, from?: string): string => {
  const home = getSessionHomePath(user);
  if (!from || !/^\/(?![/\\])/.test(from)) return home;
  const pathname = from.split(/[?#]/, 1)[0];
  if (pathname === '/login') return home;
  if (user.role === 'mecanico') return pathname === '/work-orders/mine' || /^\/work-orders\/\d+\/ficha$/.test(pathname) ? from : home;
  if (pathname === '/work-orders/mine') return home;
  if (pathname === '/work-orders/daily-report' && !['admin', 'desarrollador', 'jefe'].includes(user.role)) return home;
  const available = getNavigationGroups(user).flatMap((group) => group.items);
  if (!available.some((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))) return home;
  if (pathname === '/work-orders/new' && !hasUserPermission(user, 'taller', 'create')) return home;
  if (pathname === '/quotations/new' && !hasUserPermission(user, 'comercial', 'create')) return home;
  if (pathname === '/purchases/new' && !hasUserPermission(user, 'compras', 'create')) return home;
  if (/^\/quotations\/\d+\/convert-to-ot$/.test(pathname)
    && !hasUserPermission(user, 'comercial', 'update') && !hasUserPermission(user, 'taller', 'create')) return home;
  return from;
};
