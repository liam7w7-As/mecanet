import { Ellipsis, House, Wrench } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';

import { useDashboardSummary } from '../../hooks/useDashboard';
import { getMobilePrimaryItems } from '../../hooks/useShellNavigation';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../stores/auth.store';

import type { BadgeKey } from './navigation';

interface MobileTabBarProps {
  /** Abre el panel inferior con el resto de secciones. */
  onOpenMenu: () => void;
  isMenuOpen?: boolean;
}

export const MobileTabBar = ({ onOpenMenu, isMenuOpen = false }: MobileTabBarProps) => {
  const user = useAuthStore((state) => state.user);
  const { pathname } = useLocation();
  const dashboardQuery = useDashboardSummary(user);
  const inbox = dashboardQuery.data?.operationalInbox;

  const badgeCounts: Record<BadgeKey, number> = {
    dashboard: inbox?.total ?? 0,
    workOrders: (inbox?.counts.approvals ?? 0) + (inbox?.counts.assignedWorkOrders ?? 0),
    quotations: inbox?.counts.quotationFollowUps ?? 0,
    vehicles: inbox?.counts.fleetDocumentAlerts ?? 0,
    warehouses: (inbox?.counts.warehouseDeliveries ?? 0) + (inbox?.counts.stockAlerts ?? 0),
    finance: inbox?.counts.paymentVerifications ?? 0,
  };

  const tabs = getMobilePrimaryItems(user);

  // "Más" se marca activo cuando la ruta actual no corresponde a ninguna
  // pestaña, para que el usuario siempre sepa dónde está parado.
  const moreIsActive = !tabs.some(
    (tab) => !(tab.path === '/work-orders' && pathname === '/work-orders/daily-report')
      && (pathname === tab.path || pathname.startsWith(`${tab.path}/`)),
  );

  return (
    <nav className="tabbar" aria-label="Navegación principal (móvil)" {...(isMenuOpen ? { inert: '', 'aria-hidden': true as const } : {})}>
      <div className="tabbar-inner">
        {tabs.map((tab) => {
          const Icon = tab.path === '/dashboard' ? House : tab.path.startsWith('/work-orders') ? Wrench : tab.icon;
          const badgeCount = tab.badge ? badgeCounts[tab.badge] : 0;
          const badgeId = `mobile-tab-badge-${tab.badge}`;
          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              aria-label={tab.label}
              aria-describedby={badgeCount > 0 ? badgeId : undefined}
              end={tab.path === '/work-orders' && ['/work-orders/mine', '/work-orders/daily-report'].includes(pathname)}
              className={({ isActive }) => cn('tab-item', isActive && 'active')}
            >
              <span className="tab-icon">
                <Icon aria-hidden="true" />
                {badgeCount > 0 && (
                  <span id={badgeId} className="tab-badge"><span aria-hidden="true">{badgeCount > 99 ? '99+' : badgeCount}</span><span className="sr-only">{badgeCount} pendientes</span></span>
                )}
              </span>
              <span className="tab-label">{tab.label}</span>
            </NavLink>
          );
        })}

        <button
          type="button"
          className={cn('tab-item', (moreIsActive || isMenuOpen) && 'active')}
          aria-label="Abrir todas las secciones"
          aria-haspopup="dialog"
          aria-controls="mobile-more"
          aria-expanded={isMenuOpen}
          onClick={onOpenMenu}
        >
          <span className="tab-icon">
            <Ellipsis aria-hidden="true" />
          </span>
          <span className="tab-label">Más</span>
        </button>
      </div>
    </nav>
  );
};

export default MobileTabBar;
