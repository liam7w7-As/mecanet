import {
  AlertCircle,
  Car,
  ChevronRight,
  Fuel,
  Gauge,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRound,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import VehicleDetailPage from './VehicleDetailPage';
import { AnimateIcon, AnimatedCard } from '../../components/animate-ui';
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

const vehicleGridClassName = 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,270px),1fr))] gap-3';

const VehicleSkeleton = () => (
  <div className={vehicleGridClassName}>
    {Array.from({ length: 6 }, (_, index) => (
      <div
        key={index}
        className="flex h-[232px] animate-pulse flex-col rounded-lg border border-slate-200 bg-white p-4"
      >
        <div className="h-5 w-16 rounded bg-slate-100" />
        <div className="mt-3 h-10 w-40 rounded bg-slate-100" />
        <div className="mt-3 h-4 w-44 rounded bg-slate-100" />
        <div className="mt-3 h-4 w-36 rounded bg-slate-100" />
        <div className="mt-auto h-9 rounded bg-slate-100" />
      </div>
    ))}
  </div>
);

export const VehiclesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [page, setPage] = useState(1);
  const [formVehicle, setFormVehicle] = useState<Vehicle | null | undefined>(undefined);
  const [deleteVehicle, setDeleteVehicle] = useState<Vehicle | null>(null);
  const selectedVehicleId = Number(searchParams.get('vehicleId'));
  const hasSelectedVehicle = Number.isInteger(selectedVehicleId) && selectedVehicleId > 0;
  const debouncedSearch = useDebouncedValue(search, 350);
  const user = useAuthStore((state) => state.user);
  const vehiclesQuery = useVehicles({ page, pageSize: 20, search: debouncedSearch || undefined });
  const deleteMutation = useDeleteVehicleMutation();
  const canCreate = Boolean(
    user &&
    (hasUserPermission(user, 'taller', 'create') || hasUserPermission(user, 'comercial', 'create')),
  );
  const canEdit = Boolean(
    user &&
    (hasUserPermission(user, 'taller', 'update') || hasUserPermission(user, 'comercial', 'update')),
  );
  const canDelete = Boolean(user && hasUserPermission(user, 'taller', 'delete'));

  const openVehicle = (vehicleId: number): void => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('vehicleId', String(vehicleId));
      return next;
    });
  };

  const closeVehicle = (): void => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('vehicleId');
        return next;
      },
      { replace: true },
    );
  };

  useEffect(() => {
    setPage(1);
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (debouncedSearch) next.set('search', debouncedSearch);
        else next.delete('search');
        return next;
      },
      { replace: true },
    );
  }, [debouncedSearch, setSearchParams]);

  useEffect(() => {
    if (!hasSelectedVehicle) return undefined;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete('vehicleId');
          return next;
        },
        { replace: true },
      );
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [hasSelectedVehicle, setSearchParams]);

  const confirmDelete = (): void => {
    if (!deleteVehicle) return;
    deleteMutation.mutate(deleteVehicle.id, { onSuccess: () => setDeleteVehicle(null) });
  };

  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Parque vehicular</p>
          <h1 className="mt-1 text-2xl font-bold text-brand-blue sm:text-3xl">Vehículos</h1>
        </div>
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
        <div>
          <p className="mb-2 text-xs font-semibold uppercase text-slate-500">
            Búsqueda rápida de recepción
          </p>
          <QuickVehicleSearch
            onSelectVehicle={(vehicle) => openVehicle(vehicle.id)}
            onSelectClient={(client) => setSearch(client.nombre)}
          />
        </div>
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase text-slate-500">
            Filtrar listado
          </span>
          <span className="relative block">
            <Search
              className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400"
              aria-hidden="true"
            />
            <input
              className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Patente, marca, modelo o VIN"
            />
          </span>
        </label>
      </section>

      <section aria-label="Listado de vehículos">
        {(vehiclesQuery.isError || deleteMutation.isError) && (
          <div
            className="mb-4 flex items-start gap-2 border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {getApiErrorMessage(
              vehiclesQuery.error ?? deleteMutation.error,
              'No fue posible completar la operación',
            )}
          </div>
        )}
        {vehiclesQuery.isPending ? (
          <VehicleSkeleton />
        ) : (
          <div className={vehicleGridClassName}>
            {vehiclesQuery.data?.items.map((vehicle, index) => {
              const number = (page - 1) * 20 + index + 1;
              const missingCount = [
                vehicle.modelo,
                vehicle.ano,
                vehicle.kilometraje,
                vehicle.combustible,
              ].filter((value) => value === null).length;
              return (
                <AnimatedCard
                  key={vehicle.id}
                  className="group relative flex h-[232px] min-w-0 flex-col rounded-lg border border-brand-blue bg-brand-blue p-4 text-white shadow-sm transition-[border-color,box-shadow] hover:border-brand-yellow/60 hover:shadow-md focus-within:border-brand-yellow focus-within:ring-2 focus-within:ring-brand-yellow/30"
                >
                  <button
                    type="button"
                    className="absolute inset-0 z-0 rounded-lg focus:outline-none"
                    onClick={() => openVehicle(vehicle.id)}
                    aria-label={`Abrir ficha de ${vehicle.patente}`}
                  />
                  <div className="pointer-events-none relative z-[1] flex min-h-0 flex-1 flex-col">
                    <div className="flex h-5 items-center justify-between gap-2 text-[11px]">
                      <span className="font-mono font-semibold tabular-nums text-slate-400">
                        #{number}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 font-medium ${missingCount > 0 ? 'text-amber-200' : 'text-emerald-300'}`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${missingCount > 0 ? 'bg-amber-300' : 'bg-emerald-400'}`}
                          aria-hidden="true"
                        />
                        {missingCount > 0 ? `${missingCount} datos pendientes` : 'Ficha completa'}
                      </span>
                    </div>

                    <div className="mt-2 flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-brand-yellow transition-colors group-hover:bg-brand-yellow/10">
                        <Car className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2
                          className="truncate font-mono text-lg font-bold leading-6 text-white"
                          title={vehicle.patente}
                        >
                          {vehicle.patente}
                        </h2>
                        <p
                          className="truncate text-xs leading-5 text-slate-300"
                          title={[vehicle.marca, vehicle.modelo, vehicle.ano]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          {[vehicle.marca, vehicle.modelo].filter(Boolean).join(' ') ||
                            'Vehículo sin descripción'}
                          {vehicle.ano ? ` · ${vehicle.ano}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs leading-5 text-slate-300">
                      <p
                        className="flex min-w-0 items-center gap-2"
                        title={`Kilometraje: ${formatKilometres(vehicle.kilometraje)}`}
                      >
                        <Gauge className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                        <span className="truncate tabular-nums">
                          {formatKilometres(vehicle.kilometraje)}
                        </span>
                      </p>
                      <p
                        className="flex min-w-0 items-center gap-2"
                        title={`Combustible: ${vehicle.combustible ?? 'Sin registrar'}`}
                      >
                        <Fuel className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                        <span className="truncate capitalize">
                          {vehicle.combustible ?? 'Sin registrar'}
                        </span>
                      </p>
                    </div>

                    <div className="mt-2 flex min-w-0 items-center gap-2 text-xs leading-5 text-slate-300">
                      <UserRound
                        className="h-3.5 w-3.5 shrink-0 text-slate-400"
                        aria-hidden="true"
                      />
                      <p
                        className="truncate"
                        title={vehicle.client?.nombre ?? 'Sin propietario asignado'}
                      >
                        {vehicle.client?.nombre ?? 'Sin propietario asignado'}
                      </p>
                    </div>

                    <div className="mt-auto flex items-center gap-2 border-t border-white/10 pt-3">
                      <span className="flex h-8 min-w-0 flex-1 items-center justify-center gap-2 rounded-md bg-brand-yellow text-xs font-semibold text-brand-dark transition-colors group-hover:bg-yellow-300">
                        Ver ficha
                        <ChevronRight
                          className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                          aria-hidden="true"
                        />
                      </span>
                      {canEdit && (
                        <button
                          type="button"
                          className="pointer-events-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 hover:text-brand-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-yellow"
                          onClick={() => setFormVehicle(vehicle)}
                          aria-label={`Editar ${vehicle.patente}`}
                          title="Editar vehículo"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          className="pointer-events-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-red-400/10 hover:text-red-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-yellow"
                          onClick={() => {
                            deleteMutation.reset();
                            setDeleteVehicle(vehicle);
                          }}
                          aria-label={`Eliminar ${vehicle.patente}`}
                          title="Eliminar vehículo"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                </AnimatedCard>
              );
            })}
          </div>
        )}
        {!vehiclesQuery.isPending && vehiclesQuery.data?.items.length === 0 && (
          <div className="flex min-h-52 flex-col items-center justify-center border border-slate-200 bg-white px-4 text-center">
            <AnimateIcon icon={Car} animation="bounce" size={36} className="text-slate-300" />
            <p className="mt-3 font-semibold text-slate-700">No se encontraron vehículos</p>
            <p className="mt-1 text-sm text-slate-500">Pruebe con otra patente, marca o modelo.</p>
          </div>
        )}
        <Pagination
          page={page}
          totalPages={vehiclesQuery.data?.totalPages ?? 0}
          total={vehiclesQuery.data?.total ?? 0}
          onPageChange={setPage}
        />
      </section>

      {formVehicle !== undefined && (
        <VehicleFormModal vehicle={formVehicle} onClose={() => setFormVehicle(undefined)} />
      )}
      <AnimatePresence>
        {hasSelectedVehicle && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-[1px]"
              aria-label="Cerrar ficha del vehículo"
              onClick={closeVehicle}
            />
            <motion.section
              initial={{ opacity: 0, scale: 0.97, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl sm:max-h-[calc(100dvh-2.5rem)]"
              role="dialog"
              aria-modal="true"
              aria-label="Ficha del vehículo"
            >
              <VehicleDetailPage
                key={selectedVehicleId}
                vehicleId={selectedVehicleId}
                onClose={closeVehicle}
              />
            </motion.section>
          </div>
        )}
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
              <h2 id="delete-vehicle-title" className="text-lg font-semibold text-brand-blue">
                Eliminar vehículo {deleteVehicle.patente}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                El vehículo se ocultará del parque activo. No podrá eliminarse si mantiene órdenes
                de trabajo abiertas.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  onClick={() => setDeleteVehicle(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="h-10 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 transition-colors disabled:opacity-60"
                  onClick={confirmDelete}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </motion.section>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VehiclesPage;
