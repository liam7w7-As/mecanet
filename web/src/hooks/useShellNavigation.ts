import { useCallback, useEffect, useState } from 'react';

import { useModalOverlay } from './useModalOverlay';

const DESKTOP_QUERY = '(min-width: 1024px)';
const STORAGE_KEY = 'unithor:sidebar-collapsed';

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
  const isVisible = isDesktop ? !isCollapsed : isMobileOpen;
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
