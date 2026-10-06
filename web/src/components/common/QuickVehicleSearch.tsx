import { isValidChilePatente, normalizeChilePatente, rutSchema } from '@unithor/shared';
import { Car, LoaderCircle, Plus, Search, UserRound } from 'lucide-react';
import { useId, useState } from 'react';
import { createPortal } from 'react-dom';

import { useQuickSearch } from '../../hooks/useVehicles';
import { notifySuccess } from '../../stores/toast.store';
import ClientFormModal from '../clients/ClientFormModal';
import VehicleFormModal from '../vehicles/VehicleFormModal';

import type { QuickSearchClient, QuickSearchVehicle, Vehicle } from '../../types/entities';

type ClientSelection = Pick<QuickSearchClient, 'id' | 'nombre' | 'rut'>;

interface QuickVehicleSearchProps {
  onSelectVehicle?: (vehicle: QuickSearchVehicle) => void;
  onSelectClient?: (client: ClientSelection) => void;
  placeholder?: string;
  mode?: 'all' | 'clients' | 'vehicles';
  suggestedClient?: ClientSelection | null;
  /** Ofrece abrir el formulario para crear el cliente con lo escrito si no existe. */
  allowCreateClient?: boolean;
}

const normalizePlate = (value: string): string => normalizeChilePatente(value);

const toQuickVehicle = (vehicle: Vehicle): QuickSearchVehicle => ({
  id: vehicle.id,
  patente: vehicle.patente,
  marca: vehicle.marca,
  modelo: vehicle.modelo,
  ano: vehicle.ano,
  client: vehicle.client
    ? { id: vehicle.client.id, nombre: vehicle.client.nombre, rut: vehicle.client.rut }
    : null,
});

export const QuickVehicleSearch = ({
  onSelectVehicle,
  onSelectClient,
  placeholder = 'Buscar por patente, cliente, RUT o teléfono',
  mode = 'all',
  suggestedClient = null,
  allowCreateClient = false,
}: QuickVehicleSearchProps) => {
  const resultsId = useId();
  const [term, setTerm] = useState('');
  const [isFocused, setFocused] = useState(false);
  const [newVehiclePlate, setNewVehiclePlate] = useState<string | null>(null);
  const [newClientTerm, setNewClientTerm] = useState<string | null>(null);
  const searchQuery = useQuickSearch(term);
  const normalizedTerm = normalizePlate(term);
  const trimmedTerm = term.trim();
  const hasExactPlate = searchQuery.data?.vehicles.some(
    (vehicle) => vehicle.patente === normalizedTerm,
  );
  const hasExactClientName = searchQuery.data?.clients.some(
    (client) => client.nombre.trim().toLowerCase() === trimmedTerm.toLowerCase(),
  );
  const canRegisterPlate = mode !== 'clients' && searchQuery.isSuccess && !searchQuery.isFetching
    && !searchQuery.isDebouncing && isValidChilePatente(normalizedTerm) && !hasExactPlate;
  const canCreateClient = allowCreateClient && mode !== 'vehicles' && searchQuery.isSuccess
    && !searchQuery.isFetching && !searchQuery.isDebouncing && trimmedTerm.length >= 2
    && !hasExactClientName;
  const showResults = isFocused && term.trim().length >= 2;
  const hasResults = (mode !== 'clients' && Boolean(searchQuery.data?.vehicles.length)) ||
    (mode !== 'vehicles' && Boolean(searchQuery.data?.clients.length));

  const selectVehicle = (vehicle: QuickSearchVehicle): void => {
    onSelectVehicle?.(vehicle);
    setTerm(vehicle.patente);
    setFocused(false);
  };

  // Si lo escrito tiene formato de RUN/RUT, se precarga en el campo RUT;
  // en otro caso se precarga como nombre del nuevo cliente.
  const newClientInitialValues = newClientTerm !== null
    ? (rutSchema.safeParse(newClientTerm).success
        ? { rut: newClientTerm }
        : { nombre: newClientTerm })
    : null;

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-brand-muted" aria-hidden="true" />
        <input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="h-10 w-full rounded-lg border border-brand-line bg-white pl-9 pr-10 text-sm outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15"
          placeholder={placeholder}
          aria-label={mode === 'clients' ? 'Buscar cliente' : mode === 'vehicles' ? 'Buscar vehículo' : 'Búsqueda rápida de vehículos y clientes'}
          role="combobox"
          aria-expanded={showResults}
          aria-controls={resultsId}
        />
        {searchQuery.isFetching && (
          <LoaderCircle className="absolute right-3 top-3 h-4 w-4 animate-spin text-brand-primaryInk" aria-hidden="true" />
        )}
      </div>

      {showResults && (
        <div id={resultsId} className="absolute z-30 mt-2 max-h-96 w-full overflow-y-auto rounded-lg border border-brand-line bg-white py-2 shadow-xl shadow-brand-ink/10">
          {mode !== 'clients' && searchQuery.data?.vehicles.length ? (
            <section aria-labelledby={`${resultsId}-vehicles`}>
              <h3 id={`${resultsId}-vehicles`} className="px-3 pb-1 pt-1 text-xs font-semibold uppercase text-brand-muted">Vehículos</h3>
              {searchQuery.data.vehicles.map((vehicle) => (
                <button key={vehicle.id} type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-brand-pale" onMouseDown={(event) => event.preventDefault()} onClick={() => selectVehicle(vehicle)}>
                  <Car className="h-4 w-4 shrink-0 text-brand-primaryInk" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-sm font-bold text-brand-primaryInk">{vehicle.patente}</span>
                    <span className="block truncate text-xs text-brand-muted">
                      {[vehicle.marca, vehicle.modelo].filter(Boolean).join(' ') || 'Sin modelo'}
                      {vehicle.client ? ` · ${vehicle.client.nombre}` : ' · Sin dueño'}
                    </span>
                  </span>
                </button>
              ))}
            </section>
          ) : null}

          {mode !== 'vehicles' && searchQuery.data?.clients.length ? (
            <section className="mt-1 border-t border-brand-line pt-1" aria-labelledby={`${resultsId}-clients`}>
              <h3 id={`${resultsId}-clients`} className="px-3 pb-1 pt-1 text-xs font-semibold uppercase text-brand-muted">Clientes</h3>
              {searchQuery.data.clients.map((client) => (
                <button key={client.id} type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-brand-pale" onMouseDown={(event) => event.preventDefault()} onClick={() => { onSelectClient?.(client); setTerm(client.nombre); setFocused(false); }}>
                  <UserRound className="h-4 w-4 shrink-0 text-brand-muted" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-brand-ink">{client.nombre}</span>
                    <span className="block text-xs text-brand-muted">{client.rut ?? 'Sin RUT'}{mode === 'all' ? ` · ${client.vehiclesCount} vehículo(s)` : ''}</span>
                  </span>
                </button>
              ))}
            </section>
          ) : null}

          {!searchQuery.isFetching && searchQuery.data && !hasResults && (
            <p className="px-3 py-4 text-center text-sm text-brand-muted">No se encontraron coincidencias</p>
          )}

          {canCreateClient && (
            <button
              type="button"
              className="mt-1 flex w-full items-center gap-2 border-t border-brand-line px-3 py-3 text-left text-sm font-semibold text-brand-primaryInk hover:bg-brand-line/40"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setNewClientTerm(trimmedTerm);
                setFocused(false);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Crear cliente «{trimmedTerm}»
            </button>
          )}

          {canRegisterPlate && (
            <button type="button" className="mt-1 flex w-full items-center gap-2 border-t border-brand-line px-3 py-3 text-left text-sm font-semibold text-brand-primaryInk hover:bg-brand-line/40" onMouseDown={(event) => event.preventDefault()} onClick={() => { setNewVehiclePlate(normalizedTerm); setFocused(false); }}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Registrar nuevo vehículo con patente {normalizedTerm}
            </button>
          )}
        </div>
      )}

      {newVehiclePlate && createPortal(
        <div onSubmit={(event) => event.stopPropagation()}>
        <VehicleFormModal
          initialPatente={newVehiclePlate}
          suggestedClient={suggestedClient}
          onClose={() => setNewVehiclePlate(null)}
          onSaved={(vehicle) => {
            selectVehicle(toQuickVehicle(vehicle));
            setNewVehiclePlate(null);
          }}
        />
        </div>,
        document.body,
      )}

      {newClientInitialValues && createPortal(
        <div onSubmit={(event) => event.stopPropagation()}>
        <ClientFormModal
          initialValues={newClientInitialValues}
          onClose={() => setNewClientTerm(null)}
          onSaved={(saved) => {
            onSelectClient?.({ id: saved.id, nombre: saved.nombre, rut: saved.rut });
            setTerm(saved.nombre);
            setNewClientTerm(null);
            setFocused(false);
            notifySuccess(`Cliente «${saved.nombre}» creado y seleccionado.`);
          }}
        />
        </div>,
        document.body,
      )}
    </div>
  );
};

export default QuickVehicleSearch;
