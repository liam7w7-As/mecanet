import type { UserPublic } from '../stores/auth.store';

export const getSessionHomePath = (user: UserPublic | null): string =>
  user?.role === 'mecanico' ? '/work-orders/mine' : '/dashboard';

/** Restore internal deep links while keeping mechanics in their working area. */
export const getPostLoginPath = (user: UserPublic, from?: string): string => {
  const home = getSessionHomePath(user);
  if (!from || !/^\/(?![/\\])/.test(from)) return home;
  const pathname = from.split(/[?#]/, 1)[0];
  if (pathname === '/login') return home;
  if (user.role === 'mecanico' && pathname !== '/work-orders/mine' && !/^\/work-orders\/\d+\/ficha$/.test(pathname)) return home;
  return from;
};
