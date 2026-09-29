import {
  BookOpen,
  Car,
  ClipboardList,
  Gauge,
  Landmark,
  LogOut,
  Menu,
  ReceiptText,
  Settings,
  UserCog,
  Users,
  Warehouse,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

import NotificationBell from './NotificationBell';
import UserMenu from './UserMenu';
import { useLogoutMutation } from '../../hooks/useAuth';
import { useDashboardSummary } from '../../hooks/useDashboard';
import { hasUserPermission } from '../../lib/permissions';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../stores/auth.store';
import { AnimateIcon } from '../animate-ui/animate-icon';
import { PageTransition } from '../animate-ui/page';
import { getRoleLabel } from '../auth/UserProfileModal';
import BrandLogo from '../common/BrandLogo';
import ToastViewport from '../common/Toast';
import UserAvatar from '../common/UserAvatar';

import type { AnimateIconVariant } from '../animate-ui/animate-icon';
import type { PermissionDefinition } from '@unithor/shared';
import type { LucideIcon } from 'lucide-react';

/** Contadores del inbox operativo que se pintan como badge en la navegación. */
type BadgeKey = 'dashboard' | 'workOrders' | 'quotations' | 'finance' | 'warehouses';

interface NavigationItem {
  label: string;
  path: string;
  icon: LucideIcon;
  variant: AnimateIconVariant;
  permissions: PermissionDefinition[];
  badge?: BadgeKey;
}

interface NavigationGroup {
  heading: string;
  items: NavigationItem[];
}

const navigationGroups: NavigationGroup[] = [
  {
    heading: 'Principal',
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: Gauge, variant: 'pulse', badge: 'dashboard', permissions: [{ modulo: 'taller', accion: 'read' }, { modulo: 'comercial', accion: 'read' }] },
    ],
  },
  {
    heading: 'Taller',
    items: [
      { label: 'Taller / OT', path: '/work-orders', icon: ClipboardList, variant: 'bounce', badge: 'workOrders', permissions: [{ modulo: 'taller', accion: 'read' }] },
      { label: 'Vehículos', path: '/vehicles', icon: Car, variant: 'slide-right', permissions: [{ modulo: 'taller', accion: 'read' }, { modulo: 'comercial', accion: 'read' }] },
      { label: 'Almacenes', path: '/warehouses', icon: Warehouse, variant: 'bounce', badge: 'warehouses', permissions: [{ modulo: 'almacen', accion: 'read' }] },
    ],
  },
  {
    heading: 'Comercial',
    items: [
      { label: 'Comercial / Cotizaciones', path: '/quotations', icon: ReceiptText, variant: 'slide-right', badge: 'quotations', permissions: [{ modulo: 'comercial', accion: 'read' }] },
      { label: 'Clientes', path: '/clients', icon: Users, variant: 'hover-lift', permissions: [{ modulo: 'comercial', accion: 'read' }, { modulo: 'taller', accion: 'read' }] },
      { label: 'Catálogo', path: '/catalog', icon: BookOpen, variant: 'wiggle', permissions: [{ modulo: 'taller', accion: 'read' }, { modulo: 'comercial', accion: 'read' }] },
    ],
  },
  {
    heading: 'Administración',
    items: [
      { label: 'Finanzas / Contabilidad', path: '/finance', icon: Landmark, variant: 'pulse', badge: 'finance', permissions: [{ modulo: 'finanzas', accion: 'read' }] },
      { label: 'Usuarios', path: '/users', icon: UserCog, variant: 'spin', permissions: [{ modulo: 'admin', accion: 'read' }] },
      { label: 'Configuración', path: '/settings', icon: Settings, variant: 'hover-lift', permissions: [{ modulo: 'admin', accion: 'read' }] },
    ],
  },
];

interface SidebarContentProps {
  onNavigate?: () => void;
}

const SidebarContent = ({ onNavigate }: SidebarContentProps) => {
  const user = useAuthStore((state) => state.user);
  const dashboardQuery = useDashboardSummary();
  const logoutMutation = useLogoutMutation();
  const inbox = dashboardQuery.data?.operationalInbox;

  const badgeCounts: Record<BadgeKey, number> = {
    dashboard: inbox?.total ?? 0,
    workOrders: (inbox?.counts.approvals ?? 0) + (inbox?.counts.assignedWorkOrders ?? 0),
    quotations: inbox?.counts.quotationFollowUps ?? 0,
    finance: inbox?.counts.paymentVerifications ?? 0,
    warehouses: (inbox?.counts.warehouseDeliveries ?? 0) + (inbox?.counts.stockAlerts ?? 0),
  };

  // Se filtran por permiso y se descartan los grupos que quedan vacíos, para no
  // dejar encabezados sin contenido según el rol.
  const groups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        user && item.permissions.some((permission) =>
          hasUserPermission(user, permission.modulo, permission.accion),
        ),
      ),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      {/* Sin `heightClassName`: `.brand img` (174x70) tiene más especificidad que
          las utilidades de Tailwind, así que el alto lo manda el diseño. */}
      <div className="brand">
        <BrandLogo className="max-w-full" />
      </div>

      <nav className="nav-scroll" aria-label="Navegación principal">
        {groups.map((group) => (
          <div key={group.heading}>
            <p className="nav-heading">{group.heading}</p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const badgeCount = item.badge ? badgeCounts[item.badge] : 0;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onNavigate}
                  className={({ isActive }) => cn('nav-item', isActive && 'active')}
                >
                  <AnimateIcon variant={item.variant} animateOnHover>
                    <Icon className="icon" aria-hidden="true" />
                  </AnimateIcon>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {badgeCount > 0 && (
                    <span className={cn('badge', badgeCount > 9 ? '' : 'count')}>
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {user && (
        <div className="profile-footer">
          <UserAvatar user={user} size="md" className="shrink-0" />
          <div className="min-w-0 flex-1">
            <strong className="block truncate" title={user.nombre}>
              {user.nombre}
            </strong>
            <p className="truncate text-brand-muted">{getRoleLabel(user.role)}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            disabled={logoutMutation.isPending}
            onClick={() => logoutMutation.mutate()}
          >
            <LogOut className="icon" aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );
};

export const AppLayout = () => {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const user = useAuthStore((state) => state.user);
  const { pathname } = useLocation();

  // El diseño abre y cierra la barra lateral con una clase en `<body>`: el
  // transform y el offset de `--sidebar` los resuelve shell.css, no React.
  useEffect(() => {
    document.body.classList.toggle('sidebar-open', isSidebarOpen);

    if (!isSidebarOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isSidebarOpen]);

  // Al desmontar (logout, hot reload) la clase no debe quedar pegada al body.
  useEffect(() => () => document.body.classList.remove('sidebar-open'), []);

  // Navegar en móvil debe cerrar el cajón.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen">
      <aside className="sidebar">
        <SidebarContent />
      </aside>

      <AnimatePresence>
        {isSidebarOpen && (
          <motion.button
            type="button"
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-label="Cerrar menú"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      <header className="topbar">
        <button
          type="button"
          className="icon-button menu-trigger"
          aria-label="Abrir navegación"
          title="Abrir navegación"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu className="icon" aria-hidden="true" />
        </button>

        <div className="top-actions">
          <NotificationBell />
          <UserMenu />
        </div>
      </header>

      <main className="shell-main">
        <div className="container">
          <PageTransition routeKey={pathname}>
            <Outlet />
          </PageTransition>
        </div>
      </main>

      <ToastViewport />
    </div>
  );
};

export default AppLayout;
