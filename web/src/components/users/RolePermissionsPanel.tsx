import { MODULES, updateRolePermissionsSchema } from '@unithor/shared';
import { AlertCircle, CheckCheck, Coins, Layers, LoaderCircle, Package, RotateCcw, Save, Shield, ShieldCheck, ShoppingCart, Truck, UserCheck, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { usePermissions, useRolePermissions, useUpdateRolePermissionsMutation } from '../../hooks/useUsers';
import { getApiErrorMessage } from '../../lib/api-error';
import { ACTION_LABELS, getRoleLabel, MODULE_LABELS } from '../../lib/permissions';

import type { RoleOption } from '../../hooks/useUsers';
import type { Module } from '@unithor/shared';

interface RolePermissionsPanelProps { roles: RoleOption[]; canUpdate: boolean }

const MODULE_ICONS: Record<Module, typeof Layers> = {
  taller: Wrench, comercial: UserCheck, finanzas: Coins, flota: Truck, almacen: Package, compras: ShoppingCart, admin: Shield,
};
const ROLE_ICONS: Record<string, typeof Shield> = {
  admin: ShieldCheck, desarrollador: Shield, jefe: Wrench, vendedor: UserCheck, mecanico: Wrench, bodeguero: Package, finanzas: Coins,
};

export const RolePermissionsPanel = ({ roles, canUpdate }: RolePermissionsPanelProps) => {
  const initialRole = roles.find((role) => role.nombre === 'admin') ?? roles[0];
  const [roleId, setRoleId] = useState<number | null>(initialRole?.id ?? null);
  const [draft, setDraft] = useState<Set<number> | null>(null);
  const [requestedRole, setRequestedRole] = useState<RoleOption | null>(null);
  const permissionsQuery = usePermissions();
  const assignedQuery = useRolePermissions(roleId);
  const updateMutation = useUpdateRolePermissionsMutation();
  const assignedIds = useMemo(() => new Set(assignedQuery.data?.map((permission) => permission.id) ?? []), [assignedQuery.data]);
  const selectedIds = draft ?? assignedIds;
  const dirty = draft !== null && (draft.size !== assignedIds.size || [...draft].some((id) => !assignedIds.has(id)));
  const selectedRole = roles.find((role) => role.id === roleId) ?? null;
  const isProtectedRole = selectedRole?.nombre === 'desarrollador' || selectedRole?.nombre === 'admin';
  const loading = permissionsQuery.isPending || assignedQuery.isPending;
  const loadError = permissionsQuery.error ?? assignedQuery.error;
  const locked = isProtectedRole || !canUpdate || updateMutation.isPending || loading || Boolean(loadError);
  const displayedIds = isProtectedRole ? new Set(permissionsQuery.data?.map((permission) => permission.id) ?? []) : selectedIds;
  const totalAvailable = permissionsQuery.data?.length ?? 0;
  const groupedPermissions = MODULES.map((module) => [module, permissionsQuery.data?.filter((permission) => permission.modulo === module) ?? []] as const)
    .filter(([, permissions]) => permissions.length > 0);

  useEffect(() => {
    if (!dirty && !updateMutation.isPending) return undefined;
    const warn = (event: BeforeUnloadEvent): void => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, updateMutation.isPending]);

  const selectRole = (role: RoleOption): void => {
    updateMutation.reset(); setDraft(null); setRoleId(role.id); setRequestedRole(null);
  };
  const requestRole = (role: RoleOption): void => {
    if (updateMutation.isPending || role.id === roleId) return;
    if (dirty) setRequestedRole(role); else selectRole(role);
  };
  const togglePermission = (permissionId: number): void => {
    if (locked) return;
    updateMutation.reset();
    const next = new Set(selectedIds);
    if (next.has(permissionId)) next.delete(permissionId); else next.add(permissionId);
    setDraft(next);
  };
  const toggleModule = (ids: number[]): void => {
    if (locked) return;
    updateMutation.reset();
    const next = new Set(selectedIds);
    const allSelected = ids.every((id) => selectedIds.has(id));
    ids.forEach((id) => { if (allSelected) next.delete(id); else next.add(id); });
    setDraft(next);
  };
  const save = (): void => {
    if (locked || !dirty) return;
    const parsed = updateRolePermissionsSchema.safeParse({ roleId, permissionIds: [...selectedIds].sort((a, b) => a - b) });
    if (parsed.success) updateMutation.mutate(parsed.data, { onSuccess: () => setDraft(null) });
  };

  return <section className="administration-permissions" aria-labelledby="permission-matrix-title" aria-busy={updateMutation.isPending}>
    <header className="administration-panel-heading"><ShieldCheck aria-hidden="true" /><div><h2 id="permission-matrix-title">Matriz dinámica de permisos</h2>
      <p>Selecciona un rol y revisa su acceso a cada área.</p></div></header>
    <div className="administration-permission-content">
      <div className="administration-role-tabs" role="tablist" aria-label="Seleccionar rol">{roles.map((role) => {
        const RoleIcon = ROLE_ICONS[role.nombre] ?? Shield;
        return <button key={role.id} type="button" role="tab" aria-selected={role.id === roleId}
          disabled={updateMutation.isPending} onClick={() => requestRole(role)}><RoleIcon aria-hidden="true" />{getRoleLabel(role.nombre)}</button>;
      })}</div>
      {requestedRole && <div className="administration-leave-prompt" role="alertdialog" aria-label="Cambiar de rol sin guardar">
        <p>Hay cambios sin guardar en {selectedRole && getRoleLabel(selectedRole.nombre)}. ¿Descartarlos para abrir {getRoleLabel(requestedRole.nombre)}?</p>
        <div><button type="button" onClick={() => setRequestedRole(null)}>Seguir editando</button><button type="button" onClick={() => selectRole(requestedRole)}>Descartar cambios</button></div>
      </div>}
      {(loadError || updateMutation.error) && <div className="administration-alert" role="alert"><AlertCircle aria-hidden="true" />
        {getApiErrorMessage(loadError ?? updateMutation.error)}{loadError && <button type="button" onClick={() => { void permissionsQuery.refetch(); void assignedQuery.refetch(); }}>Reintentar</button>}
      </div>}
      {isProtectedRole ? <p className="administration-notice"><ShieldCheck aria-hidden="true" />El rol {selectedRole?.nombre} conserva acceso irrestricto a todos los módulos y no puede ser restringido.</p> :
        <div className="administration-role-summary"><strong>{selectedRole && getRoleLabel(selectedRole.nombre)}</strong><p>{selectedRole?.descripcion}</p>
          {selectedRole?.nombre === 'mecanico' && <p>El mecánico solo accede a las OT que tiene asignadas.</p>}
          {selectedRole?.nombre === 'vendedor' && <p>Clientes y vehículos compartidos; OT, cotizaciones y pagos propios.</p>}
          {!canUpdate && <p>Acceso de solo lectura a esta matriz.</p>}
        </div>}
      {loading ? <div className="administration-empty" role="status"><LoaderCircle className="animate-spin" aria-hidden="true" /><p>Cargando permisos del rol…</p></div> : !loadError && <>
        <p className="administration-permission-count">Módulos y Acciones ({displayedIds.size} de {totalAvailable} activos)</p>
        <div className="administration-module-grid">{groupedPermissions.map(([module, permissions]) => {
          const ModuleIcon = MODULE_ICONS[module];
          const allChecked = permissions.every((permission) => displayedIds.has(permission.id));
          return <section key={module} className="administration-module" aria-label={`Permisos de ${MODULE_LABELS[module]}`}>
            <header><h3><ModuleIcon aria-hidden="true" />{MODULE_LABELS[module]}</h3>
              {!isProtectedRole && canUpdate && <button type="button" disabled={locked} onClick={() => toggleModule(permissions.map((permission) => permission.id))}
                aria-label={`${allChecked ? 'Desmarcar' : 'Marcar'} todos los permisos de ${MODULE_LABELS[module]}`}><CheckCheck aria-hidden="true" />{allChecked ? 'Desmarcar todo' : 'Marcar todo'}</button>}
            </header>
            <div>{permissions.map((permission) => <label key={permission.id} className={displayedIds.has(permission.id) ? 'is-selected' : ''}>
              <input type="checkbox" checked={displayedIds.has(permission.id)} disabled={locked}
                onChange={() => togglePermission(permission.id)} aria-label={ACTION_LABELS[permission.accion]} />{ACTION_LABELS[permission.accion]}
            </label>)}</div>
          </section>;
        })}</div>
      </>}
    </div>
    <footer className="administration-permission-footer"><div role="status">
      {updateMutation.isPending ? 'Guardando permisos…' : updateMutation.isSuccess ? 'Permisos actualizados correctamente' : dirty ? 'Hay cambios sin guardar' : `${displayedIds.size} permiso(s) seleccionado(s) para este rol`}
      {dirty && selectedIds.size === 0 && <p>Debe asignar al menos un permiso.</p>}
    </div>{canUpdate && !isProtectedRole && <div>
      <button type="button" className="administration-secondary" disabled={!dirty || updateMutation.isPending}
        onClick={() => { setDraft(null); updateMutation.reset(); }}><RotateCcw aria-hidden="true" />Descartar</button>
      <button type="button" className="administration-primary" disabled={locked || !dirty || selectedIds.size === 0} onClick={save}>
        {updateMutation.isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}Guardar permisos
      </button></div>}
    </footer>
  </section>;
};

export default RolePermissionsPanel;
