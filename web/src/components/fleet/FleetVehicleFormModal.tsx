import { createFleetVehicleSchema, normalizeChilePatente } from '@unithor/shared';
import { AlertCircle, LoaderCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';

import {
  useCreateFleetVehicleMutation,
  useUpdateFleetVehicleMutation,
} from '../../hooks/useFleetVehicles';
import { useModalOverlay } from '../../hooks/useModalOverlay';
import { getApiErrorMessage, isApiConflict } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';
import ModalHeader from '../common/ModalHeader';

import type { FleetVehicle } from '../../types/entities';

interface FleetVehicleFormModalProps {
  vehicle?: FleetVehicle | null;
  onClose: () => void;
  onSaved?: (vehicle: FleetVehicle) => void;
}

interface FleetVehicleFormState {
  patente: string;
  codigoInterno: string;
  marca: string;
  modelo: string;
  ano: string;
  color: string;
  vinChasis: string;
  motor: string;
  kilometraje: string;
  combustible: string;
  transmision: string;
  estadoOperativo: FleetVehicle['estadoOperativo'];
  sucursal: string;
  responsable: string;
}

const normalizePlateInput = (value: string): string => normalizeChilePatente(value).slice(0, 8);

const getInitialState = (vehicle?: FleetVehicle | null): FleetVehicleFormState => ({
  patente: vehicle?.patente ?? '',
  codigoInterno: vehicle?.codigoInterno ?? '',
  marca: vehicle?.marca ?? '',
  modelo: vehicle?.modelo ?? '',
  ano: vehicle?.ano?.toString() ?? '',
  color: vehicle?.color ?? '',
  vinChasis: vehicle?.vinChasis ?? '',
  motor: vehicle?.motor ?? '',
  kilometraje: vehicle?.kilometraje?.toString() ?? '',
  combustible: vehicle?.combustible ?? '',
  transmision: vehicle?.transmision ?? '',
  estadoOperativo: vehicle?.estadoOperativo ?? 'disponible',
  sucursal: vehicle?.sucursal ?? '',
  responsable: vehicle?.responsable ?? '',
});

const inputClassName =
  'h-10 w-full rounded-lg border border-brand-line bg-white px-3 text-sm outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15 aria-[invalid=true]:border-brand-coralInk';

/** Alta y edición de vehículos internos de la empresa. No tienen cliente ni dueño. */
export const FleetVehicleFormModal = ({
  vehicle,
  onClose,
  onSaved,
}: FleetVehicleFormModalProps) => {
  const [form, setForm] = useState<FleetVehicleFormState>(() => getInitialState(vehicle));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const createMutation = useCreateFleetVehicleMutation();
  const updateMutation = useUpdateFleetVehicleMutation();
  const isEditing = Boolean(vehicle);
  const activeMutation = isEditing ? updateMutation : createMutation;

  const setValue = <K extends keyof FleetVehicleFormState>(
    key: K,
    value: FleetVehicleFormState[K],
  ): void => {
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
    };
    const result = createFleetVehicleSchema.safeParse(candidate);
    if (!result.success) {
      setFieldErrors(getFieldErrors(result.error.issues));
      return;
    }

    const onSuccess = (savedVehicle: FleetVehicle): void => {
      onSaved?.(savedVehicle);
      onClose();
    };

    if (vehicle) {
      updateMutation.mutate({ id: vehicle.id, data: result.data }, { onSuccess });
      return;
    }

    createMutation.mutate(result.data, { onSuccess });
  };

  const mutationError = activeMutation.error;
  const setPanelNode = useModalOverlay({
    isOpen: true,
    onClose,
    isPending: activeMutation.isPending,
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto px-4 py-4 sm:items-center sm:py-6">
      <button
        type="button"
        className="fixed inset-0 bg-[#18273c55] backdrop-blur-sm transition-opacity"
        aria-label="Cerrar formulario de vehículo de flota"
        onClick={onClose}
      />
      <motion.section
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="relative max-h-full w-full max-w-[760px] overflow-y-auto rounded-2xl border border-brand-line bg-white shadow-2xl"
        role="dialog"
        ref={setPanelNode}
        aria-modal="true"
        aria-labelledby="fleet-vehicle-form-title"
      >
        <ModalHeader
          id="fleet-vehicle-form-title"
          title={isEditing ? 'Editar vehículo de flota' : 'Nuevo vehículo de flota'}
          description="Uso interno de la empresa, sin cliente ni propietario externo"
          onClose={onClose}
        />

        <form className="space-y-6 p-5 pt-0 sm:p-6 sm:pt-0" noValidate onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-medium text-brand-ink">
              Patente
              <input
                className={`${inputClassName} font-mono font-bold uppercase`}
                value={form.patente}
                onChange={(event) => setValue('patente', normalizePlateInput(event.target.value))}
                aria-invalid={Boolean(fieldErrors.patente)}
                placeholder="AB1234 o ABCD12"
              />
              {fieldErrors.patente && (
                <span className="mt-1 block text-xs text-brand-coralInk">{fieldErrors.patente}</span>
              )}
            </label>
            <label className="text-sm font-medium text-brand-ink">
              Código interno
              <input
                className={`${inputClassName} font-mono uppercase`}
                value={form.codigoInterno}
                onChange={(event) => setValue('codigoInterno', event.target.value.toUpperCase())}
                aria-invalid={Boolean(fieldErrors.codigoInterno)}
                placeholder="FLT-001"
              />
              {fieldErrors.codigoInterno && (
                <span className="mt-1 block text-xs text-brand-coralInk">
                  {fieldErrors.codigoInterno}
                </span>
              )}
            </label>
            <label className="text-sm font-medium text-brand-ink">
              Estado operativo
              <select
                className={inputClassName}
                value={form.estadoOperativo}
                onChange={(event) =>
                  setValue('estadoOperativo', event.target.value as FleetVehicle['estadoOperativo'])
                }
              >
                <option value="disponible">Disponible</option>
                <option value="en_mantencion">En mantención</option>
                <option value="fuera_de_servicio">Fuera de servicio</option>
              </select>
            </label>
            <label className="text-sm font-medium text-brand-ink">
              Marca
              <input
                className={inputClassName}
                value={form.marca}
                onChange={(event) => setValue('marca', event.target.value)}
                aria-invalid={Boolean(fieldErrors.marca)}
                placeholder="Toyota"
              />
            </label>
            <label className="text-sm font-medium text-brand-ink">
              Modelo
              <input
                className={inputClassName}
                value={form.modelo}
                onChange={(event) => setValue('modelo', event.target.value)}
                aria-invalid={Boolean(fieldErrors.modelo)}
                placeholder="Hilux"
              />
            </label>
            <label className="text-sm font-medium text-brand-ink">
              Año
              <input
                className={inputClassName}
                type="number"
                inputMode="numeric"
                value={form.ano}
                onChange={(event) => setValue('ano', event.target.value)}
                aria-invalid={Boolean(fieldErrors.ano)}
                min="1950"
              />
              {fieldErrors.ano && (
                <span className="mt-1 block text-xs text-brand-coralInk">{fieldErrors.ano}</span>
              )}
            </label>
            <label className="text-sm font-medium text-brand-ink">
              Color
              <input
                className={inputClassName}
                value={form.color}
                onChange={(event) => setValue('color', event.target.value)}
                aria-invalid={Boolean(fieldErrors.color)}
              />
            </label>
            <label className="text-sm font-medium text-brand-ink">
              Kilometraje actual
              <input
                className={inputClassName}
                type="number"
                inputMode="numeric"
                value={form.kilometraje}
                onChange={(event) => setValue('kilometraje', event.target.value)}
                aria-invalid={Boolean(fieldErrors.kilometraje)}
                min="0"
              />
              {fieldErrors.kilometraje && (
                <span className="mt-1 block text-xs text-brand-coralInk">
                  {fieldErrors.kilometraje}
                </span>
              )}
            </label>
            <label className="text-sm font-medium text-brand-ink">
              Combustible
              <select
                className={inputClassName}
                value={form.combustible}
                onChange={(event) => setValue('combustible', event.target.value)}
              >
                <option value="">Sin especificar</option>
                <option value="bencina">Bencina</option>
                <option value="diesel">Diésel</option>
                <option value="hibrido">Híbrido</option>
                <option value="electrico">Eléctrico</option>
                <option value="gas">Gas</option>
              </select>
            </label>
            <label className="text-sm font-medium text-brand-ink sm:col-span-2">
              VIN / Chasis
              <input
                className={`${inputClassName} uppercase`}
                value={form.vinChasis}
                onChange={(event) => setValue('vinChasis', event.target.value.toUpperCase())}
                aria-invalid={Boolean(fieldErrors.vinChasis)}
              />
            </label>
            <label className="text-sm font-medium text-brand-ink">
              Motor
              <input
                className={inputClassName}
                value={form.motor}
                onChange={(event) => setValue('motor', event.target.value)}
                aria-invalid={Boolean(fieldErrors.motor)}
              />
            </label>
            <label className="text-sm font-medium text-brand-ink">
              Transmisión
              <select
                className={inputClassName}
                value={form.transmision}
                onChange={(event) => setValue('transmision', event.target.value)}
              >
                <option value="">Sin especificar</option>
                <option value="manual">Manual</option>
                <option value="automatica">Automática</option>
                <option value="cvt">CVT</option>
              </select>
            </label>
            <label className="text-sm font-medium text-brand-ink">
              Sucursal
              <input
                className={inputClassName}
                value={form.sucursal}
                onChange={(event) => setValue('sucursal', event.target.value)}
                aria-invalid={Boolean(fieldErrors.sucursal)}
                placeholder="Casa matriz"
              />
            </label>
            <label className="text-sm font-medium text-brand-ink sm:col-span-2 lg:col-span-3">
              Responsable
              <input
                className={inputClassName}
                value={form.responsable}
                onChange={(event) => setValue('responsable', event.target.value)}
                aria-invalid={Boolean(fieldErrors.responsable)}
                placeholder="Nombre de quien tiene el vehículo a cargo"
              />
              {fieldErrors.responsable && (
                <span className="mt-1 block text-xs text-brand-coralInk">
                  {fieldErrors.responsable}
                </span>
              )}
            </label>
          </div>

          {mutationError && (
            <div
              className="flex items-start gap-2 rounded-lg border border-brand-coral/30 bg-brand-coralPale px-3 py-2.5 text-sm text-brand-coralInk"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {isApiConflict(mutationError)
                  ? 'Ya existe un vehículo con esa patente o código interno.'
                  : getApiErrorMessage(mutationError)}
              </span>
            </div>
          )}

          <footer className="dialog-buttons border-t border-brand-line pt-5">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={activeMutation.isPending}
            >
              Cancelar
            </button>
            <button type="submit" className="primary-button" disabled={activeMutation.isPending}>
              {activeMutation.isPending && (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              {activeMutation.isPending
                ? 'Guardando...'
                : isEditing
                  ? 'Guardar cambios'
                  : 'Crear vehículo de flota'}
            </button>
          </footer>
        </form>
      </motion.section>
    </div>
  );
};

export default FleetVehicleFormModal;
