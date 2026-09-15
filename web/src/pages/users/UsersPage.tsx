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
import { useEffect, useState } from 'react';

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
  vendedor: 'bg-emerald-100 text-emerald-800',
  bodeguero: 'bg-amber-100 text-amber-800',
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
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Seguridad y acceso</p>
          <h1 className="mt-1 text-2xl font-bold text-brand-blue sm:text-3xl">Usuarios y permisos</h1>
        </div>
        {view === 'accounts' && canCreate && (
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-yellow px-4 text-sm font-bold text-brand-dark hover:bg-yellow-400 disabled:opacity-50"
            onClick={() => setFormUser(null)}
            disabled={rolesQuery.isPending}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />Nuevo usuario
          </button>
        )}
      </header>

      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1" role="tablist" aria-label="Administración de acceso">
        <button type="button" role="tab" aria-selected={view === 'accounts'} className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold ${view === 'accounts' ? 'bg-brand-blue text-white' : 'text-slate-600 hover:bg-slate-100'}`} onClick={() => setView('accounts')}><UsersRound className="h-4 w-4" aria-hidden="true" />Cuentas</button>
        <button type="button" role="tab" aria-selected={view === 'permissions'} className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold ${view === 'permissions' ? 'bg-brand-blue text-white' : 'text-slate-600 hover:bg-slate-100'}`} onClick={() => setView('permissions')}><ShieldCheck className="h-4 w-4" aria-hidden="true" />Permisos por rol</button>
      </div>

      {view === 'accounts' ? (
        <section className="overflow-hidden border border-slate-200 bg-white" aria-label="Listado de usuarios">
          <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[minmax(240px,1fr)_220px_180px]">
            <label className="relative block">
              <span className="sr-only">Buscar usuarios</span>
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
              <input className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre o correo" aria-label="Buscar usuarios" />
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

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-brand-blue text-xs uppercase text-white"><tr><th className="px-4 py-3 font-semibold">Usuario</th><th className="px-4 py-3 font-semibold">Rol</th><th className="px-4 py-3 font-semibold">Estado</th><th className="px-4 py-3 font-semibold">Creado</th><th className="px-4 py-3 text-right font-semibold">Acciones</th></tr></thead>
              <tbody>
                {usersQuery.isPending ? <UsersSkeleton /> : usersQuery.data?.data.map((user) => {
                  const isSelf = currentUser?.id === user.id;
                  return (
                    <tr key={user.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                      <td className="px-4 py-3"><span className="block font-semibold text-slate-900">{user.nombre}{isSelf && <span className="ml-2 text-xs font-medium text-slate-400">Tu cuenta</span>}</span><span className="block text-xs text-slate-500">{user.email}</span></td>
                      <td className="px-4 py-3"><span className={`inline-flex rounded px-2 py-1 text-xs font-semibold ${roleStyles[user.role.nombre]}`}>{getRoleLabel(user.role.nombre)}</span></td>
                      <td className="px-4 py-3"><span className={`inline-flex rounded px-2 py-1 text-xs font-semibold ${user.activo ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>{user.activo ? 'Activo' : 'Inactivo'}</span></td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(user.createdAt)}</td>
                      <td className="px-4 py-3"><div className="flex justify-end gap-1">
                        {canUpdate && <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-amber-50 hover:text-amber-700" onClick={() => setFormUser(user)} aria-label={`Editar ${user.nombre}`} title="Editar"><Pencil className="h-4 w-4" aria-hidden="true" /></button>}
                        {canUpdate && <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-blue-50 hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-30" onClick={() => { statusMutation.reset(); setStatusTarget(user); }} disabled={isSelf && user.activo} aria-label={`${user.activo ? 'Desactivar' : 'Activar'} ${user.nombre}`} title={isSelf && user.activo ? 'No puede desactivar su propia cuenta' : user.activo ? 'Desactivar' : 'Activar'}><Power className="h-4 w-4" aria-hidden="true" /></button>}
                        {canDelete && <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-30" onClick={() => { deleteMutation.reset(); setDeleteTarget(user); }} disabled={isSelf} aria-label={`Eliminar ${user.nombre}`} title={isSelf ? 'No puede eliminar su propia cuenta' : 'Eliminar'}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!usersQuery.isPending && usersQuery.data?.data.length === 0 && (
            <div className="flex min-h-52 flex-col items-center justify-center px-4 text-center"><UserCog className="h-10 w-10 text-slate-300" aria-hidden="true" /><p className="mt-3 font-semibold text-slate-700">No se encontraron usuarios</p><p className="mt-1 text-sm text-slate-500">Cambie los filtros o registre una nueva cuenta.</p></div>
          )}
          <Pagination page={page} totalPages={usersQuery.data?.meta.totalPages ?? 0} total={usersQuery.data?.meta.total ?? 0} onPageChange={setPage} />
        </section>
      ) : rolesQuery.data && rolesQuery.data.length > 0 ? (
        <RolePermissionsPanel roles={rolesQuery.data} canUpdate={canUpdate} />
      ) : (
        <div className="flex min-h-64 items-center justify-center border border-slate-200 bg-white text-sm text-slate-500">Cargando roles...</div>
      )}

      {formUser !== undefined && rolesQuery.data && <UserFormModal user={formUser} roles={rolesQuery.data} onClose={() => setFormUser(undefined)} />}

      {statusTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button type="button" className="absolute inset-0 bg-slate-950/55" aria-label="Cancelar cambio de estado" onClick={() => setStatusTarget(null)} />
          <section className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="status-user-title">
            <h2 id="status-user-title" className="text-lg font-semibold text-brand-blue">{statusTarget.activo ? 'Desactivar' : 'Activar'} cuenta</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{statusTarget.activo ? `La sesión de ${statusTarget.nombre} se cerrará y no podrá ingresar hasta que la cuenta se reactive.` : `${statusTarget.nombre} recuperará el acceso con su rol actual.`}</p>
            {statusMutation.error && <p className="mt-3 text-sm text-red-700" role="alert">{getApiErrorMessage(statusMutation.error)}</p>}
            <div className="mt-5 flex justify-end gap-2"><button type="button" className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700" onClick={() => setStatusTarget(null)}>Cancelar</button><button type="button" className={`h-10 rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-60 ${statusTarget.activo ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-blue hover:bg-brand-dark'}`} onClick={changeStatus} disabled={statusMutation.isPending}>{statusMutation.isPending ? 'Guardando...' : statusTarget.activo ? 'Desactivar cuenta' : 'Activar cuenta'}</button></div>
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button type="button" className="absolute inset-0 bg-slate-950/55" aria-label="Cancelar eliminación" onClick={() => setDeleteTarget(null)} />
          <section className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="delete-user-title">
            <h2 id="delete-user-title" className="text-lg font-semibold text-brand-blue">Eliminar usuario</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">La cuenta de {deleteTarget.nombre} quedará inactiva y se cerrarán todas sus sesiones. El registro se conservará para auditoría.</p>
            {deleteMutation.error && <p className="mt-3 text-sm text-red-700" role="alert">{getApiErrorMessage(deleteMutation.error)}</p>}
            <div className="mt-5 flex justify-end gap-2"><button type="button" className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700" onClick={() => setDeleteTarget(null)}>Cancelar</button><button type="button" className="h-10 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60" onClick={deleteUser} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? 'Eliminando...' : 'Eliminar usuario'}</button></div>
          </section>
        </div>
      )}
    </div>
  );
};

export default UsersPage;
