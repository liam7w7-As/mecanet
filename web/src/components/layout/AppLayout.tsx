import { ChevronDown, LogOut, Menu, PanelLeftClose, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

import MobileMoreSheet from './MobileMoreSheet';
import MobileTabBar from './MobileTabBar';
import { getNavigationGroups, navigationGroups } from './navigation';
import NotificationBell from './NotificationBell';
import UserMenu from './UserMenu';
import { useLogoutMutation } from '../../hooks/useAuth';
import { useDashboardSummary } from '../../hooks/useDashboard';
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
  onNavigate?: () => void;
  onToggle: () => void;
  isDesktop: boolean;
}

const SidebarContent = ({ onNavigate, onToggle, isDesktop }: SidebarContentProps) => {
  const { pathname } = useLocation();
  const user = useAuthStore((state) => state.user);
  const dashboardQuery = useDashboardSummary(user);
  const logoutMutation = useLogoutMutation();
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
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

  return (
    <>
      <div className="brand shell-brand">
        <BrandLogo className="max-w-full" />
        <button
          type="button"
          className="shell-icon-button shell-sidebar-toggle"
          aria-label={isDesktop ? 'Plegar navegación' : 'Cerrar navegación'}
          onClick={onToggle}
        >
          {isDesktop ? <PanelLeftClose aria-hidden="true" /> : <X aria-hidden="true" />}
        </button>
      </div>

      <nav className="nav-scroll" aria-label="Navegación principal">
        {groups.map((group, index) => (
          <div key={group.heading}>
            <button
              type="button"
              className="nav-heading shell-nav-heading"
              aria-expanded={!collapsedGroups.includes(group.heading)}
              aria-controls={`shell-nav-group-${index}`}
              onClick={() => setCollapsedGroups((current) => current.includes(group.heading)
                ? current.filter((heading) => heading !== group.heading)
                : [...current, group.heading])}
            >
              <span>{group.heading}</span>
              <ChevronDown className={cn(collapsedGroups.includes(group.heading) && '-rotate-90')} aria-hidden="true" />
            </button>
            <div id={`shell-nav-group-${index}`} hidden={collapsedGroups.includes(group.heading)}>
              {group.items.map((item) => {
                const Icon = item.icon;
                const badgeCount = item.badge ? badgeCounts[item.badge] : 0;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={onNavigate}
                    end={item.path === '/work-orders' && ['/work-orders/mine', '/work-orders/daily-report'].includes(pathname)}
                    className={({ isActive }) => cn('nav-item', isActive && 'active')}
                  >
                    <AnimateIcon variant={item.variant} animateOnHover>
                      <Icon className="icon" aria-hidden="true" />
                    </AnimateIcon>
                    <span className="min-w-0 flex-1 whitespace-normal break-words leading-snug">{item.label}</span>
                    {badgeCount > 0 && (
                      <span className={cn('badge', badgeCount > 9 ? '' : 'count')}>
                        {badgeCount > 99 ? '99+' : badgeCount}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {user && (
        <div className="shell-account">
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
  const { pathname } = useLocation();
  const navigation = useShellNavigation(pathname);
  const [profileOpen, setProfileOpen] = useState(false);
  const backgroundAttributes = navigation.isDrawerOpen
    ? { inert: '', 'aria-hidden': true as const }
    : {};

  if (!user) {
    return null;
  }

  return (
    <div className={cn('app-shell redesign-shell', navigation.isCollapsed && 'shell-collapsed')}>
      <a href="#shell-content" className="shell-skip-link" tabIndex={navigation.isDrawerOpen ? -1 : 0}>Saltar al contenido</a>
      {navigation.isDesktop && <aside
        id="shell-navigation"
        className="sidebar"
        hidden={!navigation.isVisible}
        ref={navigation.panelRef}
        tabIndex={-1}
        role={navigation.isDrawerOpen ? 'dialog' : undefined}
        aria-modal={navigation.isDrawerOpen || undefined}
        aria-label="Menú de navegación"
      >
        <SidebarContent onNavigate={navigation.closeMobile} onToggle={navigation.toggle} isDesktop={navigation.isDesktop} />
      </aside>}

      {navigation.isDrawerOpen && <MobileMoreSheet panelRef={navigation.panelRef} onClose={navigation.closeMobile} onProfile={() => { navigation.closeMobile(); setProfileOpen(true); }} />}
      {profileOpen && <UserProfileModal user={user} onClose={() => setProfileOpen(false)} />}

      <header className="topbar shell-topbar" hidden={navigation.isDesktop && !navigation.isCollapsed} {...backgroundAttributes}>
        {navigation.isDesktop && <button
          type="button"
          className="shell-icon-button"
          aria-label="Abrir navegación"
          title="Abrir navegación"
          aria-controls="shell-navigation"
          aria-expanded={navigation.isVisible}
          onClick={navigation.toggle}
        >
          <Menu className="icon" aria-hidden="true" />
        </button>}

        <BrandLogo heightClassName="h-6" className="topbar-brand" />

        <span className="shell-context-label">{navigationGroups.flatMap((group) => group.items)
          .filter((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))
          .sort((first, second) => second.path.length - first.path.length)[0]?.label ?? 'UNITHOR'}</span>
      </header>

      <main id="shell-content" className="shell-main" tabIndex={-1} {...backgroundAttributes}>
        <div className="container">
          <PageTransition routeKey={pathname}>
            <Outlet />
          </PageTransition>
        </div>
      </main>

      <MobileTabBar onOpenMenu={navigation.toggle} isMenuOpen={navigation.isDrawerOpen} />

      <CustomerEmailPreparation />
      <ToastViewport />
    </div>
  );
};

export default AppLayout;
