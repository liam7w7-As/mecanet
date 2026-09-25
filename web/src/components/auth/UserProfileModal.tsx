import { AtSign, Mail, ShieldCheck, UserRound, X } from 'lucide-react';
import { useEffect } from 'react';

import {
  ACTION_LABELS,
  getRoleLabel,
  getUserPermissionEntries,
  MODULE_LABELS,
} from '../../lib/permissions';

import type { UserPublic } from '../../stores/auth.store';

interface UserProfileModalProps {
  user: UserPublic;
  onClose: () => void;
}

export { getRoleLabel } from '../../lib/permissions';

export const getInitials = (name: string): string =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

export const UserProfileModal = ({ user, onClose }: UserProfileModalProps) => {
  const permissions = getUserPermissionEntries(user);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-4 sm:items-center sm:py-6" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/55"
        aria-label="Cerrar perfil"
        onClick={onClose}
      />

      <section
        className="relative max-h-full w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
      >
        <header className="flex items-start justify-between bg-brand-blue px-6 py-5 text-white">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-yellow font-bold text-brand-dark">
              {getInitials(user.nombre)}
            </div>
            <div>
              <h2 id="profile-title" className="text-lg font-semibold">
                Perfil de usuario
              </h2>
              <p className="mt-0.5 text-sm text-white/70">{getRoleLabel(user.role)}</p>
            </div>
          </div>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white/75 hover:bg-white/10 hover:text-white"
            onClick={onClose}
            aria-label="Cerrar"
            title="Cerrar"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="space-y-6 p-6">
          <dl className="divide-y divide-slate-100 border-y border-slate-100">
            <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:items-center">
              <dt className="flex items-center gap-2 text-xs font-medium uppercase text-slate-500">
                <UserRound className="h-4 w-4" aria-hidden="true" /> ID de usuario
              </dt>
              <dd className="font-semibold text-slate-900">#{user.id}</dd>
            </div>
            <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:items-center">
              <dt className="flex items-center gap-2 text-xs font-medium uppercase text-slate-500">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Rol asignado
              </dt>
              <dd className="font-semibold text-slate-900">{getRoleLabel(user.role)}</dd>
            </div>
            <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:items-center">
              <dt className="text-xs font-medium uppercase text-slate-500">Nombre completo</dt>
              <dd className="font-semibold text-slate-900">{user.nombre}</dd>
            </div>
            <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:items-center">
              <dt className="flex items-center gap-2 text-xs font-medium uppercase text-slate-500">
                <AtSign className="h-4 w-4" aria-hidden="true" /> Usuario
              </dt>
              <dd className="font-semibold text-slate-900">{user.username ?? 'Sin asignar'}</dd>
            </div>
            <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:items-center">
              <dt className="flex items-center gap-2 text-xs font-medium uppercase text-slate-500">
                <Mail className="h-4 w-4" aria-hidden="true" /> Correo electrónico
              </dt>
              <dd className="break-all font-semibold text-slate-900">{user.email}</dd>
            </div>
          </dl>

          <div>
            <h3 className="text-sm font-semibold text-brand-blue">Permisos activos</h3>
            <div className="mt-3 space-y-3">
              {permissions.map(([module, actions]) => (
                <div key={module} className="border-l-2 border-brand-yellow pl-3">
                  <p className="text-sm font-semibold text-slate-800">{MODULE_LABELS[module]}</p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {actions.map((action) => ACTION_LABELS[action]).join(', ')}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-dark"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
      </section>
    </div>
  );
};

export default UserProfileModal;
