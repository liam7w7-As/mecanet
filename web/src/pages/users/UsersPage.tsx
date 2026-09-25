import {
  AlertCircle,
  Pencil,
  Plus,
  Power,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  UsersRound,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';

import { AnimateIcon, AnimatedTableRow } from '../../components/animate-ui';
import Pagination from '../../components/common/Pagination';
import RolePermissionsPanel from '../../components/users/RolePermissionsPanel';
import UserFormModal from '../../components/users/UserFormModal';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import {
  useDeleteUserMutation,
  useRoles,
  useToggleUserStatusMutation,
  useUsers,
} from '../../hooks/useUsers';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatDate } from '../../lib/formatters';
import { getRoleLabel, hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';

import type { AdminUser } from '../../hooks/useUsers';

type ViewTab = 'accounts' | 'permissions';
type StatusFilter = 'all' | 'active' | 'inactive';

const roleStyles: Record<AdminUser['role']['nombre'], string> = {
  desarrollador: 'bg-violet-100 text-violet-800',
  admin: 'bg-blue-100 text-brand-blue',
  jefe: 'bg-cyan-100 text-cyan-900',
  mecanico: 'bg-sky-100 text-sky-800',
  vendedor: 'bg-emerald-100 text-emerald-800',
  bodeguero: 'bg-amber-100 text-amber-800',
  finanzas: 'bg-fuchsia-100 text-fuchsia-800',
};

const UsersSkeleton = () => (
  <>
    {Array.from({ length: 6 }, (_, row) => (
      <tr key={row} className="border-b border-slate-100">
        {Array.from({ length: 5 }, (_, cell) => (
          <td key={cell} className="px-4 py-4"><div className="h-4 animate-pulse rounded bg-slate-100" /></td>
        ))}
      </tr>
    ))}
  </>
);

export const UsersPage = () => {
  const currentUser = useAuthStore((state) => state.user);
  const [view, setView] = useState<ViewTab>('accounts');
  const [search, setSearch] = useState('');
  const [roleId, setRoleId] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [formUser, setFormUser] = useState<AdminUser | null | undefined>(undefined);
  const [statusTarget, setStatusTarget] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const debouncedSearch = useDebouncedValue(search, 350);
  const usersQuery = useUsers({
    page,
    pageSize: 20,
    search: debouncedSearch || undefined,
    roleId: roleId === 'all' ? undefined : Number(roleId),
    activo: status === 'all' ? undefined : status === 'active',
  });
  const rolesQuery = useRoles();
  const statusMutation = useToggleUserStatusMutation();
  const deleteMutation = useDeleteUserMutation();
  const canCreate = Boolean(currentUser && hasUserPermission(currentUser, 'admin', 'create'));
  const canUpdate = Boolean(currentUser && hasUserPermission(currentUser, 'admin', 'update'));
  const canDelete = Boolean(currentUser && hasUserPermission(currentUser, 'admin', 'delete'));

  useEffect(() => setPage(1), [debouncedSearch, roleId, status]);

  const changeStatus = (): void => {
    if (!statusTarget) return;
    statusMutation.mutate(
      { id: statusTarget.id, activo: !statusTarget.activo },
      { onSuccess: () => setStatusTarget(null) },
    );
  };

  const deleteUser = (): void => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
  };

  const queryError = usersQuery.error ?? rolesQuery.error;
  const actionError = statusMutation.error ?? deleteMutation.error;

  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Seguridad y acceso</p>
          <h1 className="mt-1 text-2xl font-bold text-brand-blue sm:text-3xl">Usuarios y permisos</h1>
        </div>
        {view === 'accounts' && canCreate && (
          <button
            type="button"
            className="group inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-yellow px-4 text-sm font-bold text-brand-dark shadow-sm transition-all hover:bg-yellow-400 hover:shadow-md active:scale-95 disabled:opacity-50"
            onClick={() => setFormUser(null)}
            disabled={rolesQuery.isPending}
          >
            <AnimateIcon icon={Plus} animation="spin" size={16} />Nuevo usuario
          </button>
        )}
      </header>

      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1" role="tablist" aria-label="Administración de acceso">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'accounts'}
          className={`relative inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors ${
            view === 'accounts' ? 'text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
          onClick={() => setView('accounts')}
        >
          {view === 'accounts' && (
            <motion.span
              layoutId="userViewIndicator"
              className="absolute inset-0 rounded-md bg-brand-blue"
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-2">
            <AnimateIcon icon={UsersRound} animation="pulse" size={16} />Cuentas
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'permissions'}
          className={`relative inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors ${
            view === 'permissions' ? 'text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
          onClick={() => setView('permissions')}
        >
          {view === 'permissions' && (
            <motion.span
              layoutId="userViewIndicator"
              className="absolute inset-0 rounded-md bg-brand-blue"
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-2">
            <AnimateIcon icon={ShieldCheck} animation="wiggle" size={16} />Permisos por rol
          </span>
        </button>
      </div>

      {view === 'accounts' ? (
        <section className="overflow-hidden border border-slate-200 bg-white" aria-label="Listado de usuarios">
          <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[minmax(240px,1fr)_220px_180px]">
            <label className="relative block">
              <span className="sr-only">Buscar usuarios</span>
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
              <input className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, usuario o correo" aria-label="Buscar usuarios" />
            </label>
            <label className="sr-only" htmlFor="user-role-filter">Filtrar por rol</label>
            <select id="user-role-filter" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700" value={roleId} onChange={(event) => setRoleId(event.target.value)}>
              <option value="all">Todos los roles</option>
              {rolesQuery.data?.map((role) => <option key={role.id} value={role.id}>{getRoleLabel(role.nombre)}</option>)}
            </select>
            <label className="sr-only" htmlFor="user-status-filter">Filtrar por estado</label>
            <select id="user-status-filter" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
              <option value="all">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
          </div>

          {(queryError || actionError) && (
            <div className="flex items-start gap-2 border-b border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {getApiErrorMessage(queryError ?? actionError, 'No fue posible completar la operación.')}
            </div>
          )}

          <div className="max-w-full overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-brand-blue text-xs uppercase text-white"><tr><th className="px-4 py-3 font-semibold">Usuario</th><th className="px-4 py-3 font-semibold">Rol</th><th className="px-4 py-3 font-semibold">Estado</th><th className="px-4 py-3 font-semibold">Creado</th><th className="px-4 py-3 text-right font-semibold">Acciones</th></tr></thead>
              <tbody>
                {usersQuery.isPending ? <UsersSkeleton /> : usersQuery.data?.data.map((user, index) => {
                  const isSelf = currentUser?.id === user.id;
                  return (
                    <AnimatedTableRow key={user.id} index={index} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3"><span className="block font-semibold text-slate-900">{user.nombre}{isSelf && <span className="ml-2 text-xs font-medium text-slate-400">Tu cuenta</span>}</span><span className="block text-xs text-slate-500">@{user.username} · {user.email}</span></td>
                      <td className="px-4 py-3"><span className={`inline-flex rounded px-2 py-1 text-xs font-semibold ${roleStyles[user.role.nombre]}`}>{getRoleLabel(user.role.nombre)}</span></td>
                      <td className="px-4 py-3"><span className={`inline-flex rounded px-2 py-1 text-xs font-semibold ${user.activo ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>{user.activo ? 'Activo' : 'Inactivo'}</span></td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(user.createdAt)}</td>
                      <td className="px-4 py-3"><div className="flex justify-end gap-1">
                        {canUpdate && (
                          <button
                            type="button"
                            className="group flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-amber-50 hover:text-amber-700 transition-colors"
                            onClick={() => setFormUser(user)}
                            aria-label={`Editar ${user.nombre}`}
                            title="Editar"
                          >
                            <AnimateIcon icon={Pencil} animation="wiggle" size={16} />
                          </button>
                        )}
                        {canUpdate && (
                          <button
                            type="button"
                            className="group flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-blue-50 hover:text-brand-blue transition-colors disabled:cursor-not-allowed disabled:opacity-30"
                            onClick={() => { statusMutation.reset(); setStatusTarget(user); }}
                            disabled={isSelf && user.activo}
                            aria-label={`${user.activo ? 'Desactivar' : 'Activar'} ${user.nombre}`}
                            title={isSelf && user.activo ? 'No puede desactivar su propia cuenta' : user.activo ? 'Desactivar' : 'Activar'}
                          >
                            <AnimateIcon icon={Power} animation="spin" size={16} />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            className="group flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700 transition-colors disabled:cursor-not-allowed disabled:opacity-30"
                            onClick={() => { deleteMutation.reset(); setDeleteTarget(user); }}
                            disabled={isSelf}
                            aria-label={`Eliminar ${user.nombre}`}
                            title={isSelf ? 'No puede eliminar su propia cuenta' : 'Eliminar'}
                          >
                            <AnimateIcon icon={Trash2} animation="bounce" size={16} />
                          </button>
                        )}
                      </div></td>
                    </AnimatedTableRow>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!usersQuery.isPending && usersQuery.data?.data.length === 0 && (
            <div className="flex min-h-52 flex-col items-center justify-center px-4 text-center">
              <AnimateIcon icon={UserCog} animation="bounce" size={40} className="text-slate-300" />
              <p className="mt-3 font-semibold text-slate-700">No se encontraron usuarios</p>
              <p className="mt-1 text-sm text-slate-500">Cambie los filtros o registre una nueva cuenta.</p>
            </div>
          )}
          <Pagination page={page} totalPages={usersQuery.data?.meta.totalPages ?? 0} total={usersQuery.data?.meta.total ?? 0} onPageChange={setPage} />
        </section>
      ) : rolesQuery.data && rolesQuery.data.length > 0 ? (
        <RolePermissionsPanel roles={rolesQuery.data} canUpdate={canUpdate} />
      ) : (
        <div className="flex min-h-64 items-center justify-center border border-slate-200 bg-white text-sm text-slate-500">Cargando roles...</div>
      )}

      {formUser !== undefined && rolesQuery.data && <UserFormModal user={formUser} roles={rolesQuery.data} onClose={() => setFormUser(undefined)} />}

      <AnimatePresence>
        {statusTarget && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-4 sm:items-center sm:py-6">
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/55"
              aria-label="Cancelar cambio de estado"
              onClick={() => setStatusTarget(null)}
            />
            <motion.section
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="status-user-title"
            >
              <h2 id="status-user-title" className="text-lg font-semibold text-brand-blue">{statusTarget.activo ? 'Desactivar' : 'Activar'} cuenta</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{statusTarget.activo ? `La sesión de ${statusTarget.nombre} se cerrará y no podrá ingresar hasta que la cuenta se reactive.` : `${statusTarget.nombre} recuperará el acceso con su rol actual.`}</p>
              {statusMutation.error && <p className="mt-3 text-sm text-red-700" role="alert">{getApiErrorMessage(statusMutation.error)}</p>}
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors" onClick={() => setStatusTarget(null)}>Cancelar</button>
                <button type="button" className={`h-10 rounded-lg px-4 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${statusTarget.activo ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-blue hover:bg-brand-dark'}`} onClick={changeStatus} disabled={statusMutation.isPending}>{statusMutation.isPending ? 'Guardando...' : statusTarget.activo ? 'Desactivar cuenta' : 'Activar cuenta'}</button>
              </div>
            </motion.section>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-4 sm:items-center sm:py-6">
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/55"
              aria-label="Cancelar eliminación"
              onClick={() => setDeleteTarget(null)}
            />
            <motion.section
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-user-title"
            >
              <h2 id="delete-user-title" className="text-lg font-semibold text-brand-blue">Eliminar usuario</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">La cuenta de {deleteTarget.nombre} quedará inactiva y se cerrarán todas sus sesiones. El registro se conservará para auditoría.</p>
              {deleteMutation.error && <p className="mt-3 text-sm text-red-700" role="alert">{getApiErrorMessage(deleteMutation.error)}</p>}
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors" onClick={() => setDeleteTarget(null)}>Cancelar</button>
                <button type="button" className="h-10 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-60" onClick={deleteUser} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? 'Eliminando...' : 'Eliminar usuario'}</button>
              </div>
            </motion.section>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UsersPage;
