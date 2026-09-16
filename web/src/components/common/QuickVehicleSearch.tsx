import { Car, LoaderCircle, Plus, Search, UserRound } from 'lucide-react';
import { useState } from 'react';

import { useQuickSearch } from '../../hooks/useVehicles';
import VehicleFormModal from '../vehicles/VehicleFormModal';

import type { QuickSearchClient, QuickSearchVehicle, Vehicle } from '../../types/entities';

interface QuickVehicleSearchProps {
  onSelectVehicle: (vehicle: QuickSearchVehicle) => void;
  onSelectClient?: (client: QuickSearchClient) => void;
  placeholder?: string;
  suggestedClient?: Pick<QuickSearchClient, 'id' | 'nombre' | 'rut'> | null;
}

const normalizePlate = (value: string): string => value.replace(/[\s-]/g, '').toUpperCase();

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
  suggestedClient = null,
}: QuickVehicleSearchProps) => {
  const [term, setTerm] = useState('');
  const [isFocused, setFocused] = useState(false);
  const [newVehiclePlate, setNewVehiclePlate] = useState<string | null>(null);
  const searchQuery = useQuickSearch(term);
  const normalizedTerm = normalizePlate(term);
  const hasExactPlate = searchQuery.data?.vehicles.some(
    (vehicle) => vehicle.patente === normalizedTerm,
  );
  const canRegisterPlate = /^[A-Z0-9]{4,15}$/.test(normalizedTerm) && !hasExactPlate;
  const showResults = isFocused && term.trim().length >= 2;

  const selectVehicle = (vehicle: QuickSearchVehicle): void => {
    onSelectVehicle(vehicle);
    setTerm(vehicle.patente);
    setFocused(false);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
        <input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-10 text-sm outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
          placeholder={placeholder}
          aria-label="Búsqueda rápida de vehículos y clientes"
          role="combobox"
          aria-expanded={showResults}
          aria-controls="quick-search-results"
        />
        {searchQuery.isFetching && (
          <LoaderCircle className="absolute right-3 top-3 h-4 w-4 animate-spin text-brand-blue" aria-hidden="true" />
        )}
      </div>

      {showResults && (
        <div id="quick-search-results" className="absolute z-30 mt-2 max-h-96 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-2 shadow-xl shadow-slate-900/10">
          {searchQuery.data?.vehicles.length ? (
            <section aria-labelledby="quick-vehicles-title">
              <h3 id="quick-vehicles-title" className="px-3 pb-1 pt-1 text-xs font-semibold uppercase text-slate-500">Vehículos</h3>
              {searchQuery.data.vehicles.map((vehicle) => (
                <button key={vehicle.id} type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50" onMouseDown={(event) => event.preventDefault()} onClick={() => selectVehicle(vehicle)}>
                  <Car className="h-4 w-4 shrink-0 text-brand-blue" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-sm font-bold text-brand-blue">{vehicle.patente}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {[vehicle.marca, vehicle.modelo].filter(Boolean).join(' ') || 'Sin modelo'}
                      {vehicle.client ? ` · ${vehicle.client.nombre}` : ' · Sin dueño'}
                    </span>
                  </span>
                </button>
              ))}
            </section>
          ) : null}

          {searchQuery.data?.clients.length ? (
            <section className="mt-1 border-t border-slate-100 pt-1" aria-labelledby="quick-clients-title">
              <h3 id="quick-clients-title" className="px-3 pb-1 pt-1 text-xs font-semibold uppercase text-slate-500">Clientes</h3>
              {searchQuery.data.clients.map((client) => (
                <button key={client.id} type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50" onMouseDown={(event) => event.preventDefault()} onClick={() => { onSelectClient?.(client); setTerm(client.nombre); setFocused(false); }}>
                  <UserRound className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800">{client.nombre}</span>
                    <span className="block text-xs text-slate-500">{client.rut ?? 'Sin RUT'} · {client.vehiclesCount} vehículo(s)</span>
                  </span>
                </button>
              ))}
            </section>
          ) : null}

          {!searchQuery.isFetching && searchQuery.data && searchQuery.data.clients.length === 0 && searchQuery.data.vehicles.length === 0 && (
            <p className="px-3 py-4 text-center text-sm text-slate-500">No se encontraron coincidencias</p>
          )}

          {canRegisterPlate && (
            <button type="button" className="mt-1 flex w-full items-center gap-2 border-t border-slate-100 px-3 py-3 text-left text-sm font-semibold text-brand-blue hover:bg-brand-light" onMouseDown={(event) => event.preventDefault()} onClick={() => { setNewVehiclePlate(normalizedTerm); setFocused(false); }}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Registrar nuevo vehículo con patente {normalizedTerm}
            </button>
          )}
        </div>
      )}

      {newVehiclePlate && (
        <VehicleFormModal
          initialPatente={newVehiclePlate}
          suggestedClient={suggestedClient}
          onClose={() => setNewVehiclePlate(null)}
          onSaved={(vehicle) => {
            selectVehicle(toQuickVehicle(vehicle));
            setNewVehiclePlate(null);
          }}
        />
      )}
    </div>
  );
};

export default QuickVehicleSearch;
