import { AlertCircle, Car, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { AnimateIcon, AnimatedTableRow } from '../../components/animate-ui';
import Pagination from '../../components/common/Pagination';
import QuickVehicleSearch from '../../components/common/QuickVehicleSearch';
import VehicleFormModal from '../../components/vehicles/VehicleFormModal';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useDeleteVehicleMutation, useVehicles } from '../../hooks/useVehicles';
import { getApiErrorMessage } from '../../lib/api-error';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';

import type { Vehicle } from '../../types/entities';

const formatKilometres = (value: number | null): string =>
  value === null ? '—' : `${new Intl.NumberFormat('es-CL').format(value)} km`;

const VehicleSkeleton = () => (
  <>{Array.from({ length: 5 }, (_, index) => <tr key={index} className="border-b border-slate-100">{Array.from({ length: 7 }, (_, cell) => <td key={cell} className="px-4 py-4"><div className="h-4 animate-pulse rounded bg-slate-100" /></td>)}</tr>)}</>
);

export const VehiclesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [page, setPage] = useState(1);
  const [formVehicle, setFormVehicle] = useState<Vehicle | null | undefined>(undefined);
  const [deleteVehicle, setDeleteVehicle] = useState<Vehicle | null>(null);
  const debouncedSearch = useDebouncedValue(search, 350);
  const user = useAuthStore((state) => state.user);
  const vehiclesQuery = useVehicles({ page, pageSize: 20, search: debouncedSearch || undefined });
  const deleteMutation = useDeleteVehicleMutation();
  const canCreate = Boolean(user && (hasUserPermission(user, 'taller', 'create') || hasUserPermission(user, 'comercial', 'create')));
  const canEdit = Boolean(user && (hasUserPermission(user, 'taller', 'update') || hasUserPermission(user, 'comercial', 'update')));
  const canDelete = Boolean(user && hasUserPermission(user, 'taller', 'delete'));

  useEffect(() => {
    setPage(1);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (debouncedSearch) next.set('search', debouncedSearch);
      else next.delete('search');
      return next;
    }, { replace: true });
  }, [debouncedSearch, setSearchParams]);

  const confirmDelete = (): void => {
    if (!deleteVehicle) return;
    deleteMutation.mutate(deleteVehicle.id, { onSuccess: () => setDeleteVehicle(null) });
  };

  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-medium text-slate-500">Parque vehicular</p><h1 className="mt-1 text-2xl font-bold text-brand-blue sm:text-3xl">Vehículos</h1></div>
        {canCreate && (
          <button
            type="button"
            className="group inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-yellow px-4 text-sm font-bold text-brand-dark shadow-sm transition-all hover:bg-yellow-400 hover:shadow-md active:scale-95"
            onClick={() => setFormVehicle(null)}
          >
            <AnimateIcon icon={Plus} animation="spin" size={16} /> Nuevo vehículo
          </button>
        )}
      </header>

      <section className="grid gap-4 border-y border-slate-200 bg-white px-4 py-4 lg:grid-cols-2">
        <div><p className="mb-2 text-xs font-semibold uppercase text-slate-500">Búsqueda rápida de recepción</p><QuickVehicleSearch onSelectVehicle={(vehicle) => setSearch(vehicle.patente)} onSelectClient={(client) => setSearch(client.nombre)} /></div>
        <label className="block"><span className="mb-2 block text-xs font-semibold uppercase text-slate-500">Filtrar listado</span><span className="relative block"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" /><input className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Patente, marca, modelo o VIN" /></span></label>
      </section>

      <section className="overflow-hidden border border-slate-200 bg-white" aria-label="Listado de vehículos">
        {(vehiclesQuery.isError || deleteMutation.isError) && <div className="flex items-start gap-2 border-b border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{getApiErrorMessage(vehiclesQuery.error ?? deleteMutation.error, 'No fue posible completar la operación')}</div>}
        <div className="max-w-full overflow-x-auto overscroll-x-contain"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-brand-blue text-xs uppercase text-white"><tr><th className="px-4 py-3 font-semibold">Patente</th><th className="px-4 py-3 font-semibold">Marca / Modelo</th><th className="px-4 py-3 font-semibold">Año</th><th className="px-4 py-3 font-semibold">Dueño</th><th className="px-4 py-3 font-semibold">Kilometraje</th><th className="px-4 py-3 font-semibold">Combustible</th><th className="px-4 py-3 text-right font-semibold">Acciones</th></tr></thead><tbody>
          {vehiclesQuery.isPending ? <VehicleSkeleton /> : vehiclesQuery.data?.items.map((vehicle, index) => (
            <AnimatedTableRow key={vehicle.id} index={index} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 transition-colors">
              <td className="px-4 py-3"><span className="rounded bg-brand-yellow px-2.5 py-1 font-mono font-bold text-brand-dark shadow-xs">{vehicle.patente}</span></td>
              <td className="px-4 py-3"><span className="font-semibold text-slate-900">{vehicle.marca ?? 'Sin marca'}</span><span className="block text-xs text-slate-500">{vehicle.modelo ?? 'Sin modelo'}</span></td>
              <td className="px-4 py-3 text-slate-600">{vehicle.ano ?? '—'}</td>
              <td className="max-w-56 px-4 py-3">{vehicle.client ? <Link className="block truncate font-semibold text-brand-blue hover:underline" to={`/clients?search=${encodeURIComponent(vehicle.client.rut ?? vehicle.client.nombre)}`}>{vehicle.client.nombre}</Link> : <span className="text-slate-400">Sin dueño</span>}</td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatKilometres(vehicle.kilometraje)}</td>
              <td className="px-4 py-3 capitalize text-slate-600">{vehicle.combustible ?? '—'}</td>
              <td className="px-4 py-3"><div className="flex justify-end gap-1">
                {canEdit && (
                  <button
                    type="button"
                    className="group flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-amber-50 hover:text-amber-700 transition-colors"
                    onClick={() => setFormVehicle(vehicle)}
                    aria-label={`Editar ${vehicle.patente}`}
                    title="Editar"
                  >
                    <AnimateIcon icon={Pencil} animation="wiggle" size={16} />
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    className="group flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700 transition-colors"
                    onClick={() => { deleteMutation.reset(); setDeleteVehicle(vehicle); }}
                    aria-label={`Eliminar ${vehicle.patente}`}
                    title="Eliminar"
                  >
                    <AnimateIcon icon={Trash2} animation="bounce" size={16} />
                  </button>
                )}
              </div></td>
            </AnimatedTableRow>
          ))}
        </tbody></table></div>
        {!vehiclesQuery.isPending && vehiclesQuery.data?.items.length === 0 && (
          <div className="flex min-h-52 flex-col items-center justify-center px-4 text-center">
            <AnimateIcon icon={Car} animation="bounce" size={36} className="text-slate-300" />
            <p className="mt-3 font-semibold text-slate-700">No se encontraron vehículos</p>
            <p className="mt-1 text-sm text-slate-500">Pruebe con otra patente, marca o modelo.</p>
          </div>
        )}
        <Pagination page={page} totalPages={vehiclesQuery.data?.totalPages ?? 0} total={vehiclesQuery.data?.total ?? 0} onPageChange={setPage} />
      </section>

      {formVehicle !== undefined && <VehicleFormModal vehicle={formVehicle} onClose={() => setFormVehicle(undefined)} />}
      <AnimatePresence>
        {deleteVehicle && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-4 sm:items-center sm:py-6">
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/55"
              aria-label="Cancelar eliminación"
              onClick={() => setDeleteVehicle(null)}
            />
            <motion.section
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-vehicle-title"
            >
              <h2 id="delete-vehicle-title" className="text-lg font-semibold text-brand-blue">Eliminar vehículo {deleteVehicle.patente}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">El vehículo se ocultará del parque activo. No podrá eliminarse si mantiene órdenes de trabajo abiertas.</p>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors" onClick={() => setDeleteVehicle(null)}>Cancelar</button>
                <button type="button" className="h-10 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 transition-colors disabled:opacity-60" onClick={confirmDelete} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}</button>
              </div>
            </motion.section>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VehiclesPage;
