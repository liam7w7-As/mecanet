import {
  AlertCircle,
  CalendarClock,
  Car,
  ChevronRight,
  Gauge,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRound,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import FleetVehicleDetail from './FleetVehicleDetail';
import FleetVehicleFormModal from './FleetVehicleFormModal';
import FleetVehicleStatusBadge from './FleetVehicleStatusBadge';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import {
  useDeleteFleetVehicleMutation,
  useFleetVehicles,
} from '../../hooks/useFleetVehicles';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatDate } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';
import { AnimateIcon, AnimatedCard } from '../animate-ui';
import Pagination from '../common/Pagination';

import type { FleetVehicle } from '../../types/entities';

const gridClassName = 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,310px),1fr))] gap-4';

const formatKilometres = (value: number | null): string =>
  value === null ? 'Sin registrar' : `${new Intl.NumberFormat('es-CL').format(value)} km`;

const FleetSkeleton = () => (
  <div className={gridClassName}>
    {Array.from({ length: 6 }, (_, index) => (
      <div
        key={index}
        className="flex h-[252px] animate-pulse flex-col rounded-lg border border-brand-line bg-white p-4"
      >
        <div className="h-5 w-20 rounded bg-brand-pale" />
        <div className="mt-3 h-10 w-40 rounded bg-brand-pale" />
        <div className="mt-3 h-4 w-44 rounded bg-brand-pale" />
        <div className="mt-3 h-4 w-36 rounded bg-brand-pale" />
        <div className="mt-auto h-9 rounded bg-brand-pale" />
      </div>
    ))}
  </div>
);

const selectClassName =
  'h-10 w-full rounded-lg border border-brand-line bg-white px-3 text-sm outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15';

/** Listado de vehículos de uso interno, aislado del parque de clientes. */
export const FleetVehiclesTab = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [estado, setEstado] = useState('');
  const [vencimiento, setVencimiento] = useState('');
  const [page, setPage] = useState(1);
  const [formVehicle, setFormVehicle] = useState<FleetVehicle | null | undefined>(undefined);
  const [deleteVehicle, setDeleteVehicle] = useState<FleetVehicle | null>(null);
  const selectedVehicleId = Number(searchParams.get('fleetVehicleId'));
  const hasSelectedVehicle = Number.isInteger(selectedVehicleId) && selectedVehicleId > 0;
  const debouncedSearch = useDebouncedValue(search, 350);
  const user = useAuthStore((state) => state.user);
  const canCreate = Boolean(user && hasUserPermission(user, 'flota', 'create'));
  const canEdit = Boolean(user && hasUserPermission(user, 'flota', 'update'));
  const canDelete = Boolean(user && hasUserPermission(user, 'flota', 'delete'));

  const fleetQuery = useFleetVehicles({
    page,
    pageSize: 20,
    search: debouncedSearch || undefined,
    estado: estado ? (estado as 'disponible' | 'en_mantencion' | 'fuera_de_servicio') : undefined,
    vencimiento: vencimiento ? (vencimiento as 'proximo' | 'vencido') : undefined,
  });
  const deleteMutation = useDeleteFleetVehicleMutation();

  const openVehicle = (vehicleId: number): void => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('tab', 'flota');
      next.set('fleetVehicleId', String(vehicleId));
      return next;
    });
  };

  const closeVehicle = (): void => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('fleetVehicleId');
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
    setPage(1);
  }, [estado, vencimiento]);

  useEffect(() => {
    if (!hasSelectedVehicle) return undefined;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete('fleetVehicleId');
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-brand-ink">Vehículos de flota</h2>
          <p className="mt-0.5 text-sm text-brand-muted">
            Vehículos de uso interno de la empresa, con su documentación y vencimientos.
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            className="primary-button"
            onClick={() => setFormVehicle(null)}
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Nuevo vehículo de flota
          </button>
        )}
      </div>

      <section className="grid gap-4 border-y border-brand-line bg-white px-4 py-4 lg:grid-cols-3">
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase text-brand-muted">
            Buscar en flota
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
              placeholder="Patente, código, marca, modelo o responsable"
            />
          </span>
        </label>
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase text-brand-muted">
            Estado operativo
          </span>
          <select
            className={selectClassName}
            value={estado}
            onChange={(event) => setEstado(event.target.value)}
          >
            <option value="">Todos los estados</option>
            <option value="disponible">Disponible</option>
            <option value="en_mantencion">En mantención</option>
            <option value="fuera_de_servicio">Fuera de servicio</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase text-brand-muted">
            Documentación
          </span>
          <select
            className={selectClassName}
            value={vencimiento}
            onChange={(event) => setVencimiento(event.target.value)}
          >
            <option value="">Todos los documentos</option>
            <option value="proximo">Por vencer (30 días)</option>
            <option value="vencido">Vencidos</option>
          </select>
        </label>
      </section>

      <section aria-label="Listado de vehículos de flota">
        {(fleetQuery.isError || deleteMutation.isError) && (
          <div
            className="mb-4 flex items-start gap-2 border border-brand-coral/30 bg-brand-coralPale p-4 text-sm text-brand-coralInk"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {getApiErrorMessage(
              fleetQuery.error ?? deleteMutation.error,
              'No fue posible completar la operación',
            )}
          </div>
        )}

        {fleetQuery.isPending ? (
          <FleetSkeleton />
        ) : (
          <div className={gridClassName}>
            {fleetQuery.data?.items.map((vehicle, index) => {
              const number = (page - 1) * 20 + index + 1;
              const summary = vehicle.documentSummary;
              return (
                <AnimatedCard
                  key={vehicle.id}
                  className="group relative flex min-h-[252px] min-w-0 flex-col rounded-2xl border border-brand-line bg-white p-5 text-brand-ink shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-primary/40 hover:shadow-md focus-within:border-brand-primary focus-within:ring-2 focus-within:ring-brand-primary/20"
                >
                  <button
                    type="button"
                    className="absolute inset-0 z-0 rounded-2xl focus:outline-none"
                    onClick={() => openVehicle(vehicle.id)}
                    aria-label={`Abrir ficha de ${vehicle.patente}`}
                  />
                  <div className="pointer-events-none relative z-[1] flex min-h-0 flex-1 flex-col">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="inline-flex shrink-0 items-center rounded-md bg-brand-pale px-2 py-0.5 font-mono text-[11px] font-bold text-brand-primaryInk">
                          #{number}
                        </span>
                        <span className="whitespace-nowrap font-mono text-2xl font-black tracking-widest text-slate-900 transition-colors group-hover:text-brand-primary">
                          {vehicle.patente}
                        </span>
                      </div>
                      <FleetVehicleStatusBadge status={vehicle.estadoOperativo} />
                    </div>

                    <div className="mt-3 flex min-w-0 items-center gap-3.5">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-pale text-brand-primary transition-colors group-hover:bg-brand-primary group-hover:text-white">
                        <Car className="h-6 w-6" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3
                          className="truncate text-base font-bold leading-6 text-brand-ink transition-colors group-hover:text-brand-primary"
                          title={[vehicle.marca, vehicle.modelo, vehicle.ano].filter(Boolean).join(' ')}
                        >
                          {[vehicle.marca, vehicle.modelo].filter(Boolean).join(' ') ||
                            'Vehículo de flota'}
                        </h3>
                        <p className="truncate text-xs font-medium leading-5 text-brand-muted">
                          {vehicle.codigoInterno ? `Código ${vehicle.codigoInterno}` : 'Sin código interno'}
                          {vehicle.ano ? ` · Año ${vehicle.ano}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3.5 grid grid-cols-2 gap-2 rounded-xl bg-brand-pale/50 p-2.5 text-xs text-brand-muted">
                      <p
                        className="flex min-w-0 items-center gap-2"
                        title={vehicle.sucursal ?? 'Sin sucursal'}
                      >
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-brand-primary" aria-hidden="true" />
                        <span className="truncate font-semibold text-brand-ink">
                          {vehicle.sucursal ?? 'Sin sucursal'}
                        </span>
                      </p>
                      <p
                        className="flex min-w-0 items-center gap-2"
                        title={vehicle.responsable ?? 'Sin responsable'}
                      >
                        <UserRound
                          className="h-3.5 w-3.5 shrink-0 text-brand-primary"
                          aria-hidden="true"
                        />
                        <span className="truncate font-semibold text-brand-ink">
                          {vehicle.responsable ?? 'Sin responsable'}
                        </span>
                      </p>
                      <p className="flex min-w-0 items-center gap-2">
                        <Gauge className="h-3.5 w-3.5 shrink-0 text-brand-primary" aria-hidden="true" />
                        <span className="truncate font-semibold tabular-nums text-brand-ink">
                          {formatKilometres(vehicle.kilometraje)}
                        </span>
                      </p>
                      <p className="flex min-w-0 items-center gap-2">
                        <CalendarClock
                          className="h-3.5 w-3.5 shrink-0 text-brand-primary"
                          aria-hidden="true"
                        />
                        <span className="truncate font-semibold text-brand-ink">
                          {summary.total} documento{summary.total === 1 ? '' : 's'}
                        </span>
                      </p>
                    </div>

                    <div className="mt-2.5 flex min-w-0 items-center gap-2 px-1 text-xs">
                      {summary.expired > 0 ? (
                        <span className="truncate font-semibold text-brand-coralInk">
                          {summary.expired} documento{summary.expired === 1 ? '' : 's'} vencido
                          {summary.expired === 1 ? '' : 's'}
                        </span>
                      ) : summary.expiringSoon > 0 ? (
                        <span className="truncate font-semibold text-amber-700">
                          {summary.expiringSoon} por vencer en 30 días
                        </span>
                      ) : summary.total === 0 ? (
                        <span className="truncate font-medium text-brand-muted">
                          Sin documentos registrados
                        </span>
                      ) : (
                        <span className="truncate font-semibold text-brand-mintInk">
                          Documentación al día
                        </span>
                      )}
                      {summary.nextExpiry && (
                        <span className="ml-auto shrink-0 text-brand-muted">
                          {formatDate(summary.nextExpiry.fechaVencimiento)}
                        </span>
                      )}
                    </div>

                    <div className="mt-auto flex items-center gap-2 border-t border-brand-line pt-3.5">
                      <span className="flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-pale text-xs font-bold text-brand-primaryInk transition-colors group-hover:bg-brand-primary group-hover:text-white">
                        Ver ficha
                        <ChevronRight
                          className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                          aria-hidden="true"
                        />
                      </span>
                      {canEdit && (
                        <button
                          type="button"
                          className="pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand-line bg-white text-brand-muted transition-colors hover:border-brand-primary/40 hover:bg-brand-pale hover:text-brand-primaryInk focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-primary"
                          onClick={() => setFormVehicle(vehicle)}
                          aria-label={`Editar ${vehicle.patente}`}
                          title="Editar vehículo de flota"
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          className="pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand-line bg-white text-brand-muted transition-colors hover:border-brand-coral/40 hover:bg-brand-coralPale hover:text-brand-coralInk focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-primary"
                          onClick={() => {
                            deleteMutation.reset();
                            setDeleteVehicle(vehicle);
                          }}
                          aria-label={`Eliminar ${vehicle.patente}`}
                          title="Eliminar vehículo de flota"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                </AnimatedCard>
              );
            })}
          </div>
        )}

        {!fleetQuery.isPending && fleetQuery.data?.items.length === 0 && (
          <div className="flex min-h-52 flex-col items-center justify-center border border-brand-line bg-white px-4 text-center">
            <AnimateIcon icon={Car} animation="bounce" size={36} className="text-brand-muted" />
            <p className="mt-3 font-semibold text-brand-ink">No se encontraron vehículos de flota</p>
            <p className="mt-1 text-sm text-brand-muted">
              Pruebe con otra patente, código o cambie los filtros.
            </p>
          </div>
        )}

        <Pagination
          page={page}
          totalPages={fleetQuery.data?.totalPages ?? 0}
          total={fleetQuery.data?.total ?? 0}
          onPageChange={setPage}
        />
      </section>

      {formVehicle !== undefined && (
        <FleetVehicleFormModal
          vehicle={formVehicle}
          onClose={() => setFormVehicle(undefined)}
        />
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
              aria-label="Cerrar ficha del vehículo de flota"
              onClick={closeVehicle}
            />
            <motion.section
              initial={{ opacity: 0, scale: 0.97, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-brand-line bg-white shadow-2xl sm:max-h-[calc(100dvh-2.5rem)]"
              role="dialog"
              aria-modal="true"
              aria-label="Ficha del vehículo de flota"
            >
              <FleetVehicleDetail
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
              className="relative w-full max-w-md rounded-2xl border border-brand-line bg-white p-6 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-fleet-vehicle-title"
            >
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-coralPale text-brand-coralInk">
                  <Trash2 className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2 id="delete-fleet-vehicle-title" className="text-lg font-bold text-brand-ink">
                  Eliminar vehículo {deleteVehicle.patente}
                </h2>
              </div>
              <p className="text-sm leading-6 text-brand-muted">
                El vehículo se ocultará de la flota activa. Sus documentos y versiones se conservan
                internamente para auditoría.
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

export default FleetVehiclesTab;
