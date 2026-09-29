import {
  AlertCircle,
  Check,
  CheckCheck,
  FileText,
  Layers,
  LoaderCircle,
  Package,
  Save,
  Shield,
  ShieldCheck,
  Truck,
  UserCheck,
  Users,
  Wrench,
} from 'lucide-react';
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

const MODULE_ICONS: Record<string, typeof Layers> = {
  admin: Shield,
  clients: Users,
  vehicles: Truck,
  work_orders: Wrench,
  catalog: Package,
  finance: FileText,
  kardex: Layers,
};

const ROLE_ICONS: Record<string, typeof Shield> = {
  admin: ShieldCheck,
  desarrollador: Shield,
  vendedor: UserCheck,
  mecanico: Wrench,
  bodeguero: Package,
};

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
    if (assignedQuery.data) {
      setSelectedIds(new Set(assignedQuery.data.map((permission) => permission.id)));
    }
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

  const toggleModulePermissions = (modulePermissions: Array<{ id: number }>): void => {
    const allSelected = modulePermissions.every((p) => selectedIds.has(p.id));
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allSelected) {
        modulePermissions.forEach((p) => next.delete(p.id));
      } else {
        modulePermissions.forEach((p) => next.add(p.id));
      }
      return next;
    });
  };

  const handleSelectRole = (newRoleId: number): void => {
    updateMutation.reset();
    setSelectedIds(new Set());
    setRoleId(newRoleId);
  };

  const save = (): void => {
    if (roleId === null) return;
    updateMutation.mutate({ roleId, permissionIds: [...selectedIds].sort((a, b) => a - b) });
  };

  const error = permissionsQuery.error ?? assignedQuery.error ?? updateMutation.error;
  const totalAvailable = permissionsQuery.data?.length ?? 0;

  return (
    <section
      className="overflow-hidden rounded-2xl border border-brand-line bg-white shadow-xs"
      aria-labelledby="permission-matrix-title"
    >
      {/* Cabecera Modernize */}
      <header className="border-b border-brand-line bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-pale text-brand-primary">
              <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h2 id="permission-matrix-title" className="text-lg font-bold text-brand-ink">
                Matriz dinámica de permisos
              </h2>
              <p className="mt-0.5 text-xs text-brand-muted sm:text-sm">
                Asignación granular de capacidades operativas y acceso a módulos.
              </p>
            </div>
          </div>

          {/* Selector accesible oculto / sync para pruebas y lectores */}
          <label className="sr-only">
            Rol
            <select
              value={roleId ?? ''}
              onChange={(event) => handleSelectRole(Number(event.target.value))}
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {getRoleLabel(role.nombre)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Barra de roles estilizada como pestañas/pills Modernize */}
        <div className="mt-5 flex flex-wrap items-center gap-2" role="tablist" aria-label="Seleccionar rol">
          {roles.map((role) => {
            const isSelected = role.id === roleId;
            const RoleIcon = ROLE_ICONS[role.nombre] ?? Shield;
            return (
              <button
                key={role.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => handleSelectRole(role.id)}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all sm:text-sm ${
                  isSelected
                    ? 'bg-brand-primary text-white shadow-xs ring-2 ring-brand-primary/20'
                    : 'bg-brand-pale/60 text-brand-muted hover:bg-brand-pale hover:text-brand-ink'
                }`}
              >
                <RoleIcon className={`h-4 w-4 ${isSelected ? 'text-white' : 'text-brand-primary'}`} aria-hidden="true" />
                <span>{getRoleLabel(role.nombre)}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Alerta de error */}
      {error && (
        <div
          className="flex items-start gap-2 border-b border-brand-coral/30 bg-brand-coralPale px-5 py-3 text-sm text-brand-coralInk"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {getApiErrorMessage(error)}
        </div>
      )}

      {/* Aviso de Rol Desarrollador */}
      {isDeveloper && (
        <div className="border-b border-brand-line bg-brand-pale/50 px-5 py-3 text-sm text-brand-primaryInk">
          <p className="font-semibold">
            El rol desarrollador conserva acceso irrestricto a todos los módulos y no puede ser restringido.
          </p>
        </div>
      )}

      {/* Contenido principal */}
      {permissionsQuery.isPending || assignedQuery.isPending ? (
        <div className="flex min-h-72 items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-brand-primary">
            <LoaderCircle className="h-8 w-8 animate-spin" aria-label="Cargando permisos" />
            <p className="text-xs font-semibold text-brand-muted">Cargando permisos del rol...</p>
          </div>
        </div>
      ) : (
        <div className="p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted">
              Módulos y Acciones ({selectedIds.size} de {totalAvailable} activos)
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {groupedPermissions.map(([module, permissions]) => {
              const ModuleIcon = MODULE_ICONS[module] ?? Layers;
              const allChecked = permissions.every((p) => selectedIds.has(p.id));
              const someChecked = permissions.some((p) => selectedIds.has(p.id));

              return (
                <div
                  key={module}
                  className="rounded-2xl border border-brand-line bg-[#fbfcfd] p-4 transition-all hover:border-brand-primary/30 sm:p-5"
                >
                  <div className="flex items-center justify-between border-b border-brand-line pb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-pale text-brand-primary">
                        <ModuleIcon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <h3 className="text-sm font-bold text-brand-ink">
                        {MODULE_LABELS[module] ?? module}
                      </h3>
                    </div>

                    {!isDeveloper && canUpdate && (
                      <button
                        type="button"
                        onClick={() => toggleModulePermissions(permissions)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-brand-primary transition hover:bg-brand-pale"
                      >
                        <CheckCheck className="h-3 w-3" aria-hidden="true" />
                        {allChecked ? 'Desmarcar todo' : 'Marcar todo'}
                      </button>
                    )}
                  </div>

                  <div className="mt-3.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {permissions.map((permission) => {
                      const isChecked = selectedIds.has(permission.id);
                      return (
                        <label
                          key={permission.id}
                          className={`relative flex min-h-10 select-none items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
                            isChecked
                              ? 'border-brand-primary bg-brand-pale/70 text-brand-primary shadow-2xs ring-1 ring-brand-primary/20'
                              : 'border-brand-line bg-white text-brand-muted hover:border-brand-primary/30 hover:text-brand-ink'
                          } ${isDeveloper || !canUpdate ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'}`}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded accent-brand-primary"
                            checked={isChecked}
                            disabled={isDeveloper || !canUpdate}
                            onChange={() => togglePermission(permission.id)}
                            aria-label={ACTION_LABELS[permission.accion] ?? permission.accion}
                          />
                          <span className="truncate">{ACTION_LABELS[permission.accion] ?? permission.accion}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer Modernize */}
      <footer className="flex flex-col gap-3 border-t border-brand-line bg-brand-pale/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className={`text-xs font-medium sm:text-sm ${updateMutation.isSuccess ? 'font-semibold text-brand-mintInk' : 'text-brand-muted'}`}>
          {updateMutation.isSuccess
            ? 'Permisos actualizados correctamente'
            : `${selectedIds.size} permiso(s) seleccionado(s) para este rol`}
        </p>

        {canUpdate && !isDeveloper && (
          <button
            type="button"
            className="primary-button h-10 px-5 text-xs font-bold text-white shadow-xs hover:shadow transition-all disabled:opacity-50"
            onClick={save}
            disabled={selectedIds.size === 0 || updateMutation.isPending}
          >
            {updateMutation.isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            Guardar permisos
          </button>
        )}
      </footer>
    </section>
  );
};

export default RolePermissionsPanel;
