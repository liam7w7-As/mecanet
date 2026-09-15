import {
  BookOpen,
  Car,
  ClipboardList,
  Gauge,
  LogOut,
  Menu,
  ReceiptText,
  UserCog,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

import { cn } from '../../lib/utils';
import { useAuthStore } from '../../stores/auth.store';

import type { LucideIcon } from 'lucide-react';

interface NavigationItem {
  label: string;
  path: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

const navigationItems: NavigationItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: Gauge },
  { label: 'Taller / OT', path: '/work-orders', icon: ClipboardList },
  { label: 'Comercial / Cotizaciones', path: '/quotations', icon: ReceiptText },
  { label: 'Clientes', path: '/clients', icon: Users },
  { label: 'Vehículos', path: '/vehicles', icon: Car },
  { label: 'Catálogo', path: '/catalog', icon: BookOpen },
  { label: 'Usuarios', path: '/users', icon: UserCog, adminOnly: true },
];

interface SidebarContentProps {
  onNavigate?: () => void;
}

const SidebarContent = ({ onNavigate }: SidebarContentProps) => {
  const user = useAuthStore((state) => state.user);
  const canManageUsers = user?.role === 'admin' || user?.role === 'desarrollador';

  return (
    <>
      <div className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-yellow text-brand-dark">
          <Wrench className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <p className="text-xl font-bold text-white">UNITHOR</p>
          <p className="text-xs text-white/60">Gestión de taller</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5" aria-label="Navegación principal">
        {navigationItems
          .filter((item) => !item.adminOnly || canManageUsers)
          .map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/75 transition-colors hover:bg-white/10 hover:text-white',
                    isActive && 'bg-brand-yellow text-brand-dark hover:bg-brand-yellow hover:text-brand-dark',
                  )
                }
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
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

const getInitials = (name: string): string =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

const formatRole = (role: string): string =>
  role
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export const AppLayout = () => {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isLoggingOut, setLoggingOut] = useState(false);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const handleLogout = async (): Promise<void> => {
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      // El store limpia la sesión local incluso si la red no responde.
    } finally {
      setLoggingOut(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-brand-light text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-brand-blue lg:flex">
        <SidebarContent />
      </aside>

      {isSidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/45"
            aria-label="Cerrar menú"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col bg-brand-blue shadow-xl">
            <button
              type="button"
              className="absolute right-3 top-5 flex h-9 w-9 items-center justify-center rounded-lg text-white/75 hover:bg-white/10 hover:text-white"
              aria-label="Cerrar navegación"
              title="Cerrar navegación"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <SidebarContent onNavigate={() => setSidebarOpen(false)} />
          </aside>
        </div>
      )}

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

          <div className="flex items-center gap-3 sm:gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-slate-900">{user.nombre}</p>
              <p className="text-xs text-slate-500">{formatRole(user.role)}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-blue text-sm font-semibold text-white">
              {getInitials(user.nombre)}
            </div>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-brand-blue hover:border-brand-blue/30 hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void handleLogout()}
              disabled={isLoggingOut}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden md:inline">Cerrar sesión</span>
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
