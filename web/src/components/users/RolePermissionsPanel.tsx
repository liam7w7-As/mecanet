import { AlertCircle, LoaderCircle, Save, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import {
  usePermissions,
  useRolePermissions,
  useUpdateRolePermissionsMutation,
} from '../../hooks/useUsers';
import { getApiErrorMessage } from '../../lib/api-error';
import { ACTION_LABELS, getRoleLabel, MODULE_LABELS } from '../../lib/permissions';

import type { RoleOption } from '../../hooks/useUsers';
import type { Module } from '@unithor/shared';

interface RolePermissionsPanelProps {
  roles: RoleOption[];
  canUpdate: boolean;
}

export const RolePermissionsPanel = ({ roles, canUpdate }: RolePermissionsPanelProps) => {
  const initialRole = roles.find((role) => role.nombre === 'admin') ?? roles[0];
  const [roleId, setRoleId] = useState<number | null>(initialRole?.id ?? null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const permissionsQuery = usePermissions();
  const assignedQuery = useRolePermissions(roleId);
  const updateMutation = useUpdateRolePermissionsMutation();
  const selectedRole = roles.find((role) => role.id === roleId) ?? null;
  const isDeveloper = selectedRole?.nombre === 'desarrollador';

  useEffect(() => {
    if (assignedQuery.data) setSelectedIds(new Set(assignedQuery.data.map((permission) => permission.id)));
  }, [assignedQuery.data]);

  const groupedPermissions = useMemo(() => {
    const groups = new Map<Module, NonNullable<typeof permissionsQuery.data>>();
    permissionsQuery.data?.forEach((permission) => {
      groups.set(permission.modulo, [...(groups.get(permission.modulo) ?? []), permission]);
    });
    return [...groups.entries()];
  }, [permissionsQuery.data]);

  const togglePermission = (permissionId: number): void => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(permissionId)) next.delete(permissionId);
      else next.add(permissionId);
      return next;
    });
  };

  const save = (): void => {
    if (roleId === null) return;
    updateMutation.mutate({ roleId, permissionIds: [...selectedIds].sort((a, b) => a - b) });
  };

  const error = permissionsQuery.error ?? assignedQuery.error ?? updateMutation.error;

  return (
    <section className="overflow-hidden border border-slate-200 bg-white" aria-labelledby="permission-matrix-title">
      <header className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-end lg:justify-between">
        <div><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-brand-blue" aria-hidden="true" /><h2 id="permission-matrix-title" className="font-bold text-brand-blue">Matriz dinámica de permisos</h2></div><p className="mt-1 text-sm text-slate-500">Los cambios se aplican inmediatamente a todas las cuentas del rol.</p></div>
        <label className="text-sm font-semibold text-slate-700">Rol<select className="mt-1 h-10 min-w-56 rounded-lg border border-slate-300 bg-white px-3 font-normal" value={roleId ?? ''} onChange={(event) => { updateMutation.reset(); setSelectedIds(new Set()); setRoleId(Number(event.target.value)); }}>{roles.map((role) => <option key={role.id} value={role.id}>{getRoleLabel(role.nombre)}</option>)}</select></label>
      </header>
      {error && <div className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{getApiErrorMessage(error)}</div>}
      {isDeveloper && <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">El rol desarrollador conserva acceso total y no puede modificarse.</div>}
      {(permissionsQuery.isPending || assignedQuery.isPending) ? <div className="flex min-h-64 items-center justify-center"><LoaderCircle className="h-7 w-7 animate-spin text-brand-blue" aria-label="Cargando permisos" /></div> : <div className="grid gap-px bg-slate-200 lg:grid-cols-2">{groupedPermissions.map(([module, permissions]) => <fieldset key={module} className="bg-white p-5"><legend className="px-1 text-sm font-bold text-brand-blue">{MODULE_LABELS[module]}</legend><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{permissions.map((permission) => <label key={permission.id} className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm ${selectedIds.has(permission.id) ? 'border-brand-blue bg-blue-50 text-brand-blue' : 'border-slate-200 text-slate-600'} ${isDeveloper || !canUpdate ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}><input type="checkbox" className="h-4 w-4 accent-[#0E2B4E]" checked={selectedIds.has(permission.id)} disabled={isDeveloper || !canUpdate} onChange={() => togglePermission(permission.id)} />{ACTION_LABELS[permission.accion]}</label>)}</div></fieldset>)}</div>}
      <footer className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><p className={`text-sm ${updateMutation.isSuccess ? 'font-semibold text-emerald-700' : 'text-slate-500'}`}>{updateMutation.isSuccess ? 'Permisos actualizados correctamente' : `${selectedIds.size} permiso(s) seleccionado(s)`}</p>{canUpdate && !isDeveloper && <button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white disabled:opacity-50" onClick={save} disabled={selectedIds.size === 0 || updateMutation.isPending}>{updateMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}Guardar permisos</button>}</footer>
    </section>
  );
};

export default RolePermissionsPanel;
