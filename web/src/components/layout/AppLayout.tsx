import {
  BookOpen,
  Car,
  ClipboardList,
  Gauge,
  Landmark,
  Menu,
  ReceiptText,
  UserCog,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

import UserMenu from './UserMenu';
import { AnimatePresence, motion } from 'motion/react';
import { AnimateIcon } from '../animate-ui/animate-icon';
import { PageTransition } from '../animate-ui/page';
import ToastViewport from '../common/Toast';
import { hasUserPermission } from '../../lib/permissions';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../stores/auth.store';

import type { PermissionDefinition } from '@unithor/shared';
import type { LucideIcon } from 'lucide-react';
import type { AnimateIconVariant } from '../animate-ui/animate-icon';

interface NavigationItem {
  label: string;
  path: string;
  icon: LucideIcon;
  variant: AnimateIconVariant;
  permissions: PermissionDefinition[];
}

const navigationItems: NavigationItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: Gauge, variant: 'pulse', permissions: [{ modulo: 'taller', accion: 'read' }, { modulo: 'comercial', accion: 'read' }] },
  { label: 'Taller / OT', path: '/work-orders', icon: ClipboardList, variant: 'bounce', permissions: [{ modulo: 'taller', accion: 'read' }] },
  { label: 'Comercial / Cotizaciones', path: '/quotations', icon: ReceiptText, variant: 'slide-right', permissions: [{ modulo: 'comercial', accion: 'read' }] },
  { label: 'Finanzas / Contabilidad', path: '/finance', icon: Landmark, variant: 'pulse', permissions: [{ modulo: 'finanzas', accion: 'read' }] },
  { label: 'Clientes', path: '/clients', icon: Users, variant: 'hover-lift', permissions: [{ modulo: 'comercial', accion: 'read' }, { modulo: 'taller', accion: 'read' }] },
  { label: 'Vehículos', path: '/vehicles', icon: Car, variant: 'slide-right', permissions: [{ modulo: 'taller', accion: 'read' }, { modulo: 'comercial', accion: 'read' }] },
  { label: 'Catálogo', path: '/catalog', icon: BookOpen, variant: 'wiggle', permissions: [{ modulo: 'taller', accion: 'read' }, { modulo: 'comercial', accion: 'read' }] },
  { label: 'Usuarios', path: '/users', icon: UserCog, variant: 'spin', permissions: [{ modulo: 'admin', accion: 'read' }] },
];

interface SidebarContentProps {
  onNavigate?: () => void;
}

const SidebarContent = ({ onNavigate }: SidebarContentProps) => {
  const user = useAuthStore((state) => state.user);

  return (
    <>
      <div className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-yellow text-brand-dark shadow-sm">
          <AnimateIcon variant="spin" animateOnHover>
            <Wrench className="h-5 w-5" aria-hidden="true" />
          </AnimateIcon>
        </div>
        <div>
          <p className="text-xl font-bold text-white tracking-wide">UNITHOR</p>
          <p className="text-xs text-white/60">Gestión de taller</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5" aria-label="Navegación principal">
        {navigationItems
          .filter((item) => user && item.permissions.some((permission) =>
            hasUserPermission(user, permission.modulo, permission.accion),
          ))
          .map((item) => {
            const Icon = item.icon;
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
                <span>{item.label}</span>
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
    <div className="min-h-screen bg-brand-light text-slate-900">
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

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
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

          <UserMenu />
        </header>

        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
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
