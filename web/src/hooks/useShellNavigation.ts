import { useCallback, useEffect, useState } from 'react';

import { useModalOverlay } from './useModalOverlay';
import { getNavigationGroups } from '../components/layout/navigation';

import type { NavigationItem } from '../components/layout/navigation';
import type { UserPublic } from '../stores/auth.store';

const DESKTOP_QUERY = '(min-width: 1024px)';
const STORAGE_KEY = 'unithor:sidebar-collapsed';

/** Both mobile surfaces must partition the same permission-filtered links. */
export const getMobilePrimaryItems = (user: UserPublic | null): NavigationItem[] => {
  const items = new Map(getNavigationGroups(user).flatMap((group) => group.items).map((item) => [item.path, item]));
  const paths = user?.role === 'mecanico'
    ? ['/work-orders/mine']
    : ['/dashboard', '/work-orders', '/vehicles', items.has('/warehouses') ? '/warehouses' : '/quotations'];
  const labels: Record<string, string> = { '/dashboard': 'Inicio', '/work-orders': 'Taller' };

  return paths.flatMap((path) => {
    const item = items.get(path);
    return item ? [{ ...item, label: labels[path] ?? item.label }] : [];
  });
};

const readCollapsed = (): boolean => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

/** Presentation preference only; session and operational data stay in their existing stores. */
export const useShellNavigation = (pathname: string) => {
  const [isDesktop, setDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);
  const [isCollapsed, setCollapsed] = useState(readCollapsed);
  const [isMobileOpen, setMobileOpen] = useState(false);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const isDrawerOpen = !isDesktop && isMobileOpen;
  const isVisible = isDesktop || isMobileOpen;
  const panelRef = useModalOverlay({ isOpen: isDrawerOpen, onClose: closeMobile });

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY);
    const update = () => {
      setDesktop(media.matches);
      setMobileOpen(false);
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggle = useCallback(() => {
    if (!isDesktop) {
      setMobileOpen((open) => !open);
      return;
    }
    const next = !isCollapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Navigation remains usable when browser storage is unavailable.
    }
  }, [isDesktop, isCollapsed]);

  return { isDesktop, isCollapsed, isVisible, isDrawerOpen, panelRef, toggle, closeMobile };
};
