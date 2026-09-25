import {
  ChevronDown,
  KeyRound,
  LoaderCircle,
  LogOut,
  UserRound,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { AnimatePresence, motion } from 'motion/react';
import { AnimateIcon } from '../animate-ui/animate-icon';

import { useLogoutMutation } from '../../hooks/useAuth';
import { useAuthStore } from '../../stores/auth.store';
import UserProfileModal, { getInitials, getRoleLabel } from '../auth/UserProfileModal';

export const UserMenu = () => {
  const [isOpen, setOpen] = useState(false);
  const [isProfileOpen, setProfileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const user = useAuthStore((state) => state.user);
  const logoutMutation = useLogoutMutation();

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  if (!user) {
    return null;
  }

  const openProfile = (): void => {
    setOpen(false);
    setProfileOpen(true);
  };

  return (
    <>
      <div className="relative min-w-0" ref={menuRef}>
        <button
          type="button"
          className="flex h-12 items-center gap-2 rounded-lg px-1.5 text-left transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-yellow sm:gap-3 sm:px-2"
          onClick={() => setOpen((open) => !open)}
          aria-label="Menú de usuario"
          aria-haspopup="menu"
          aria-expanded={isOpen}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-blue text-sm font-semibold text-white shadow-sm">
            {getInitials(user.nombre)}
          </div>
          <div className="hidden min-w-0 text-right sm:block">
            <p className="max-w-44 truncate text-sm font-semibold text-slate-900">{user.nombre}</p>
            <span className="inline-flex rounded bg-brand-yellow/25 px-1.5 py-0.5 text-xs font-semibold text-brand-dark">
              {getRoleLabel(user.role)}
            </span>
          </div>
          <ChevronDown
            className={`hidden h-4 w-4 text-slate-400 transition-transform duration-200 sm:block ${isOpen ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -6 }}
              transition={{ type: 'spring', stiffness: 450, damping: 30 }}
              className="absolute right-0 top-full z-30 mt-2 w-[min(16rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-slate-200 bg-white py-2 shadow-xl shadow-slate-900/10"
              role="menu"
            >
              <div className="border-b border-slate-100 px-4 pb-3 pt-2 sm:hidden">
                <p className="truncate text-sm font-semibold text-slate-900">{user.nombre}</p>
                <p className="mt-0.5 text-xs text-slate-500">{getRoleLabel(user.role)}</p>
              </div>
              <button
                type="button"
                className="group flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50 hover:text-brand-blue"
                onClick={openProfile}
                role="menuitem"
              >
                <AnimateIcon variant="hover-lift" animateOnHover>
                  <UserRound className="h-4 w-4 text-slate-500 group-hover:text-brand-blue" aria-hidden="true" />
                </AnimateIcon>
                Ver perfil
              </button>
              <button
                type="button"
                className="flex w-full cursor-not-allowed items-center justify-between gap-3 px-4 py-2.5 text-left text-sm text-slate-400"
                disabled
                role="menuitem"
                title="Cambio de contraseña no disponible"
              >
                <span className="flex items-center gap-3">
                  <AnimateIcon variant="wiggle" animateOnHover={false}>
                    <KeyRound className="h-4 w-4" aria-hidden="true" />
                  </AnimateIcon>
                  Cambiar contraseña
                </span>
                <span className="text-[10px] font-semibold uppercase">Próximo</span>
              </button>
              <div className="my-2 border-t border-slate-100" />
              <button
                type="button"
                className="group flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
                role="menuitem"
              >
                {logoutMutation.isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <AnimateIcon variant="slide-right" animateOnHover>
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                  </AnimateIcon>
                )}
                {logoutMutation.isPending ? 'Cerrando sesión...' : 'Cerrar sesión'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {isProfileOpen && <UserProfileModal user={user} onClose={() => setProfileOpen(false)} />}
    </>
  );
};

export default UserMenu;
