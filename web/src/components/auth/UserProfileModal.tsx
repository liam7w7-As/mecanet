import { AtSign, Mail, ShieldCheck, UserRound } from 'lucide-react';


import { useModalOverlay } from '../../hooks/useModalOverlay';
import {
  ACTION_LABELS,
  getRoleLabel,
  getUserPermissionEntries,
  MODULE_LABELS,
} from '../../lib/permissions';
import ModalHeader from '../common/ModalHeader';

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


  const setPanelNode = useModalOverlay({ isOpen: true, onClose });
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-4 sm:items-center sm:py-6" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-brand-scrim/55"
        aria-label="Cerrar perfil"
        onClick={onClose}
      />

      <section
        className="relative max-h-full w-full max-w-[520px] overflow-y-auto rounded-lg bg-white shadow-2xl"
        role="dialog" ref={setPanelNode}
        aria-modal="true"
        aria-labelledby="profile-title"
      >
        <ModalHeader
  id="profile-title"
  badge={getInitials(user.nombre)}
  title="Perfil de usuario"
  description={getRoleLabel(user.role)}
  onClose={onClose}
  closeLabel="Cerrar perfil"
/>

        <div className="space-y-6 p-6">
          <dl className="divide-y divide-brand-line border-y border-brand-line">
            <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:items-center">
              <dt className="flex items-center gap-2 text-xs font-medium uppercase text-brand-muted">
                <UserRound className="h-4 w-4" aria-hidden="true" /> ID de usuario
              </dt>
              <dd className="font-semibold text-brand-ink">#{user.id}</dd>
            </div>
            <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:items-center">
              <dt className="flex items-center gap-2 text-xs font-medium uppercase text-brand-muted">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Rol asignado
              </dt>
              <dd className="font-semibold text-brand-ink">{getRoleLabel(user.role)}</dd>
            </div>
            <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:items-center">
              <dt className="text-xs font-medium uppercase text-brand-muted">Nombre completo</dt>
              <dd className="font-semibold text-brand-ink">{user.nombre}</dd>
            </div>
            <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:items-center">
              <dt className="flex items-center gap-2 text-xs font-medium uppercase text-brand-muted">
                <AtSign className="h-4 w-4" aria-hidden="true" /> Usuario
              </dt>
              <dd className="font-semibold text-brand-ink">{user.username ?? 'Sin asignar'}</dd>
            </div>
            <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:items-center">
              <dt className="flex items-center gap-2 text-xs font-medium uppercase text-brand-muted">
                <Mail className="h-4 w-4" aria-hidden="true" /> Correo electrónico
              </dt>
              <dd className="break-all font-semibold text-brand-ink">{user.email}</dd>
            </div>
          </dl>

          <div>
            <h3 className="text-sm font-semibold text-brand-primaryInk">Permisos activos</h3>
            <div className="mt-3 space-y-3">
              {permissions.map(([module, actions]) => (
                <div key={module} className="border-l-2 border-brand-gold pl-3">
                  <p className="text-sm font-semibold text-brand-ink">{MODULE_LABELS[module]}</p>
                  <p className="mt-0.5 text-sm text-brand-muted">
                    {actions.map((action) => ACTION_LABELS[action]).join(', ')}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-brand-primaryInk px-4 text-sm font-semibold text-white hover:bg-brand-primaryInkHover"
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
