import {
  AlertCircle,
  Car,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import VehicleDirectoryRow from './VehicleDirectoryRow';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useDeleteVehicleMutation, useVehicles } from '../../hooks/useVehicles';
import { getApiErrorMessage } from '../../lib/api-error';
import { hasUserPermission } from '../../lib/permissions';
import VehicleDetailPage from '../../pages/vehicles/VehicleDetailPage';
import { useAuthStore } from '../../stores/auth.store';
import { AnimateIcon } from '../animate-ui';
import Pagination from '../common/Pagination';
import QuickVehicleSearch from '../common/QuickVehicleSearch';
import VehicleFormModal from '../vehicles/VehicleFormModal';

import type { Vehicle } from '../../types/entities';

const formatKilometres = (value: number | null): string =>
  value === null ? '—' : `${new Intl.NumberFormat('es-CL').format(value)} km`;

const vehicleGridClassName = 'workspace-vehicle-grid';

const VehicleSkeleton = () => (
  <div className={vehicleGridClassName}>
    {Array.from({ length: 6 }, (_, index) => (
      <div
        key={index}
        className="vehicle-directory-skeleton flex h-[232px] animate-pulse flex-col rounded-lg border border-brand-line bg-white p-4"
      >
        <div className="h-5 w-16 rounded bg-brand-pale" />
        <div className="mt-3 h-10 w-40 rounded bg-brand-pale" />
        <div className="mt-3 h-4 w-44 rounded bg-brand-pale" />
        <div className="mt-3 h-4 w-36 rounded bg-brand-pale" />
        <div className="mt-auto h-9 rounded bg-brand-pale" />
      </div>
    ))}
  </div>
);

/** Parque de clientes: búsqueda de recepción, ficha y vínculos de taller/comercial. */
export const WorkshopVehiclesTab = () => {
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
      next.set('tab', 'taller');
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
      <div className="vehicle-toolbar ">
      <div className="vehicle-toolbar-heading">
        <div>
          <h2 className="sr-only">Vehículos de taller</h2>
          <p className="sr-only">
            Parque de clientes, recepción, órdenes de trabajo y cotizaciones.
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            className="primary-button"
            onClick={() => setFormVehicle(null)}
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Nuevo vehículo
          </button>
        )}
      </div>

      <section className="vehicle-toolbar-fields" aria-label="Filtros de vehículos">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase text-brand-muted">
            Búsqueda rápida de recepción
          </p>
          <QuickVehicleSearch
            onSelectVehicle={(vehicle) => openVehicle(vehicle.id)}
            onSelectClient={(client) => setSearch(client.nombre)}
          />
        </div>
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase text-brand-muted">
            Filtrar listado
          </span>
          <span className="relative block">
            <Search
              className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-brand-muted"
              aria-hidden="true"
            />
            <input
              className="h-10 w-full rounded-lg border border-brand-line bg-white pl-9 pr-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Patente, marca, modelo o VIN"
            />
          </span>
        </label>
      </section>

      </div>

      <section aria-label="Listado de vehículos">
        {(vehiclesQuery.isError || deleteMutation.isError) && (
          <div
            className="mb-4 flex items-start gap-2 border border-brand-coral/30 bg-brand-coralPale p-4 text-sm text-brand-coralInk"
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
                <VehicleDirectoryRow
                  key={vehicle.id} number={number} plate={vehicle.patente}
                  name={[vehicle.marca, vehicle.modelo, vehicle.ano].filter(Boolean).join(' ') || 'Vehículo sin descripción'}
                  reference={vehicle.vinChasis ? 'VIN: ' + vehicle.vinChasis : undefined}
                  owner={vehicle.client?.nombre ?? 'Sin propietario asignado'} ownerLabel="Propietario"
                  facts={<>{formatKilometres(vehicle.kilometraje)} · {vehicle.combustible ?? 'Sin combustible registrado'}</>}
                  status={<span className={missingCount > 0 ? 'text-amber-700' : 'text-brand-mintInk'}>{missingCount > 0 ? missingCount + ' datos pendientes' : 'Ficha completa'}</span>}
                  onOpen={() => openVehicle(vehicle.id)}
                  onEdit={canEdit ? () => setFormVehicle(vehicle) : undefined}
                  onDelete={canDelete ? () => { deleteMutation.reset(); setDeleteVehicle(vehicle); } : undefined}
                />
              );
            })}
          </div>
        )}
        {!vehiclesQuery.isPending && vehiclesQuery.data?.items.length === 0 && (
          <div className="flex min-h-52 flex-col items-center justify-center border border-brand-line bg-white px-4 text-center">
            <AnimateIcon icon={Car} animation="bounce" size={36} className="text-brand-muted" />
            <p className="mt-3 font-semibold text-brand-ink">No se encontraron vehículos</p>
            <p className="mt-1 text-sm text-brand-muted">Pruebe con otra patente, marca o modelo.</p>
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
              className="fixed inset-0 bg-[#18273c55] backdrop-blur-sm transition-opacity"
              aria-label="Cerrar ficha del vehículo"
              onClick={closeVehicle}
            />
            <motion.section
              initial={{ opacity: 0, scale: 0.97, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="workspace-dialog relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-brand-line bg-white shadow-2xl sm:max-h-[calc(100dvh-2.5rem)]"
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
              className="absolute inset-0 bg-[#18273c55] backdrop-blur-sm transition-opacity"
              aria-label="Cancelar eliminación"
              onClick={() => setDeleteVehicle(null)}
            />
            <motion.section
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="workspace-dialog relative w-full max-w-md rounded-2xl border border-brand-line bg-white p-6 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-vehicle-title"
            >
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-coralPale text-brand-coralInk">
                  <Trash2 className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2 id="delete-vehicle-title" className="text-lg font-bold text-brand-ink">
                  Eliminar vehículo {deleteVehicle.patente}
                </h2>
              </div>
              <p className="text-sm leading-6 text-brand-muted">
                El vehículo se ocultará del parque activo. No podrá eliminarse si mantiene órdenes
                de trabajo abiertas.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  className="h-10 rounded-lg border border-brand-line px-4 text-sm font-semibold text-brand-ink hover:bg-brand-pale transition-colors"
                  onClick={() => setDeleteVehicle(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="h-10 rounded-lg bg-brand-coralInk px-4 text-sm font-semibold text-white hover:bg-brand-coralInk/90 transition-colors disabled:opacity-60"
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

export default WorkshopVehiclesTab;
