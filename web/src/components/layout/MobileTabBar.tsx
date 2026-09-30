import { Car, ClipboardList, Gauge, LayoutGrid, ReceiptText } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';

import { useDashboardSummary } from '../../hooks/useDashboard';
import { hasUserPermission } from '../../lib/permissions';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../stores/auth.store';

import type { LucideIcon } from 'lucide-react';
import type { PermissionDefinition } from '@unithor/shared';

/** Contadores del inbox operativo, misma semántica que los badges del cajón. */
type BadgeKey = 'dashboard' | 'workOrders' | 'quotations';

interface MobileTab {
  label: string;
  path: string;
  icon: LucideIcon;
  permissions: PermissionDefinition[];
  badge?: BadgeKey;
}

/**
 * Pestañas fijas para móvil. Es el subconjunto más usado de `navigationGroups`
 * (AppLayout): como máximo 4 enlaces + "Más", para que quepan en 320px sin
 * apretar las etiquetas. El resto de secciones viven en el cajón lateral.
 */
const mobileTabs: MobileTab[] = [
  {
    label: 'Inicio',
    path: '/dashboard',
    icon: Gauge,
    permissions: [
      { modulo: 'taller', accion: 'read' },
      { modulo: 'comercial', accion: 'read' },
    ],
    badge: 'dashboard',
  },
  {
    label: 'OTs',
    path: '/work-orders',
    icon: ClipboardList,
    permissions: [{ modulo: 'taller', accion: 'read' }],
    badge: 'workOrders',
  },
  {
    label: 'Cotiz.',
    path: '/quotations',
    icon: ReceiptText,
    permissions: [{ modulo: 'comercial', accion: 'read' }],
    badge: 'quotations',
  },
  {
    label: 'Vehículos',
    path: '/vehicles',
    icon: Car,
    permissions: [
      { modulo: 'taller', accion: 'read' },
      { modulo: 'comercial', accion: 'read' },
    ],
  },
];

interface MobileTabBarProps {
  /** Abre el cajón lateral con el resto de secciones. */
  onOpenMenu: () => void;
}

export const MobileTabBar = ({ onOpenMenu }: MobileTabBarProps) => {
  const user = useAuthStore((state) => state.user);
  const { pathname } = useLocation();
  const dashboardQuery = useDashboardSummary();
  const inbox = dashboardQuery.data?.operationalInbox;

  const badgeCounts: Record<BadgeKey, number> = {
    dashboard: inbox?.total ?? 0,
    workOrders: (inbox?.counts.approvals ?? 0) + (inbox?.counts.assignedWorkOrders ?? 0),
    quotations: inbox?.counts.quotationFollowUps ?? 0,
  };

  const tabs = mobileTabs.filter((tab) =>
    user && tab.permissions.some((permission) =>
      hasUserPermission(user, permission.modulo, permission.accion),
    ),
  );

  // "Más" se marca activo cuando la ruta actual no corresponde a ninguna
  // pestaña, para que el usuario siempre sepa dónde está parado.
  const moreIsActive = !tabs.some(
    (tab) => pathname === tab.path || pathname.startsWith(`${tab.path}/`),
  );

  return (
    <nav className="tabbar" aria-label="Navegación principal (móvil)">
      <div className="tabbar-inner">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const badgeCount = tab.badge ? badgeCounts[tab.badge] : 0;
          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={({ isActive }) => cn('tab-item', isActive && 'active')}
            >
              <span className="tab-icon">
                <Icon aria-hidden="true" />
                {badgeCount > 0 && (
                  <span className="tab-badge">{badgeCount > 99 ? '99+' : badgeCount}</span>
                )}
              </span>
              <span className="tab-label">{tab.label}</span>
            </NavLink>
          );
        })}

        <button
          type="button"
          className={cn('tab-item', moreIsActive && 'active')}
          aria-label="Abrir todas las secciones"
          onClick={onOpenMenu}
        >
          <span className="tab-icon">
            <LayoutGrid aria-hidden="true" />
          </span>
          <span className="tab-label">Más</span>
        </button>
      </div>
    </nav>
  );
};

export default MobileTabBar;
