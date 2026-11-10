import {
  AlertCircle,
  Car,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import FleetVehicleDetail from './FleetVehicleDetail';
import FleetVehicleFormModal from './FleetVehicleFormModal';
import FleetVehicleStatusBadge from './FleetVehicleStatusBadge';
import VehicleDirectoryRow from './VehicleDirectoryRow';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import {
  useDeleteFleetVehicleMutation,
  useFleetVehicles,
} from '../../hooks/useFleetVehicles';
import { useModalOverlay } from '../../hooks/useModalOverlay';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatDate } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';
import { AnimateIcon } from '../animate-ui';
import ImportModal from '../common/ImportModal';
import ListExportButtons from '../common/ListExportButtons';
import Pagination from '../common/Pagination';

import type { FleetVehicle, FleetVehicleStatus } from '../../types/entities';

const gridClassName = 'workspace-vehicle-grid';

const formatKilometres = (value: number | null): string =>
  value === null ? 'Sin registrar' : `${new Intl.NumberFormat('es-CL').format(value)} km`;

const FleetSkeleton = () => (
  <div className={gridClassName}>
    {Array.from({ length: 6 }, (_, index) => (
      <div
        key={index}
        className="vehicle-directory-skeleton flex h-[252px] animate-pulse flex-col rounded-lg border border-brand-line bg-white p-4"
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
  const [importOpen, setImportOpen] = useState(false);
  const [ownerVisibility, setOwnerVisibility] = useState<string | null>(null);
  const selectedVehicleId = Number(searchParams.get('fleetVehicleId'));
  const hasSelectedVehicle = Number.isInteger(selectedVehicleId) && selectedVehicleId > 0;
  const debouncedSearch = useDebouncedValue(search, 350);
  const user = useAuthStore((state) => state.user);
  const viewerId = `${user?.id}:${user?.role}`;
  const canViewOwner = user?.role === 'admin' || user?.role === 'desarrollador';
  const showOwner = canViewOwner && ownerVisibility === viewerId;
  const canCreate = Boolean(user && hasUserPermission(user, 'flota', 'create'));
  const canEdit = Boolean(user && hasUserPermission(user, 'flota', 'update'));
  const canDelete = Boolean(user && hasUserPermission(user, 'flota', 'delete'));
  const canImport = Boolean(
    user &&
    (hasUserPermission(user, 'flota', 'import') || hasUserPermission(user, 'admin', 'import')),
  );

  const filters = {
    page,
    pageSize: 20,
    search: debouncedSearch || undefined,
    estado: estado ? (estado as FleetVehicleStatus) : undefined,
    vencimiento: vencimiento ? (vencimiento as 'proximo' | 'vencido') : undefined,
  } satisfies Parameters<typeof useFleetVehicles>[0];
  const fleetQuery = useFleetVehicles(filters);
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
    setOwnerVisibility(null);
    setFormVehicle(undefined);
    setDeleteVehicle(null);
  }, [user?.id, user?.role]);

  const detailPanelRef = useModalOverlay({ isOpen: hasSelectedVehicle, onClose: closeVehicle });

  const confirmDelete = (): void => {
    if (!deleteVehicle) return;
    deleteMutation.mutate(deleteVehicle.id, { onSuccess: () => setDeleteVehicle(null) });
  };

  return (
    <div className="min-w-0 space-y-5">
      <div className="vehicle-toolbar vehicle-toolbar-fleet">
      <div className="vehicle-toolbar-heading">
        <div>
          <h2 className="sr-only">Vehículos de flota</h2>
          <p className="sr-only">
            Vehículos de uso interno de la empresa, con su documentación y vencimientos.
          </p>
        </div>
          <div className="vehicle-toolbar-actions flex flex-wrap items-center gap-2">
            <ListExportButtons
              target="fleet-vehicles"
              filters={filters}
              includeOwner={showOwner}
              disabled={fleetQuery.isPending || fleetQuery.isError}
            />
            {canImport && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => setImportOpen(true)}
              >
                <Upload className="h-4 w-4" aria-hidden="true" /> Importar
              </button>
            )}
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
      </div>

      <section className="vehicle-toolbar-fields" aria-label="Filtros de vehículos">
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
            <option value="dado_de_baja">Dado de baja</option>
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

      </div>

      {canViewOwner && (
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-brand-muted">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-primary"
            checked={showOwner}
            onChange={(event) => setOwnerVisibility(event.target.checked ? viewerId : null)}
          />
          Mostrar propietario
        </label>
      )}

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
                <VehicleDirectoryRow
                  key={vehicle.id} number={number} plate={vehicle.patente}
                  privateSubline={showOwner && canViewOwner ? `Propietario: ${vehicle.propietario ?? 'Sin registrar'}` : undefined}
                  name={[vehicle.marca, vehicle.modelo, vehicle.ano].filter(Boolean).join(' ') || 'Vehículo de flota'}
                  reference={[vehicle.codigoInterno ? `Código ${vehicle.codigoInterno}` : null, vehicle.sucursal].filter(Boolean).join(' · ') || undefined}
                  owner={vehicle.responsable ?? 'Sin responsable'} ownerLabel="Responsable"
                  facts={<>{formatKilometres(vehicle.kilometraje)} · {summary.total} documento{summary.total === 1 ? '' : 's'}</>}
                  status={<FleetVehicleStatusBadge status={vehicle.estadoOperativo} />}
                  alerts={<><span className={summary.expired > 0 ? 'text-brand-coralInk' : summary.expiringSoon > 0 ? 'text-amber-700' : summary.total > 0 ? 'text-brand-mintInk' : ''}>{summary.expired > 0 ? summary.expired + ' documento(s) vencido(s)' : summary.expiringSoon > 0 ? summary.expiringSoon + ' por vencer en 30 días' : summary.total === 0 ? 'Sin documentos registrados' : 'Documentación al día'}</span>{summary.nextExpiry && <span> · <span>{formatDate(summary.nextExpiry.fechaVencimiento)}</span></span>}</>}
                  onOpen={() => openVehicle(vehicle.id)}
                  onEdit={canEdit ? () => setFormVehicle(vehicle) : undefined}
                  onDelete={canDelete ? () => { deleteMutation.reset(); setDeleteVehicle(vehicle); } : undefined}
                />
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

      {formVehicle !== undefined && (formVehicle ? canEdit : canCreate) && (
        <FleetVehicleFormModal
          vehicle={formVehicle}
          onClose={() => setFormVehicle(undefined)}
        />
      )}
      {importOpen && (
        <ImportModal target="fleet-vehicles" onClose={() => setImportOpen(false)} />
      )}

      <AnimatePresence>
        {hasSelectedVehicle && (
          <div className="reference-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
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
              className="workspace-dialog reference-dialog vehicle-profile-dialog relative flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden border border-brand-line bg-white shadow-2xl sm:max-h-[calc(100dvh-2.5rem)]"
              role="dialog"
              aria-modal="true"
              ref={detailPanelRef}
              tabIndex={-1}
              aria-label="Ficha del vehículo de flota"
            >
              <FleetVehicleDetail
                key={`${viewerId}:${selectedVehicleId}`}
                vehicleId={selectedVehicleId}
                showOwner={showOwner}
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
