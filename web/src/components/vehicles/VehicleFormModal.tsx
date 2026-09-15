import { createVehicleSchema } from '@unithor/shared';
import { AlertCircle, Check, LoaderCircle, Search, UserRound, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useClients } from '../../hooks/useClients';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useCreateVehicleMutation, useUpdateVehicleMutation } from '../../hooks/useVehicles';
import { getApiErrorMessage, isApiConflict } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';

import type { Client, Vehicle } from '../../types/entities';

interface VehicleFormModalProps {
  vehicle?: Vehicle | null;
  initialPatente?: string;
  onClose: () => void;
  onSaved?: (vehicle: Vehicle) => void;
}

interface VehicleFormState {
  patente: string;
  marca: string;
  modelo: string;
  ano: string;
  color: string;
  vinChasis: string;
  motor: string;
  kilometraje: string;
  combustible: string;
  transmision: string;
}

const normalizePlateInput = (value: string): string =>
  value.replace(/[\s-]/g, '').toUpperCase().slice(0, 15);

const getInitialState = (vehicle?: Vehicle | null, initialPatente = ''): VehicleFormState => ({
  patente: vehicle?.patente ?? normalizePlateInput(initialPatente),
  marca: vehicle?.marca ?? '',
  modelo: vehicle?.modelo ?? '',
  ano: vehicle?.ano?.toString() ?? '',
  color: vehicle?.color ?? '',
  vinChasis: vehicle?.vinChasis ?? '',
  motor: vehicle?.motor ?? '',
  kilometraje: vehicle?.kilometraje?.toString() ?? '',
  combustible: vehicle?.combustible ?? '',
  transmision: vehicle?.transmision ?? '',
});

const inputClassName =
  'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15 aria-[invalid=true]:border-red-500';

export const VehicleFormModal = ({
  vehicle,
  initialPatente = '',
  onClose,
  onSaved,
}: VehicleFormModalProps) => {
  const [form, setForm] = useState<VehicleFormState>(() => getInitialState(vehicle, initialPatente));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [ownerSearch, setOwnerSearch] = useState(vehicle?.client?.nombre ?? '');
  const [selectedClient, setSelectedClient] = useState<Pick<Client, 'id' | 'nombre' | 'rut'> | null>(
    vehicle?.client
      ? { id: vehicle.client.id, nombre: vehicle.client.nombre, rut: vehicle.client.rut }
      : null,
  );
  const [withoutOwner, setWithoutOwner] = useState(vehicle?.clientId === null || !vehicle);
  const debouncedOwnerSearch = useDebouncedValue(ownerSearch, 300);
  const clientsQuery = useClients({ page: 1, pageSize: 8, search: debouncedOwnerSearch || undefined });
  const createMutation = useCreateVehicleMutation();
  const updateMutation = useUpdateVehicleMutation();
  const isEditing = Boolean(vehicle);
  const activeMutation = isEditing ? updateMutation : createMutation;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !activeMutation.isPending) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeMutation.isPending, onClose]);

  const setValue = <K extends keyof VehicleFormState>(key: K, value: VehicleFormState[K]): void => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setFieldErrors({});
    createMutation.reset();
    updateMutation.reset();

    const candidate = {
      ...form,
      ano: form.ano === '' ? null : Number(form.ano),
      kilometraje: form.kilometraje === '' ? null : Number(form.kilometraje),
      clientId: withoutOwner ? null : selectedClient?.id,
    };
    const result = createVehicleSchema.safeParse(candidate);
    if (!result.success) {
      const errors = getFieldErrors(result.error.issues);
      if (!withoutOwner && !selectedClient) {
        errors.clientId = 'Seleccione un cliente o marque la opción sin dueño';
      }
      setFieldErrors(errors);
      return;
    }

    if (!withoutOwner && !selectedClient) {
      setFieldErrors({ clientId: 'Seleccione un cliente o marque la opción sin dueño' });
      return;
    }

    if (vehicle) {
      updateMutation.mutate(
        { id: vehicle.id, data: result.data },
        {
          onSuccess: (savedVehicle) => {
            onSaved?.(savedVehicle);
            onClose();
          },
        },
      );
      return;
    }

    createMutation.mutate(result.data, {
      onSuccess: (savedVehicle) => {
        onSaved?.(savedVehicle);
        onClose();
      },
    });
  };

  const mutationError = activeMutation.error;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <button type="button" className="absolute inset-0 bg-slate-950/55" aria-label="Cerrar formulario de vehículo" onClick={onClose} />
      <section className="relative max-h-full w-full max-w-4xl overflow-y-auto rounded-lg bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="vehicle-form-title">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div>
            <h2 id="vehicle-form-title" className="text-lg font-semibold text-brand-blue">
              {isEditing ? 'Editar vehículo' : 'Nuevo vehículo'}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">Identificación, mecánica y propietario</p>
          </div>
          <button type="button" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Cerrar" title="Cerrar">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <form className="space-y-6 p-5 sm:p-6" noValidate onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">
              Patente
              <input
                className={`${inputClassName} font-mono font-bold uppercase`}
                value={form.patente}
                onChange={(event) => setValue('patente', normalizePlateInput(event.target.value))}
                aria-invalid={Boolean(fieldErrors.patente)}
                placeholder="ABCD12"
              />
              {fieldErrors.patente && <span className="mt-1 block text-xs text-red-600">{fieldErrors.patente}</span>}
            </label>
            <label className="text-sm font-medium text-slate-700">
              Marca
              <input className={inputClassName} value={form.marca} onChange={(event) => setValue('marca', event.target.value)} aria-invalid={Boolean(fieldErrors.marca)} placeholder="Toyota" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Modelo
              <input className={inputClassName} value={form.modelo} onChange={(event) => setValue('modelo', event.target.value)} aria-invalid={Boolean(fieldErrors.modelo)} placeholder="Corolla" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Año
              <input className={inputClassName} type="number" inputMode="numeric" value={form.ano} onChange={(event) => setValue('ano', event.target.value)} aria-invalid={Boolean(fieldErrors.ano)} min="1950" />
              {fieldErrors.ano && <span className="mt-1 block text-xs text-red-600">{fieldErrors.ano}</span>}
            </label>
            <label className="text-sm font-medium text-slate-700">
              Color
              <input className={inputClassName} value={form.color} onChange={(event) => setValue('color', event.target.value)} aria-invalid={Boolean(fieldErrors.color)} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Kilometraje actual
              <input className={inputClassName} type="number" inputMode="numeric" value={form.kilometraje} onChange={(event) => setValue('kilometraje', event.target.value)} aria-invalid={Boolean(fieldErrors.kilometraje)} min="0" />
              {fieldErrors.kilometraje && <span className="mt-1 block text-xs text-red-600">{fieldErrors.kilometraje}</span>}
            </label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">
              VIN / Chasis
              <input className={`${inputClassName} uppercase`} value={form.vinChasis} onChange={(event) => setValue('vinChasis', event.target.value.toUpperCase())} aria-invalid={Boolean(fieldErrors.vinChasis)} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Motor
              <input className={inputClassName} value={form.motor} onChange={(event) => setValue('motor', event.target.value)} aria-invalid={Boolean(fieldErrors.motor)} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Combustible
              <select className={inputClassName} value={form.combustible} onChange={(event) => setValue('combustible', event.target.value)}>
                <option value="">Sin especificar</option>
                <option value="bencina">Bencina</option>
                <option value="diesel">Diésel</option>
                <option value="hibrido">Híbrido</option>
                <option value="electrico">Eléctrico</option>
                <option value="gas">Gas</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Transmisión
              <select className={inputClassName} value={form.transmision} onChange={(event) => setValue('transmision', event.target.value)}>
                <option value="">Sin especificar</option>
                <option value="manual">Manual</option>
                <option value="automatica">Automática</option>
                <option value="cvt">CVT</option>
              </select>
            </label>
          </div>

          <fieldset className="border-t border-slate-100 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <legend className="text-sm font-semibold text-brand-blue">Propietario</legend>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={withoutOwner}
                  onChange={(event) => {
                    setWithoutOwner(event.target.checked);
                    if (event.target.checked) {
                      setSelectedClient(null);
                      setOwnerSearch('');
                    }
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-yellow"
                />
                Sin dueño asignado por ahora
              </label>
            </div>

            {!withoutOwner && (
              <div className="mt-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
                  <input
                    className={`${inputClassName} pl-9`}
                    value={ownerSearch}
                    onChange={(event) => {
                      setOwnerSearch(event.target.value);
                      setSelectedClient(null);
                    }}
                    aria-invalid={Boolean(fieldErrors.clientId)}
                    placeholder="Buscar cliente por nombre o RUT"
                  />
                </div>
                {fieldErrors.clientId && <p className="mt-1 text-xs text-red-600">{fieldErrors.clientId}</p>}

                {selectedClient ? (
                  <div className="mt-2 flex items-center gap-2 border-l-2 border-brand-yellow px-3 py-2 text-sm text-slate-700">
                    <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                    <span className="font-semibold">{selectedClient.nombre}</span>
                    <span className="text-slate-500">{selectedClient.rut ?? 'Sin RUT'}</span>
                  </div>
                ) : (
                  <div className="mt-2 max-h-40 overflow-y-auto border-y border-slate-100">
                    {clientsQuery.isFetching && <p className="px-3 py-3 text-sm text-slate-500">Buscando clientes...</p>}
                    {!clientsQuery.isFetching && clientsQuery.data?.items.length === 0 && (
                      <p className="px-3 py-3 text-sm text-slate-500">No se encontraron clientes</p>
                    )}
                    {clientsQuery.data?.items.map((clientOption) => (
                      <button
                        key={clientOption.id}
                        type="button"
                        className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-left last:border-0 hover:bg-slate-50"
                        onClick={() => {
                          setSelectedClient(clientOption);
                          setOwnerSearch(clientOption.nombre);
                          setFieldErrors((current) => {
                            const next = { ...current };
                            delete next.clientId;
                            return next;
                          });
                        }}
                      >
                        <UserRound className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-800">{clientOption.nombre}</span>
                          <span className="block text-xs text-slate-500">{clientOption.rut ?? 'Sin RUT'}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </fieldset>

          {mutationError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{isApiConflict(mutationError) ? 'Ya existe un vehículo con esa patente.' : getApiErrorMessage(mutationError)}</span>
            </div>
          )}

          <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <button type="button" className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={onClose} disabled={activeMutation.isPending}>Cancelar</button>
            <button type="submit" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-blue px-5 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60" disabled={activeMutation.isPending}>
              {activeMutation.isPending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {activeMutation.isPending ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear vehículo'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
};

export default VehicleFormModal;
