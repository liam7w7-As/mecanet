import {
  BookOpen,
  Car,
  ClipboardList,
  Gauge,
  Landmark,
  Menu,
  ReceiptText,
  Settings,
  UserCog,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

import NotificationBell from './NotificationBell';
import UserMenu from './UserMenu';
import { useDashboardSummary } from '../../hooks/useDashboard';
import { hasUserPermission } from '../../lib/permissions';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../stores/auth.store';
import { AnimateIcon } from '../animate-ui/animate-icon';
import { PageTransition } from '../animate-ui/page';
import BrandLogo from '../common/BrandLogo';
import ToastViewport from '../common/Toast';

import type { AnimateIconVariant } from '../animate-ui/animate-icon';
import type { PermissionDefinition } from '@unithor/shared';
import type { LucideIcon } from 'lucide-react';

interface NavigationItem {
  label: string;
  path: string;
  icon: LucideIcon;
  variant: AnimateIconVariant;
  permissions: PermissionDefinition[];
  badge?: 'dashboard' | 'workOrders' | 'quotations' | 'finance' | 'warehouses';
}

const navigationItems: NavigationItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: Gauge, variant: 'pulse', badge: 'dashboard', permissions: [{ modulo: 'taller', accion: 'read' }, { modulo: 'comercial', accion: 'read' }] },
  { label: 'Taller / OT', path: '/work-orders', icon: ClipboardList, variant: 'bounce', badge: 'workOrders', permissions: [{ modulo: 'taller', accion: 'read' }] },
  { label: 'Comercial / Cotizaciones', path: '/quotations', icon: ReceiptText, variant: 'slide-right', badge: 'quotations', permissions: [{ modulo: 'comercial', accion: 'read' }] },
  { label: 'Finanzas / Contabilidad', path: '/finance', icon: Landmark, variant: 'pulse', badge: 'finance', permissions: [{ modulo: 'finanzas', accion: 'read' }] },
  { label: 'Clientes', path: '/clients', icon: Users, variant: 'hover-lift', permissions: [{ modulo: 'comercial', accion: 'read' }, { modulo: 'taller', accion: 'read' }] },
  { label: 'Vehículos', path: '/vehicles', icon: Car, variant: 'slide-right', permissions: [{ modulo: 'taller', accion: 'read' }, { modulo: 'comercial', accion: 'read' }] },
  { label: 'Catálogo', path: '/catalog', icon: BookOpen, variant: 'wiggle', permissions: [{ modulo: 'taller', accion: 'read' }, { modulo: 'comercial', accion: 'read' }] },
  { label: 'Almacenes', path: '/warehouses', icon: Warehouse, variant: 'bounce', badge: 'warehouses', permissions: [{ modulo: 'almacen', accion: 'read' }] },
  { label: 'Usuarios', path: '/users', icon: UserCog, variant: 'spin', permissions: [{ modulo: 'admin', accion: 'read' }] },
  { label: 'Configuración', path: '/settings', icon: Settings, variant: 'hover-lift', permissions: [{ modulo: 'admin', accion: 'read' }] },
];

interface SidebarContentProps {
  onNavigate?: () => void;
}

const SidebarContent = ({ onNavigate }: SidebarContentProps) => {
  const user = useAuthStore((state) => state.user);
  const dashboardQuery = useDashboardSummary();
  const inbox = dashboardQuery.data?.operationalInbox;

  const badgeCounts = {
    dashboard: inbox?.total ?? 0,
    workOrders: (inbox?.counts.approvals ?? 0) + (inbox?.counts.assignedWorkOrders ?? 0),
    quotations: inbox?.counts.quotationFollowUps ?? 0,
    finance: inbox?.counts.paymentVerifications ?? 0,
    warehouses: (inbox?.counts.warehouseDeliveries ?? 0) + (inbox?.counts.stockAlerts ?? 0),
  };

  return (
    <>
      <div className="flex items-center border-b border-white/10 py-4 pl-4 pr-14 lg:px-4">
        <div className="flex w-full items-center justify-center rounded-xl bg-white px-3 py-2.5 shadow-sm">
          <BrandLogo heightClassName="h-8 sm:h-9 lg:h-10" className="max-w-full" />
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5" aria-label="Navegación principal">
        {navigationItems
          .filter((item) => user && item.permissions.some((permission) =>
            hasUserPermission(user, permission.modulo, permission.accion),
          ))
          .map((item) => {
            const Icon = item.icon;
            const badgeCount = item.badge ? badgeCounts[item.badge] : 0;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'group flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/75 transition-all hover:bg-white/10 hover:text-white',
                    isActive && 'bg-brand-yellow text-brand-dark font-semibold shadow-sm hover:bg-brand-yellow hover:text-brand-dark',
                  )
                }
              >
                <AnimateIcon variant={item.variant} animateOnHover>
                  <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                </AnimateIcon>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {badgeCount > 0 && (
                  <span aria-hidden="true" className="flex min-h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-white/15 px-1.5 text-[11px] font-bold group-aria-[current=page]:bg-brand-dark group-aria-[current=page]:text-white">
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </NavLink>
            );
          })}
      </nav>

      <div className="border-t border-white/10 px-6 py-4 text-xs text-white/45">
        UNITHOR v1.0
      </div>
    </>
  );
};

export const AppLayout = () => {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const user = useAuthStore((state) => state.user);
  const { pathname } = useLocation();

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-brand-light text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-brand-blue lg:flex">
        <SidebarContent />
      </aside>

      <AnimatePresence>
        {isSidebarOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/45"
              aria-label="Cerrar menú"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: -288 }}
              animate={{ x: 0 }}
              exit={{ x: -288 }}
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              className="relative flex h-full w-72 max-w-[85vw] flex-col bg-brand-blue shadow-xl"
            >
              <button
                type="button"
                className="absolute right-3 top-5 flex h-9 w-9 items-center justify-center rounded-lg text-white/75 hover:bg-white/10 hover:text-white"
                aria-label="Cerrar navegación"
                title="Cerrar navegación"
                onClick={() => setSidebarOpen(false)}
              >
                <AnimateIcon variant="spin" animateOnHover>
                  <X className="h-5 w-5" aria-hidden="true" />
                </AnimateIcon>
              </button>
              <SidebarContent onNavigate={() => setSidebarOpen(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="min-w-0 lg:pl-64">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
          <div className="min-w-0 flex items-center gap-3">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-brand-blue hover:bg-slate-50 lg:hidden"
              aria-label="Abrir navegación"
              title="Abrir navegación"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <div>
              <p className="text-sm font-semibold text-brand-blue">Panel operativo</p>
              <p className="hidden text-xs text-slate-500 sm:block">Taller y gestión comercial</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <NotificationBell />
            <UserMenu />
          </div>
        </header>

        <main className="mx-auto min-w-0 w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <PageTransition routeKey={pathname}>
            <Outlet />
          </PageTransition>
        </main>
      </div>
      <ToastViewport />
    </div>
  );
};

export default AppLayout;
