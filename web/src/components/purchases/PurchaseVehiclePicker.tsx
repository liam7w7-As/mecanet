import { Car, Check, LoaderCircle, Search, Truck, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useFleetVehicles } from '../../hooks/useFleetVehicles';
import { useVehicles } from '../../hooks/useVehicles';
import { useWorkOrders } from '../../hooks/useWorkOrders';

import type { FleetVehicle, Vehicle, WorkOrder } from '../../types/entities';
import type { PurchaseVehicleOrigin } from '@unithor/shared';

export interface PurchaseVehicleSelection {
  origenVehiculo: PurchaseVehicleOrigin | null;
  vehicle: Vehicle | null;
  fleetVehicle: FleetVehicle | null;
  workOrderId: number | null;
}

interface PurchaseVehiclePickerProps {
  value: PurchaseVehicleSelection;
  onChange: (value: PurchaseVehicleSelection) => void;
}

const vehicleLabel = (vehicle: Vehicle): string =>
  [vehicle.patente, vehicle.marca, vehicle.modelo].filter(Boolean).join(' · ');

const fleetVehicleLabel = (vehicle: FleetVehicle): string =>
  [vehicle.patente, vehicle.marca, vehicle.modelo].filter(Boolean).join(' · ');

const WorkOrderSelect = ({
  vehicleId,
  value,
  onChange,
}: {
  vehicleId: number;
  value: number | null;
  onChange: (id: number | null) => void;
}) => {
  const query = useWorkOrders({ page: 1, pageSize: 50, vehicleId }, true);
  const workOrders: WorkOrder[] = query.data?.items ?? [];

  return (
    <label className="mt-3 block text-sm font-semibold text-brand-ink">
      Orden de trabajo (opcional)
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
        className="mt-2 h-10 w-full rounded-lg border border-brand-line bg-white px-3 text-sm font-normal text-brand-ink outline-none focus:border-brand-primary"
      >
        <option value="">Sin OT vinculada</option>
        {workOrders.map((workOrder) => (
          <option key={workOrder.id} value={workOrder.id}>
            {workOrder.codigo} · {workOrder.estado.replaceAll('_', ' ')}
          </option>
        ))}
      </select>
      {query.isFetching && (
        <span className="mt-1 inline-flex items-center gap-1 text-xs text-brand-muted">
          <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
          Cargando órdenes del vehículo...
        </span>
      )}
      {!query.isFetching && workOrders.length === 0 && (
        <span className="mt-1 block text-xs text-brand-muted">
          Este vehículo no tiene órdenes de trabajo registradas.
        </span>
      )}
    </label>
  );
};

export const PurchaseVehiclePicker = ({ value, onChange }: PurchaseVehiclePickerProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebouncedValue(query.trim(), 250);
  const workshopQuery = useVehicles({ page: 1, pageSize: 10, search: debouncedQuery || undefined });
  const fleetQuery = useFleetVehicles({
    page: 1,
    pageSize: 10,
    search: debouncedQuery || undefined,
  });

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent): void => {
      if (containerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  const chooseOrigin = (origin: PurchaseVehicleOrigin | null): void => {
    setOpen(false);
    setQuery('');
    onChange({
      origenVehiculo: origin,
      vehicle: null,
      fleetVehicle: null,
      workOrderId: null,
    });
  };

  const results = value.origenVehiculo === 'flota' ? fleetQuery : workshopQuery;
  const isWorkshop = value.origenVehiculo === 'taller';
  const isFleet = value.origenVehiculo === 'flota';
  const selectedLabel =
    isWorkshop && value.vehicle
      ? vehicleLabel(value.vehicle)
      : isFleet && value.fleetVehicle
        ? fleetVehicleLabel(value.fleetVehicle)
        : null;

  return (
    <fieldset>
      <legend className="text-sm font-semibold text-brand-ink">Vehículo asociado (opcional)</legend>
      <p className="mt-1 text-xs text-brand-muted">
        Normalmente un vehículo de taller. También puedes imputar la compra a un vehículo de flota.
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { key: null, label: 'Sin vehículo', icon: X },
          { key: 'taller' as const, label: 'Taller', icon: Car },
          { key: 'flota' as const, label: 'Flota', icon: Truck },
        ].map((option) => {
          const Icon = option.icon;
          const active = value.origenVehiculo === option.key;
          return (
            <button
              key={option.label}
              type="button"
              onClick={() => chooseOrigin(option.key)}
              className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-bold transition ${
                active
                  ? 'bg-brand-primaryInk text-white'
                  : 'bg-brand-pale text-brand-muted hover:bg-brand-line'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {option.label}
            </button>
          );
        })}
      </div>

      {value.origenVehiculo !== null && (
        <div ref={containerRef} className="relative mt-3">
          <label className="block text-sm font-semibold text-brand-ink">
            {isWorkshop ? 'Vehículo de taller' : 'Vehículo de flota'}
          </label>
          <div className="relative mt-2">
            <Search
              className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-brand-muted"
              aria-hidden="true"
            />
            <input
              value={selectedLabel ?? query}
              onChange={(event) => {
                setQuery(event.target.value);
                onChange({
                  ...value,
                  vehicle: null,
                  fleetVehicle: null,
                  workOrderId: null,
                });
                setOpen(true);
              }}
              onFocus={() => {
                setQuery('');
                setOpen(true);
              }}
              className="h-10 w-full rounded-lg border border-brand-line bg-white pl-9 pr-9 text-sm text-brand-ink outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15"
              placeholder={
                isWorkshop ? 'Buscar por patente, marca o cliente' : 'Buscar por patente o código interno'
              }
              autoComplete="off"
              aria-label={isWorkshop ? 'Buscar vehículo de taller' : 'Buscar vehículo de flota'}
            />
            {selectedLabel !== null && (
              <button
                type="button"
                className="absolute inset-y-0 right-2 my-auto flex h-7 w-7 items-center justify-center rounded text-brand-muted hover:bg-brand-pale"
                aria-label="Quitar vehículo"
                title="Quitar vehículo"
                onClick={() =>
                  onChange({
                    ...value,
                    vehicle: null,
                    fleetVehicle: null,
                    workOrderId: null,
                  })
                }
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          {open && (
            <div className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-brand-line bg-white py-1 shadow-xl">
              {results.isPending && (
                <p className="px-3 py-2 text-sm text-brand-muted">Buscando vehículos...</p>
              )}
              {!results.isPending && (results.data?.items.length ?? 0) === 0 && (
                <p className="px-3 py-2 text-sm text-brand-muted">Sin coincidencias.</p>
              )}
              {isWorkshop &&
                workshopQuery.data?.items.map((vehicle) => (
                  <button
                    key={vehicle.id}
                    type="button"
                    className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-brand-ink hover:bg-brand-pale"
                    onClick={() => {
                      onChange({
                        origenVehiculo: 'taller',
                        vehicle,
                        fleetVehicle: null,
                        workOrderId: null,
                      });
                      setOpen(false);
                      setQuery('');
                    }}
                  >
                    <Car className="mt-0.5 h-4 w-4 shrink-0 text-brand-muted" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-xs font-bold uppercase">
                        {vehicle.patente}
                      </span>
                      <span className="block truncate text-xs text-brand-muted">
                        {[vehicle.marca, vehicle.modelo, vehicle.ano].filter(Boolean).join(' ') ||
                          'Sin marca ni modelo'}
                        {vehicle.client?.nombre ? ` · ${vehicle.client.nombre}` : ''}
                      </span>
                    </span>
                    {value.vehicle?.id === vehicle.id && (
                      <Check className="h-4 w-4 shrink-0 text-brand-primaryInk" aria-hidden="true" />
                    )}
                  </button>
                ))}
              {isFleet &&
                fleetQuery.data?.items.map((vehicle) => (
                  <button
                    key={vehicle.id}
                    type="button"
                    className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-brand-ink hover:bg-brand-pale"
                    onClick={() => {
                      onChange({
                        origenVehiculo: 'flota',
                        vehicle: null,
                        fleetVehicle: vehicle,
                        workOrderId: null,
                      });
                      setOpen(false);
                      setQuery('');
                    }}
                  >
                    <Truck className="mt-0.5 h-4 w-4 shrink-0 text-brand-muted" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-xs font-bold uppercase">
                        {vehicle.patente}
                      </span>
                      <span className="block truncate text-xs text-brand-muted">
                        {[vehicle.codigoInterno, vehicle.marca, vehicle.modelo]
                          .filter(Boolean)
                          .join(' · ') || 'Sin código interno'}
                      </span>
                    </span>
                    {value.fleetVehicle?.id === vehicle.id && (
                      <Check className="h-4 w-4 shrink-0 text-brand-primaryInk" aria-hidden="true" />
                    )}
                  </button>
                ))}
            </div>
          )}

          {isWorkshop && value.vehicle && (
            <WorkOrderSelect
              vehicleId={value.vehicle.id}
              value={value.workOrderId}
              onChange={(workOrderId) => onChange({ ...value, workOrderId })}
            />
          )}
        </div>
      )}
    </fieldset>
  );
};

export default PurchaseVehiclePicker;
