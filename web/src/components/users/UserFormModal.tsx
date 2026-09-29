import { createUserSchema, updateUserSchema } from '@unithor/shared';
import { AlertCircle, LoaderCircle, Save } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';

import { useModalOverlay } from '../../hooks/useModalOverlay';
import {
  useCreateUserMutation,
  useUpdateUserMutation,
} from '../../hooks/useUsers';
import { getApiErrorMessage } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';
import { getRoleLabel } from '../../lib/permissions';
import { AnimateIcon } from '../animate-ui';
import ModalHeader from '../common/ModalHeader';

import type { AdminUser, RoleOption } from '../../hooks/useUsers';

interface UserFormModalProps {
  user?: AdminUser | null;
  roles: RoleOption[];
  onClose: () => void;
}

export const UserFormModal = ({ user, roles, onClose }: UserFormModalProps) => {
  const createMutation = useCreateUserMutation();
  const updateMutation = useUpdateUserMutation();
  const mutation = user ? updateMutation : createMutation;
  const defaultRole = roles.find((role) => role.nombre === 'vendedor')
    ?? roles.find((role) => role.nombre !== 'desarrollador')
    ?? roles[0];
  const [nombre, setNombre] = useState(user?.nombre ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState(String(user?.roleId ?? defaultRole?.id ?? ''));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setPanelNode = useModalOverlay({ isOpen: true, onClose, isPending: mutation.isPending });

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    mutation.reset();
    if (user) {
      const result = updateUserSchema.safeParse({ nombre, username, email, roleId });
      if (!result.success) {
        setErrors(getFieldErrors(result.error.issues));
        return;
      }
      setErrors({});
      updateMutation.mutate({ id: user.id, data: result.data }, { onSuccess: onClose });
    } else {
      const result = createUserSchema.safeParse({ nombre, username, email, password, roleId });
      if (!result.success) {
        setErrors(getFieldErrors(result.error.issues));
        return;
      }
      setErrors({});
      createMutation.mutate(result.data, { onSuccess: onClose });
    }
  };

  const inputClass = 'mt-1 h-10 w-full rounded-lg border border-brand-line px-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-4 sm:items-center sm:py-6">
      <button type="button" className="absolute inset-0 bg-brand-scrim/55" aria-label="Cerrar formulario de usuario" onClick={onClose} />
      <motion.section
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="relative w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-form-title"
        ref={setPanelNode}
      >
        <ModalHeader
          id="user-form-title"
          title={user ? 'Editar usuario' : 'Nuevo usuario'}
          description="Acceso, identidad y rol operativo"
          onClose={onClose}
        />
        <form onSubmit={submit} className="space-y-4 p-6">
          {mutation.isError && <div className="flex items-start gap-2 rounded-lg border border-brand-coral/30 bg-brand-coralPale px-3 py-2.5 text-sm text-brand-coralInk" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{getApiErrorMessage(mutation.error, 'No fue posible guardar el usuario.')}</div>}
          <label className="block text-sm font-semibold text-brand-ink">Nombre completo<input className={inputClass} value={nombre} onChange={(event) => setNombre(event.target.value)} autoFocus />{errors.nombre && <span className="mt-1 block text-xs font-normal text-brand-coralInk">{errors.nombre}</span>}</label>
          <label className="block text-sm font-semibold text-brand-ink">Nombre de usuario<input className={inputClass} value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} autoComplete="username" placeholder="ej. jperez" />{errors.username && <span className="mt-1 block text-xs font-normal text-brand-coralInk">{errors.username}</span>}</label>
          <label className="block text-sm font-semibold text-brand-ink">Correo electrónico<input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} />{errors.email && <span className="mt-1 block text-xs font-normal text-brand-coralInk">{errors.email}</span>}</label>
          {!user && <label className="block text-sm font-semibold text-brand-ink">Contraseña temporal<input className={inputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />{errors.password && <span className="mt-1 block text-xs font-normal text-brand-coralInk">{errors.password}</span>}</label>}
          <label className="block text-sm font-semibold text-brand-ink">Rol<select className={`${inputClass} bg-white`} value={roleId} onChange={(event) => setRoleId(event.target.value)}>{roles.map((role) => <option key={role.id} value={role.id}>{getRoleLabel(role.nombre)}</option>)}</select>{errors.roleId && <span className="mt-1 block text-xs font-normal text-brand-coralInk">{errors.roleId}</span>}</label>
          <footer className="flex justify-end gap-2 pt-2">
            <button type="button" className="h-10 rounded-lg border border-brand-line px-4 text-sm font-semibold text-brand-ink hover:bg-brand-pale" onClick={onClose}>Cancelar</button>
            <button type="submit" className="group inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primaryInk px-4 text-sm font-bold text-white transition-all hover:bg-brand-primaryInkHover active:scale-95 disabled:opacity-60" disabled={mutation.isPending}>
              {mutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <AnimateIcon icon={Save} animation="bounce" size={16} />}
              {user ? 'Guardar cambios' : 'Crear usuario'}
            </button>
          </footer>
        </form>
      </motion.section>
    </div>
  );
};

export default UserFormModal;
