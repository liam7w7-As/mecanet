import { AlertCircle, CircleCheck, Eye, Pencil, Plus, Power, Search, ShieldCheck, Trash2, UserCog, UserRoundX, UsersRound, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import FormDialog from '../../components/common/FormDialog';
import ListExportButtons from '../../components/common/ListExportButtons';
import Pagination from '../../components/common/Pagination';
import UserAvatar from '../../components/common/UserAvatar';
import RolePermissionsPanel from '../../components/users/RolePermissionsPanel';
import UserDetailModal from '../../components/users/UserDetailModal';
import UserFormModal from '../../components/users/UserFormModal';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useDeleteUserMutation, useRoles, useToggleUserStatusMutation, useUsers } from '../../hooks/useUsers';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatDate } from '../../lib/formatters';
import { getRoleLabel, hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';

import type { AdminUser } from '../../hooks/useUsers';

type ViewTab = 'accounts' | 'permissions';
type StatusFilter = 'all' | 'active' | 'inactive';

export const UsersPage = () => {
  const currentUser = useAuthStore((state) => state.user);
  const [view, setView] = useState<ViewTab>('accounts');
  const [openedPermissions, setOpenedPermissions] = useState(false);
  const [search, setSearch] = useState('');
  const [roleId, setRoleId] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [formUser, setFormUser] = useState<AdminUser | null | undefined>(undefined);
  const [detailUser, setDetailUser] = useState<AdminUser | null>(null);
  const [statusTarget, setStatusTarget] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const debouncedSearch = useDebouncedValue(search, 350);
  const queryParams = { page, pageSize: 20, search: debouncedSearch || undefined,
    roleId: roleId === 'all' ? undefined : Number(roleId), activo: status === 'all' ? undefined : status === 'active' };
  const usersQuery = useUsers(queryParams);
  const rolesQuery = useRoles();
  const statusMutation = useToggleUserStatusMutation();
  const deleteMutation = useDeleteUserMutation();
  const canCreate = Boolean(currentUser && hasUserPermission(currentUser, 'admin', 'create'));
  const canUpdate = Boolean(currentUser && hasUserPermission(currentUser, 'admin', 'update'));
  const canDelete = Boolean(currentUser && hasUserPermission(currentUser, 'admin', 'delete'));
  const queryError = usersQuery.error ?? rolesQuery.error;
  const filtersActive = search !== '' || roleId !== 'all' || status !== 'all';
  useEffect(() => setPage(1), [debouncedSearch, roleId, status]);

  const resetFilters = (): void => { setSearch(''); setRoleId('all'); setStatus('all'); setPage(1); };
  const statusFilters = [
    { value: 'all' as const, label: 'Todos', icon: UsersRound },
    { value: 'active' as const, label: 'Activos', icon: CircleCheck },
    { value: 'inactive' as const, label: 'Inactivos', icon: UserRoundX },
  ];

  return <div className="workspace-page workspace-users administration-page">
    <header className="administration-heading"><h1>Usuarios</h1><p>Equipo, roles y acceso</p></header>
    <div className="administration-tabs" role="tablist" aria-label="Administración de acceso">
      <button type="button" role="tab" aria-selected={view === 'accounts'} aria-controls="accounts-panel"
        id="accounts-tab" onClick={() => setView('accounts')}><UsersRound aria-hidden="true" />Cuentas</button>
      <button type="button" role="tab" aria-selected={view === 'permissions'} aria-controls="permissions-panel"
        id="permissions-tab" onClick={() => { setOpenedPermissions(true); setView('permissions'); }}><ShieldCheck aria-hidden="true" />Permisos por rol</button>
    </div>
    <div id="accounts-panel" role="tabpanel" aria-labelledby="accounts-tab" hidden={view !== 'accounts'} className="administration-accounts">
      <div className="administration-toolbar">
        <label className="administration-search"><Search aria-hidden="true" /><span className="sr-only">Buscar usuarios</span>
          <input type="search" aria-label="Buscar usuarios" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, usuario o correo" />
          {search && <button type="button" onClick={() => setSearch('')} aria-label="Limpiar búsqueda de usuarios"><X aria-hidden="true" /></button>}
        </label>
        <label className="administration-role-filter"><span className="sr-only">Filtrar por rol</span>
          <select value={roleId} onChange={(event) => setRoleId(event.target.value)} disabled={rolesQuery.isPending || rolesQuery.isError}>
            <option value="all">Todos los roles</option>
            {rolesQuery.data?.map((role) => <option key={role.id} value={role.id}>{getRoleLabel(role.nombre)}</option>)}
          </select>
        </label>
        {canCreate && <button type="button" className="administration-primary" onClick={() => setFormUser(null)}
          disabled={rolesQuery.isPending || !rolesQuery.data?.length}><Plus aria-hidden="true" />Nuevo usuario</button>}
      </div>
      <div className="administration-filter-row"><nav className="administration-filter-pills" aria-label="Filtrar usuarios por estado">
        {statusFilters.map(({ value, label, icon: Icon }) => <button key={value} type="button" aria-pressed={status === value}
          onClick={() => setStatus(value)}><Icon aria-hidden="true" />{label}</button>)}
      </nav>{filtersActive && <button type="button" className="administration-clear" onClick={resetFilters}>Limpiar filtros</button>}</div>
      <ListExportButtons target="users" filters={queryParams} disabled={usersQuery.isPending || usersQuery.isError} className="flex flex-wrap justify-end gap-2" />
      {queryError && <div className="administration-alert" role="alert"><AlertCircle aria-hidden="true" />
        {getApiErrorMessage(queryError, 'No fue posible cargar los usuarios o roles.')}
        <button type="button" onClick={() => { void usersQuery.refetch(); void rolesQuery.refetch(); }}>Reintentar</button>
      </div>}
      <p className="administration-result-count" aria-live="polite">{usersQuery.data?.meta.total ?? 0} usuarios{usersQuery.isFetching && !usersQuery.isPending ? ' · Actualizando…' : ''}</p>
      <section className="administration-directory" aria-label="Listado de usuarios" aria-busy={usersQuery.isPending}>
        {usersQuery.isPending ? <div aria-label="Cargando usuarios" role="status">{Array.from({ length: 5 }, (_, row) =>
          <div key={row} className="administration-row-skeleton animate-pulse"><span /><span /><span /></div>)}</div> :
          usersQuery.data?.data.map((user) => {
            const isSelf = currentUser?.id === user.id;
            return <article key={user.id} className="administration-user-row" aria-label={user.nombre}>
              <button type="button" className="administration-user-identity" onClick={() => setDetailUser(user)} aria-label={`Ver ${user.nombre}`}>
                <UserAvatar user={user} size="sm" /><span><strong>{user.nombre}{isSelf && <em>Tu cuenta</em>}</strong>
                  <small>@{user.username}</small><small>{user.email}</small></span>
              </button>
              <div className="administration-user-role"><small>Rol</small><strong>{getRoleLabel(user.role.nombre)}</strong></div>
              <div className="administration-user-state"><span className={`administration-status ${user.activo ? 'is-active' : 'is-inactive'}`}>{user.activo ? 'Activo' : 'Inactivo'}</span><small>Desde {formatDate(user.createdAt)}</small></div>
              <div className="administration-row-actions">
                <button type="button" onClick={() => setDetailUser(user)} aria-label={`Detalle de ${user.nombre}`} title="Ver detalle"><Eye aria-hidden="true" /></button>
                {canUpdate && <><button type="button" onClick={() => setFormUser(user)} aria-label={`Editar ${user.nombre}`} title="Editar"><Pencil aria-hidden="true" /></button>
                  <button type="button" onClick={() => { statusMutation.reset(); setStatusTarget(user); }} disabled={isSelf && user.activo}
                    aria-label={`${user.activo ? 'Desactivar' : 'Activar'} ${user.nombre}`}
                    title={isSelf && user.activo ? 'No puede desactivar su propia cuenta' : user.activo ? 'Desactivar' : 'Activar'}><Power aria-hidden="true" /></button></>}
                {canDelete && <button type="button" className="administration-danger-action" onClick={() => { deleteMutation.reset(); setDeleteTarget(user); }}
                  disabled={isSelf} aria-label={`Eliminar ${user.nombre}`} title={isSelf ? 'No puede eliminar su propia cuenta' : 'Eliminar'}><Trash2 aria-hidden="true" /></button>}
              </div>
            </article>;
          })}
        {!usersQuery.isPending && !usersQuery.isError && usersQuery.data?.data.length === 0 && <div className="administration-empty"><UserCog aria-hidden="true" />
          <h2>No se encontraron usuarios</h2><p>Prueba otro nombre o cambia los filtros.</p>{filtersActive && <button type="button" onClick={resetFilters}>Limpiar filtros</button>}
        </div>}
      </section>
      <Pagination page={page} totalPages={usersQuery.data?.meta.totalPages ?? 0} total={usersQuery.data?.meta.total ?? 0} onPageChange={setPage} />
    </div>
    <div id="permissions-panel" role="tabpanel" aria-labelledby="permissions-tab" hidden={view !== 'permissions'}>
      {openedPermissions && (rolesQuery.data?.length ? <RolePermissionsPanel roles={rolesQuery.data} canUpdate={canUpdate} /> :
        <div className="administration-empty" role={rolesQuery.isError ? 'alert' : 'status'}><ShieldCheck aria-hidden="true" />
          <p>{rolesQuery.isError ? getApiErrorMessage(rolesQuery.error, 'No fue posible cargar los roles.') : rolesQuery.isPending ? 'Cargando roles…' : 'No hay roles disponibles.'}</p>
          {rolesQuery.isError && <button type="button" onClick={() => void rolesQuery.refetch()}>Reintentar</button>}
        </div>)}
    </div>
    {detailUser && <UserDetailModal user={detailUser} canEdit={canUpdate} onClose={() => setDetailUser(null)} onEdit={() => { setFormUser(detailUser); setDetailUser(null); }} />}
    {formUser !== undefined && rolesQuery.data && <UserFormModal key={formUser?.id ?? 'new'} user={formUser} roles={rolesQuery.data} onClose={() => setFormUser(undefined)} />}
    {statusTarget && <FormDialog id="status-user-title" title={statusTarget.activo ? 'Desactivar cuenta' : 'Activar cuenta'}
      code={`@${statusTarget.username}`} context={statusTarget.nombre} dirty={false} pending={statusMutation.isPending}
      submitLabel={statusTarget.activo ? 'Desactivar cuenta' : 'Activar cuenta'} headerVariant="plain" headerIcon={<Power aria-hidden="true" />}
      className="administration-form administration-confirm" statusText="Confirmación de acceso" onClose={() => setStatusTarget(null)}
      onSubmit={(event) => { event.preventDefault(); if (!statusMutation.isPending) statusMutation.mutate({ id: statusTarget.id, activo: !statusTarget.activo }, { onSuccess: () => setStatusTarget(null) }); }}>
      <p>{statusTarget.activo ? `Se cerrarán las sesiones de ${statusTarget.nombre}. La cuenta no podrá ingresar hasta que se reactive.` : `${statusTarget.nombre} recuperará el acceso con su rol actual.`}</p>
      {statusMutation.error && <p className="administration-alert" role="alert">{getApiErrorMessage(statusMutation.error)}</p>}
    </FormDialog>}
    {deleteTarget && <FormDialog id="delete-user-title" title="Eliminar usuario" code={`@${deleteTarget.username}`} context={deleteTarget.nombre}
      dirty={false} pending={deleteMutation.isPending} submitLabel="Eliminar usuario" headerVariant="plain" headerIcon={<Trash2 aria-hidden="true" />}
      className="administration-form administration-confirm administration-confirm-danger" statusText="Eliminación con historial conservado"
      onClose={() => setDeleteTarget(null)} onSubmit={(event) => { event.preventDefault(); if (!deleteMutation.isPending) deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) }); }}>
      <p>La cuenta de <strong>{deleteTarget.nombre}</strong> quedará inactiva y se cerrarán todas sus sesiones. El registro se conservará para auditoría.</p>
      {deleteMutation.error && <p className="administration-alert" role="alert">{getApiErrorMessage(deleteMutation.error)}</p>}
    </FormDialog>}
  </div>;
};

export default UsersPage;
