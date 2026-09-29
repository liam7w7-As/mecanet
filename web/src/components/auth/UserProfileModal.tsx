import { AtSign, Check, Mail, ShieldCheck, Sparkles, UserRound, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';

import { useModalOverlay } from '../../hooks/useModalOverlay';
import {
  ACTION_LABELS,
  getRoleLabel,
  getUserPermissionEntries,
  MODULE_LABELS,
} from '../../lib/permissions';
import {
  getCustomAvatar,
  MODERNIZE_AVATARS,
  setCustomAvatar,
} from '../../lib/user-avatar';
import UserAvatar from '../common/UserAvatar';

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

  const [activeTab, setActiveTab] = useState<'info' | 'avatars' | 'permissions'>('info');
  const [selectedAvatar, setSelectedAvatarState] = useState<string>(() => {
    return getCustomAvatar(user.id) ?? '';
  });

  const handleSelectAvatar = (avatarFile: string) => {
    setSelectedAvatarState(avatarFile);
    setCustomAvatar(avatarFile, user.id);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-4 sm:items-center sm:py-6"
      role="presentation"
    >
      {/* Backdrop Modernize con desenfoque */}
      <button
        type="button"
        className="fixed inset-0 bg-[#18273c55] backdrop-blur-sm transition-opacity"
        aria-label="Cerrar perfil"
        onClick={onClose}
      />

      <motion.section
        initial={{ opacity: 0, scale: 0.95, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 14 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        className="relative flex max-h-[92vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-brand-line bg-white shadow-2xl"
        role="dialog"
        ref={setPanelNode}
        aria-modal="true"
        aria-labelledby="profile-title"
      >
        {/* Banner Cover Modernize */}
        <div className="relative h-28 w-full shrink-0 overflow-hidden bg-gradient-to-r from-[#5d87ff] via-[#49beff] to-[#13deb9]">
          {/* Círculos decorativos abstractos de fondo */}
          <div className="absolute -left-6 -top-6 h-28 w-28 rounded-full bg-white/10 blur-sm" />
          <div className="absolute right-12 -bottom-10 h-36 w-36 rounded-full bg-white/15 blur-sm" />

          {/* Botón cerrar flotante */}
          <button
            type="button"
            className="absolute right-3.5 top-3.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/20 text-white backdrop-blur-md transition hover:bg-black/40 focus:outline-none"
            aria-label="Cerrar perfil"
            title="Cerrar"
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Identidad de Usuario con Anillo Modernize */}
        <div className="relative flex flex-col items-center px-6 -mt-12 text-center">
          <UserAvatar
            user={user}
            size="2xl"
            ring="modernize"
            className="shadow-xl"
          />

          <h2 id="profile-title" className="mt-3 text-xl font-bold tracking-tight text-brand-ink">
            {user.nombre}
          </h2>

          <div className="mt-1 flex items-center justify-center gap-2">
            <span className="status-chip sky font-semibold">
              {getRoleLabel(user.role)}
            </span>
            <span className="text-xs text-brand-muted">
              #{user.id}
            </span>
          </div>

          <p className="mt-0.5 text-xs text-brand-muted">
            {user.username ? `@${user.username} · ` : ''}{user.email}
          </p>
        </div>

        {/* Pestañas de Navegación del Perfil */}
        <div className="mt-4 flex border-b border-brand-line px-6">
          <button
            type="button"
            className={`border-b-2 px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'info'
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-brand-muted hover:text-brand-ink'
            }`}
            onClick={() => setActiveTab('info')}
          >
            Detalles de Cuenta
          </button>
          <button
            type="button"
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'avatars'
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-brand-muted hover:text-brand-ink'
            }`}
            onClick={() => setActiveTab('avatars')}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Elegir Avatar
          </button>
          <button
            type="button"
            className={`border-b-2 px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'permissions'
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-brand-muted hover:text-brand-ink'
            }`}
            onClick={() => setActiveTab('permissions')}
          >
            Permisos ({permissions.length})
          </button>
        </div>

        {/* Contenido según Pestaña */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'info' && (
            <dl className="divide-y divide-brand-line rounded-xl border border-brand-line bg-brand-page px-4">
              <div className="grid grid-cols-[8.5rem_1fr] items-center py-3 text-sm">
                <dt className="flex items-center gap-2 text-xs font-medium uppercase text-brand-muted">
                  <UserRound className="h-4 w-4" aria-hidden="true" /> ID Usuario
                </dt>
                <dd className="font-semibold text-brand-ink">#{user.id}</dd>
              </div>

              <div className="grid grid-cols-[8.5rem_1fr] items-center py-3 text-sm">
                <dt className="flex items-center gap-2 text-xs font-medium uppercase text-brand-muted">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Rol
                </dt>
                <dd className="font-semibold text-brand-ink">{getRoleLabel(user.role)}</dd>
              </div>

              <div className="grid grid-cols-[8.5rem_1fr] items-center py-3 text-sm">
                <dt className="text-xs font-medium uppercase text-brand-muted">Nombre</dt>
                <dd className="font-semibold text-brand-ink">{user.nombre}</dd>
              </div>

              <div className="grid grid-cols-[8.5rem_1fr] items-center py-3 text-sm">
                <dt className="flex items-center gap-2 text-xs font-medium uppercase text-brand-muted">
                  <AtSign className="h-4 w-4" aria-hidden="true" /> Usuario
                </dt>
                <dd className="font-semibold text-brand-ink">{user.username ?? 'Sin asignar'}</dd>
              </div>

              <div className="grid grid-cols-[8.5rem_1fr] items-center py-3 text-sm">
                <dt className="flex items-center gap-2 text-xs font-medium uppercase text-brand-muted">
                  <Mail className="h-4 w-4" aria-hidden="true" /> Correo
                </dt>
                <dd className="break-all font-semibold text-brand-ink">{user.email}</dd>
              </div>
            </dl>
          )}

          {activeTab === 'avatars' && (
            <div>
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-brand-ink">
                  Selecciona tu Avatar Modernize
                </h3>
                <p className="mt-0.5 text-xs text-brand-muted">
                  Elige un avatar oficial de la plantilla para personalizar tu foto de perfil en todo el sistema.
                </p>
              </div>

              <div className="grid grid-cols-4 gap-3 sm:grid-cols-4">
                {MODERNIZE_AVATARS.map((avatarFile, index) => {
                  const isCurrent =
                    selectedAvatar === avatarFile ||
                    (!selectedAvatar && index === (Math.abs(user.id) % MODERNIZE_AVATARS.length));

                  return (
                    <button
                      key={avatarFile}
                      type="button"
                      onClick={() => handleSelectAvatar(avatarFile)}
                      className={`group relative flex flex-col items-center rounded-xl p-2 transition ${
                        isCurrent
                          ? 'bg-brand-pale ring-2 ring-brand-primary'
                          : 'hover:bg-brand-pale/50'
                      }`}
                      title={`Avatar Modernize #${index + 1}`}
                    >
                      <div className="relative h-16 w-16 overflow-hidden rounded-full border-2 border-white shadow-md transition group-hover:scale-105">
                        <img
                          src={`/assets/images/users/${avatarFile}`}
                          alt={`Avatar ${index + 1}`}
                          className="h-full w-full object-cover"
                        />
                        {isCurrent && (
                          <div className="absolute inset-0 flex items-center justify-center bg-brand-primary/40 text-white backdrop-blur-[1px]">
                            <Check className="h-6 w-6 stroke-[3]" />
                          </div>
                        )}
                      </div>
                      <span className="mt-1.5 text-[11px] font-medium text-brand-ink">
                        Avatar {index + 1}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'permissions' && (
            <div>
              <h3 className="text-sm font-semibold text-brand-ink">
                Permisos del Rol: {getRoleLabel(user.role)}
              </h3>
              <p className="mt-0.5 text-xs text-brand-muted">
                Módulos y acciones autorizadas para tu cuenta.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {permissions.map(([module, actions]) => (
                  <div
                    key={module}
                    className="rounded-xl border border-brand-line bg-brand-page p-3"
                  >
                    <p className="text-xs font-bold uppercase tracking-wider text-brand-primary">
                      {MODULE_LABELS[module] ?? module}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {actions.map((action) => (
                        <span
                          key={action}
                          className="status-chip gray text-[11px]"
                        >
                          {ACTION_LABELS[action] ?? action}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Modernize */}
        <div className="dialog-buttons border-t border-brand-line bg-brand-page/50 px-6 py-4">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
      </motion.section>
    </div>
  );
};

export default UserProfileModal;
