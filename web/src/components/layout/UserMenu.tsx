import {
  ChevronDown,
  KeyRound,
  LoaderCircle,
  LogOut,
  UserRound,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import { useLogoutMutation } from '../../hooks/useAuth';
import { useAuthStore } from '../../stores/auth.store';
import { AnimateIcon } from '../animate-ui/animate-icon';
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
          className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-brand-pale sm:gap-3"
          onClick={() => setOpen((open) => !open)}
          aria-label="Menú de usuario"
          aria-haspopup="menu"
          aria-expanded={isOpen}
        >
          <div className="flex h-[35px] w-[35px] shrink-0 items-center justify-center rounded-full bg-brand-primaryInk text-sm font-semibold text-white">
            {getInitials(user.nombre)}
          </div>
          <div className="hidden min-w-0 text-left sm:block">
            <p className="max-w-40 truncate text-sm font-semibold text-brand-ink">{user.nombre}</p>
            <span className="inline-flex rounded bg-brand-pale px-1.5 py-0.5 text-xs font-semibold text-brand-primaryInk">
              {getRoleLabel(user.role)}
            </span>
          </div>
          <ChevronDown
            className={`hidden h-4 w-4 text-brand-muted transition-transform duration-200 sm:block ${isOpen ? 'rotate-180' : ''}`}
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
              className="popover popover-menu absolute right-0 top-full z-50 mt-2 w-[min(16rem,calc(100vw-2rem))] overflow-hidden"
              role="menu"
            >
              <div className="border-b border-brand-line px-4 pb-3 pt-2 sm:hidden">
                <p className="truncate text-sm font-semibold text-brand-ink">{user.nombre}</p>
                <p className="mt-0.5 text-xs text-brand-muted">{getRoleLabel(user.role)}</p>
              </div>
              <button
                type="button"
                className="group flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-brand-ink transition-colors hover:bg-brand-pale hover:text-brand-primaryInk"
                onClick={openProfile}
                role="menuitem"
              >
                <AnimateIcon variant="hover-lift" animateOnHover>
                  <UserRound className="h-4 w-4 text-brand-muted group-hover:text-brand-primaryInk" aria-hidden="true" />
                </AnimateIcon>
                Ver perfil
              </button>
              <button
                type="button"
                className="flex w-full cursor-not-allowed items-center justify-between gap-3 px-4 py-2.5 text-left text-sm text-brand-muted"
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
              <div className="my-2 border-t border-brand-line" />
              <button
                type="button"
                className="group flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-brand-coralInk transition-colors hover:bg-brand-coralPale disabled:cursor-not-allowed disabled:opacity-60"
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
