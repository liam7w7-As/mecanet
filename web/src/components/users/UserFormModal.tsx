import { createUserSchema, updateUserSchema } from '@unithor/shared';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

import { useCreateUserMutation, useUpdateUserMutation } from '../../hooks/useUsers';
import { getApiErrorMessage } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';
import { getRoleLabel } from '../../lib/permissions';
import FormDialog from '../common/FormDialog';

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
    ?? roles.find((role) => role.nombre !== 'desarrollador') ?? roles[0];
  const initial = {
    nombre: user?.nombre ?? '', username: user?.username ?? '', email: user?.email ?? '',
    roleId: String(user?.roleId ?? defaultRole?.id ?? ''),
  };
  const [form, setForm] = useState(initial);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = password !== '' || (Object.keys(initial) as Array<keyof typeof initial>)
    .some((field) => form[field] !== initial[field]);
  const selectedRole = roles.find((role) => String(role.id) === form.roleId);

  const setField = (field: keyof typeof form, value: string): void => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
  };
  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (mutation.isPending) return;
    mutation.reset();
    if (user) {
      const result = updateUserSchema.safeParse({ ...form, email: form.email.trim() });
      if (!result.success) { setErrors(getFieldErrors(result.error.issues)); return; }
      setErrors({});
      updateMutation.mutate({ id: user.id, data: result.data }, { onSuccess: onClose });
    } else {
      const result = createUserSchema.safeParse({ ...form, email: form.email.trim(), password });
      if (!result.success) { setErrors(getFieldErrors(result.error.issues)); return; }
      setErrors({});
      createMutation.mutate(result.data, { onSuccess: onClose });
    }
  };

  return <FormDialog id="user-form-title" title={user ? `Editar a ${user.nombre}` : 'Nuevo usuario'}
    code={user ? `@${user.username}` : 'Cuenta de acceso'} context="Identidad y rol operativo"
    submitLabel={user ? 'Guardar cambios' : 'Crear usuario'} dirty={dirty}
    pending={mutation.isPending} onClose={onClose} onSubmit={submit}
    submitDisabled={roles.length === 0 || Boolean(user && !dirty)}
    headerVariant="plain"
    className="administration-form reference-form-dialog">
    {mutation.isError && <div className="administration-alert" role="alert">
      <AlertCircle aria-hidden="true" />{getApiErrorMessage(mutation.error, 'No fue posible guardar el usuario.')}
    </div>}
    <div className="administration-form-grid">
      <label className="administration-wide" htmlFor="account-name">Nombre completo
        <input id="account-name" value={form.nombre} onChange={(event) => setField('nombre', event.target.value)}
          autoComplete="name" maxLength={120} aria-invalid={Boolean(errors.nombre)} aria-describedby={errors.nombre ? 'account-name-error' : undefined} autoFocus />
        {errors.nombre && <span id="account-name-error" className="administration-field-error">{errors.nombre}</span>}
      </label>
      <label htmlFor="account-username">Nombre de usuario
        <input id="account-username" value={form.username} onChange={(event) => setField('username', event.target.value.toLowerCase())}
          autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={50} placeholder="ej. jperez"
          aria-invalid={Boolean(errors.username)} aria-describedby={errors.username ? 'account-username-error' : undefined} />
        {errors.username && <span id="account-username-error" className="administration-field-error">{errors.username}</span>}
      </label>
      <label htmlFor="account-role">Rol
        <select id="account-role" value={form.roleId} onChange={(event) => setField('roleId', event.target.value)}
          aria-invalid={Boolean(errors.roleId)} aria-describedby={errors.roleId ? 'account-role-error' : undefined}>
          {roles.map((role) => <option key={role.id} value={role.id}>{getRoleLabel(role.nombre)}</option>)}
        </select>
        {errors.roleId && <span id="account-role-error" className="administration-field-error">{errors.roleId}</span>}
      </label>
      <label className="administration-wide" htmlFor="account-email">Correo electrónico
        <input id="account-email" type="email" value={form.email} onChange={(event) => setField('email', event.target.value)}
          autoComplete="email" autoCapitalize="none" maxLength={254} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'account-email-error' : undefined} />
        {errors.email && <span id="account-email-error" className="administration-field-error">{errors.email}</span>}
      </label>
      {!user && <div className="administration-wide administration-password-field"><label htmlFor="account-password">Contraseña temporal</label>
        <span className="administration-password">
          <input id="account-password" type={showPassword ? 'text' : 'password'} value={password}
            onChange={(event) => { setPassword(event.target.value); setErrors((current) => ({ ...current, password: '' })); }}
            autoComplete="new-password" maxLength={100} placeholder="Mínimo 8 caracteres"
            aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'account-password-error' : undefined} />
          <button type="button" onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? 'Ocultar contraseña temporal' : 'Mostrar contraseña temporal'} aria-pressed={showPassword}>
            {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </button>
        </span>
        {errors.password && <span id="account-password-error" className="administration-field-error">{errors.password}</span>}
      </div>}
    </div>
    {selectedRole?.descripcion && <p className="administration-form-note"><strong>{getRoleLabel(selectedRole.nombre)}</strong>{selectedRole.descripcion}</p>}
    {user && form.roleId !== initial.roleId && <p className="administration-notice">El cambio de rol actualizará el acceso de esta cuenta.</p>}
  </FormDialog>;
};

export default UserFormModal;
