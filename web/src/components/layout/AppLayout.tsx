import { ChevronDown, ChevronLeft, LogOut } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

import MobileMoreSheet from './MobileMoreSheet';
import MobileTabBar from './MobileTabBar';
import { getNavigationGroups, navigationGroups } from './navigation';
import NotificationBell from './NotificationBell';
import UserMenu from './UserMenu';
import { useLogoutMutation } from '../../hooks/useAuth';
import { useDashboardSummary } from '../../hooks/useDashboard';
import { useSalesAccessSession } from '../../hooks/useSalesAccessSession';
import { useShellNavigation } from '../../hooks/useShellNavigation';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../stores/auth.store';
import { AnimateIcon } from '../animate-ui/animate-icon';
import { PageTransition } from '../animate-ui/page';
import UserProfileModal from '../auth/UserProfileModal';
import BrandLogo from '../common/BrandLogo';
import CustomerEmailPreparation from '../common/CustomerEmailPreparation';
import ToastViewport from '../common/Toast';
import PwaInstallButton from '../pwa/PwaInstallButton';

import type { BadgeKey } from './navigation';

interface SidebarContentProps {
  onToggle: () => void;
  isCollapsed: boolean;
}

const SidebarContent = ({ onToggle, isCollapsed }: SidebarContentProps) => {
  const { pathname } = useLocation();
  const user = useAuthStore((state) => state.user);
  const dashboardQuery = useDashboardSummary(user);
  const logoutMutation = useLogoutMutation();
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const [railHint, setRailHint] = useState<{ path: string; label: string; left: number; top: number } | null>(null);
  const inbox = dashboardQuery.data?.operationalInbox;

  const badgeCounts: Record<BadgeKey, number> = {
    dashboard: inbox?.total ?? 0,
    workOrders: (inbox?.counts.approvals ?? 0) + (inbox?.counts.assignedWorkOrders ?? 0),
    quotations: inbox?.counts.quotationFollowUps ?? 0,
    finance: inbox?.counts.paymentVerifications ?? 0,
    warehouses: (inbox?.counts.warehouseDeliveries ?? 0) + (inbox?.counts.stockAlerts ?? 0),
    vehicles: inbox?.counts.fleetDocumentAlerts ?? 0,
  };

  const groups = getNavigationGroups(user);
  const toggleLabel = isCollapsed ? 'Abrir navegación' : 'Plegar navegación';
  const showRailHint = (element: HTMLElement, path: string, label: string) => {
    if (!isCollapsed) return;
    const bounds = element.getBoundingClientRect();
    setRailHint({ path, label, left: bounds.right + 12, top: bounds.top + bounds.height / 2 });
  };

  return (
    <>
      <div className="brand shell-brand">
        <BrandLogo className="max-w-full" />
        <button
          type="button"
          className="shell-icon-button shell-sidebar-toggle"
          aria-label={toggleLabel}
          title={toggleLabel}
          aria-controls="shell-navigation-links"
          aria-expanded={!isCollapsed}
          onClick={() => { setRailHint(null); onToggle(); }}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
      </div>

      <nav id="shell-navigation-links" className="nav-scroll" aria-label="Navegación principal" onScroll={() => setRailHint(null)} onKeyDown={(event) => { if (event.key === 'Escape') setRailHint(null); }}>
        {groups.map((group, index) => {
          // A folded rail always exposes every authorized icon, retaining the
          // expanded sidebar's group preferences for when it opens again.
          const groupClosed = !isCollapsed && collapsedGroups.includes(group.heading);
          return <div key={group.heading} className="shell-nav-group">
            <button
              type="button"
              className="nav-heading shell-nav-heading"
              hidden={isCollapsed}
              aria-expanded={!groupClosed}
              aria-controls={`shell-nav-group-${index}`}
              onClick={() => setCollapsedGroups((current) => current.includes(group.heading)
                ? current.filter((heading) => heading !== group.heading)
                : [...current, group.heading])}
            >
              <span>{group.heading}</span>
              <ChevronDown className={cn(groupClosed && '-rotate-90')} aria-hidden="true" />
            </button>
            <div id={`shell-nav-group-${index}`} hidden={groupClosed}>
              {group.items.map((item) => {
                const Icon = item.icon;
                const badgeCount = item.badge ? badgeCounts[item.badge] : 0;
                const badgeId = `shell-nav-badge-${item.badge}`;
                const description = [badgeCount > 0 && badgeId, isCollapsed && railHint?.path === item.path && 'shell-rail-tooltip'].filter(Boolean).join(' ') || undefined;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    aria-label={item.label}
                    aria-describedby={description}
                    title={item.label}
                    onClick={() => setRailHint(null)}
                    onMouseEnter={(event) => showRailHint(event.currentTarget, item.path, item.label)}
                    onMouseLeave={() => setRailHint(null)}
                    onFocus={(event) => showRailHint(event.currentTarget, item.path, item.label)}
                    onBlur={() => setRailHint(null)}
                    end={item.path === '/work-orders' && ['/work-orders/mine', '/work-orders/daily-report'].includes(pathname)}
                    className={({ isActive }) => cn('nav-item', isActive && 'active')}
                  >
                    <AnimateIcon variant={item.variant} animateOnHover animateOnTap={false}>
                      <Icon className="icon" aria-hidden="true" />
                    </AnimateIcon>
                    <span className="shell-nav-label min-w-0 flex-1 whitespace-normal break-words leading-snug">{item.label}</span>
                    {badgeCount > 0 && (
                      <span id={badgeId} className={cn('badge', badgeCount > 9 ? '' : 'count')}>
                        <span aria-hidden="true">{badgeCount > 99 ? '99+' : badgeCount}</span>
                        <span className="sr-only">{badgeCount} pendientes</span>
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>;
        })}
      </nav>

      {isCollapsed && railHint && createPortal(<div id="shell-rail-tooltip" role="tooltip" className="shell-rail-tooltip" style={{ left: railHint.left, top: railHint.top }}>{railHint.label}</div>, document.body)}

      {user && (
        <div className="shell-account" role="group" aria-label="Cuenta y aplicación">
          <div className="shell-account-tools">
            <PwaInstallButton className="shell-install-button" />
            <NotificationBell />
          </div>
          <div className="shell-account-profile">
            <UserMenu placement="sidebar" />
            <button
              type="button"
              className="shell-icon-button"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              disabled={logoutMutation.isPending}
              onClick={() => logoutMutation.mutate()}
            >
              <LogOut aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const AppLayout = () => {
  const user = useAuthStore((state) => state.user);
  const salesAccessVersion = useSalesAccessSession();
  const { pathname } = useLocation();
  const navigation = useShellNavigation(pathname);
  const isSalesView = /^\/(dashboard|work-orders|quotations|finance|reports|clients|vehicles)(\/|$)/.test(pathname);
  const [profileOpen, setProfileOpen] = useState(false);
  const backgroundAttributes = navigation.isDrawerOpen
    ? { inert: '', 'aria-hidden': true as const }
    : {};

  if (!user) {
    return null;
  }

  return (
    <div className={cn('app-shell redesign-shell', navigation.isDesktop && navigation.isCollapsed && 'shell-collapsed')}>
      <a href="#shell-content" className="shell-skip-link" tabIndex={navigation.isDrawerOpen ? -1 : 0}>Saltar al contenido</a>
      {navigation.isDesktop && <aside
        id="shell-navigation"
        className="sidebar"
        hidden={!navigation.isVisible}
        aria-label="Menú de navegación"
      >
        <SidebarContent onToggle={navigation.toggle} isCollapsed={navigation.isCollapsed} />
      </aside>}

      {navigation.isDrawerOpen && <MobileMoreSheet panelRef={navigation.panelRef} onClose={navigation.closeMobile} onProfile={() => { navigation.closeMobile(); setProfileOpen(true); }} />}
      {profileOpen && <UserProfileModal user={user} onClose={() => setProfileOpen(false)} />}

      <header className="topbar shell-topbar" hidden={navigation.isDesktop && !navigation.isCollapsed} {...backgroundAttributes}>
        <BrandLogo heightClassName="h-6" className="topbar-brand" />

        <span className="shell-context-label">{navigationGroups.flatMap((group) => group.items)
          .filter((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))
          .sort((first, second) => second.path.length - first.path.length)[0]?.label ?? 'UNITHOR'}</span>
      </header>

      <main id="shell-content" className="shell-main" tabIndex={-1} {...backgroundAttributes}>
        <div className="container">
          <PageTransition key={isSalesView ? salesAccessVersion : user.id} routeKey={pathname}>
            <Outlet />
          </PageTransition>
        </div>
      </main>

      {!navigation.isDesktop && <MobileTabBar onOpenMenu={navigation.toggle} isMenuOpen={navigation.isDrawerOpen} />}

      <CustomerEmailPreparation />
      <ToastViewport />
    </div>
  );
};

export default AppLayout;
