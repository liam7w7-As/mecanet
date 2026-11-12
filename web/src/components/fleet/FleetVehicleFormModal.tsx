import { createFleetVehicleSchema, formatChilePatente, isValidChilePatente, normalizeChilePatente } from '@unithor/shared';
import { AlertCircle, Camera, Car, LoaderCircle, Trash2, Upload } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  useCreateFleetVehicleMutation,
  useDeleteFleetVehiclePhotoMutation,
  useUpdateFleetVehicleMutation,
  useUploadFleetVehiclePhotoMutation,
} from '../../hooks/useFleetVehicles';
import { useModalOverlay } from '../../hooks/useModalOverlay';
import { getApiErrorMessage, isApiConflict } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';
import ModalHeader from '../common/ModalHeader';

import type { FleetVehicle } from '../../types/entities';

interface FleetVehicleFormModalProps {
  vehicle?: FleetVehicle | null;
  onClose: () => void;
  onSaved?: (vehicle: FleetVehicle) => void;
}

interface FleetVehicleFormState {
  patente: string;
  esExtranjera: boolean;
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
  propietario: string;
  motivoBaja: string;
}

const normalizePlateInput = (value: string, isForeign: boolean): string => {
  if (isForeign) {
    return value.toUpperCase().slice(0, 15);
  }
  const normalized = value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8);
  return isValidChilePatente(normalized) ? formatChilePatente(normalized) : normalized;
};

const getInitialState = (vehicle?: FleetVehicle | null): FleetVehicleFormState => {
  const rawPlate = vehicle?.patente ?? '';
  const isForeign = rawPlate.trim() !== '' ? !isValidChilePatente(rawPlate) : false;

  return {
    patente: isForeign ? rawPlate.toUpperCase().slice(0, 15) : (rawPlate ? formatChilePatente(rawPlate) : ''),
    esExtranjera: isForeign,
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
    propietario: vehicle?.propietario ?? '',
    motivoBaja: vehicle?.motivoBaja ?? '',
  };
};

const inputClassName =
  'h-10 w-full rounded-lg border border-brand-line bg-white px-3 text-sm outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15 aria-[invalid=true]:border-brand-coralInk';

/** Alta y edición de vehículos internos de la empresa. */
export const FleetVehicleFormModal = ({
  vehicle,
  onClose,
  onSaved,
}: FleetVehicleFormModalProps) => {
  const [form, setForm] = useState<FleetVehicleFormState>(() => getInitialState(vehicle));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const createMutation = useCreateFleetVehicleMutation();
  const updateMutation = useUpdateFleetVehicleMutation();
  const uploadPhotoMutation = useUploadFleetVehiclePhotoMutation();
  const deletePhotoMutation = useDeleteFleetVehiclePhotoMutation();
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(vehicle?.fotoUrl ?? null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEditing = Boolean(vehicle);
  const user = useAuthStore((state) => state.user);
  const canEditOwner = user?.role === 'admin' || user?.role === 'desarrollador';
  const canUpdate = Boolean(user && hasUserPermission(user, 'flota', 'update'));
  const canSave = isEditing ? canUpdate : Boolean(user && hasUserPermission(user, 'flota', 'create'));
  const [savedVehicle, setSavedVehicle] = useState<FleetVehicle | null>(null);
  const savedPayload = useRef<string | null>(null);
  const savingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const activeMutation = vehicle || savedVehicle ? updateMutation : createMutation;
  const close = (): void => { if (!savingRef.current) onClose(); };

  useEffect(() => {
    if (!selectedPhotoFile) {
      setPhotoPreviewUrl(removePhoto ? null : (vehicle?.fotoUrl ?? null));
      return;
    }
    const preview = URL.createObjectURL(selectedPhotoFile);
    setPhotoPreviewUrl(preview);
    return () => URL.revokeObjectURL(preview);
  }, [selectedPhotoFile, removePhoto, vehicle]);

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !canUpdate || savingRef.current) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setPhotoError('Seleccione una foto JPG, PNG o WebP de hasta 8 MB.');
      return;
    }
    setPhotoError(null);
    setSelectedPhotoFile(file);
    setRemovePhoto(false);
  };

  const handleRemovePhoto = (): void => {
    if (!canUpdate || savingRef.current) return;
    setPhotoError(null);
    setSelectedPhotoFile(null);
    setRemovePhoto(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePlateBlur = (): void => {
    if (!form.esExtranjera && isValidChilePatente(form.patente)) {
      setValue('patente', formatChilePatente(form.patente));
    }
  };

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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (savingRef.current || !canSave) return;
    setFieldErrors({});
    createMutation.reset();
    updateMutation.reset();
    uploadPhotoMutation.reset();
    deletePhotoMutation.reset();
    setPhotoError(null);

    const { propietario, motivoBaja, ...publicForm } = form;
    const candidate = {
      ...publicForm,
      esExtranjera: form.esExtranjera,
      ano: form.ano === '' ? null : Number(form.ano),
      kilometraje: form.kilometraje === '' ? null : Number(form.kilometraje),
      ...(canEditOwner ? { propietario: propietario.trim() || null } : {}),
      ...(form.estadoOperativo === 'dado_de_baja' ? { motivoBaja } : {}),
    };
    const result = createFleetVehicleSchema.safeParse(candidate);
    if (!result.success) {
      setFieldErrors(getFieldErrors(result.error.issues));
      return;
    }

    savingRef.current = true;
    setIsSaving(true);
    let current = savedVehicle;
    try {
      const payload = JSON.stringify(result.data);
      if (!current || savedPayload.current !== payload) {
        const target = current ?? vehicle;
        if (target && !canUpdate) return;
        current = target
          ? await updateMutation.mutateAsync({ id: target.id, data: result.data })
          : await createMutation.mutateAsync(result.data);
        savedPayload.current = payload;
        setSavedVehicle(current);
      }
      try {
        if (selectedPhotoFile || removePhoto) {
          if (!canUpdate) {
            setPhotoError('Se requiere permiso de edición para modificar la foto.');
            return;
          }
          if (selectedPhotoFile) {
            current = await uploadPhotoMutation.mutateAsync({ id: current.id, file: selectedPhotoFile });
          } else if (current.fotoUrl) {
            current = await deletePhotoMutation.mutateAsync(current.id);
          }
        }
      } catch (error) {
        setPhotoError(getApiErrorMessage(error, 'No fue posible guardar la foto. Intente nuevamente.'));
        return;
      }
    } catch {
      // Las mutaciones conservan el error de los datos para mostrarlo en el formulario.
      return;
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
    onSaved?.(current);
    onClose();
  };

  const mutationError = activeMutation.error;
  const setPanelNode = useModalOverlay({
    isOpen: true,
    onClose: close,
    isPending: isSaving,
  });

  return createPortal(
    <div className="reference-modal-overlay fixed inset-0 z-[60] flex items-start justify-center px-4 py-4 sm:items-center sm:py-6">
      <button
        type="button"
        className="fixed inset-0 bg-[#18273c55] backdrop-blur-sm transition-opacity"
        aria-label="Cerrar formulario de vehículo de flota"
        disabled={isSaving}
        onClick={close}
      />
      <motion.section
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="workspace-form-dialog workspace-dialog reference-dialog reference-form-dialog fleet-vehicle-form-dialog relative max-h-full w-full overflow-y-auto rounded-2xl border border-brand-line bg-white shadow-2xl"
        role="dialog"
        tabIndex={-1}
        ref={setPanelNode}
        aria-modal="true"
        aria-labelledby="fleet-vehicle-form-title"
      >
        <ModalHeader
          id="fleet-vehicle-form-title"
          title={isEditing ? 'Editar vehículo de flota' : 'Nuevo vehículo de flota'}
          description="Vehículo de uso interno de la empresa"
          onClose={close}
          closeDisabled={isSaving}
          badge={<Car aria-hidden="true" />}
        />

        <form className="workspace-form reference-form" noValidate onSubmit={handleSubmit} aria-busy={isSaving}>
          <div className="workspace-form-body reference-form-body">
            <fieldset disabled={isSaving || !canSave} className="min-w-0 space-y-5">
          <div className="vehicle-form-section-heading"><h3>Identificación y operación</h3><span>Flota de uso interno</span></div>
          <div className="vehicle-fleet-form-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="vehicle-form-field-plate">
              <label className="text-sm font-medium text-brand-ink">
                Patente
                <input
                  className={`${inputClassName} font-mono font-bold uppercase`}
                  value={form.patente}
                  onChange={(event) => setValue('patente', normalizePlateInput(event.target.value, form.esExtranjera))}
                  onBlur={handlePlateBlur}
                  aria-invalid={Boolean(fieldErrors.patente)}
                  placeholder={form.esExtranjera ? 'Ej: 1234-XYZ, ABC-123...' : 'AB1234 o ABCD12'}
                />
              </label>
              <div className="mt-1.5 flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-brand-muted hover:text-brand-ink select-none">
                  <input
                    type="checkbox"
                    checked={form.esExtranjera}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setValue('esExtranjera', checked);
                      if (checked) {
                        setValue('patente', form.patente.toUpperCase().slice(0, 15));
                      } else {
                        setValue('patente', normalizeChilePatente(form.patente).slice(0, 8));
                      }
                    }}
                    className="h-3.5 w-3.5 rounded border-brand-line text-brand-primaryInk focus:ring-brand-primary"
                  />
                  <span className="font-semibold text-brand-primaryInk">Patente extranjera</span>
                  <span className="text-[11px] text-slate-400 font-normal">(sin restricción ni guiones)</span>
                </label>
              </div>
              {fieldErrors.patente && (
                <span className="mt-1 block text-xs text-brand-coralInk">{fieldErrors.patente}</span>
              )}
            </div>
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
                <option value="dado_de_baja">Dado de baja</option>
              </select>
            </label>
            {form.estadoOperativo === 'dado_de_baja' && (
              <div className="vehicle-fleet-baja vehicle-form-field-wide space-y-3 rounded-lg border border-brand-line bg-brand-pale/40 p-4 sm:col-span-2 lg:col-span-3">
                <p id="fleet-vehicle-baja-help" className="text-sm leading-6 text-brand-muted">
                  Al guardar, el vehículo quedará dado de baja. Su ficha, documentos y versiones
                  se conservarán. La fecha se registra automáticamente al darlo de baja.
                </p>
                <label className="block text-sm font-medium text-brand-ink">
                  Motivo de baja (opcional)
                  <textarea
                    className={`${inputClassName} h-auto min-h-24 py-2`}
                    value={form.motivoBaja}
                    onChange={(event) => setValue('motivoBaja', event.target.value)}
                    maxLength={500}
                    aria-describedby="fleet-vehicle-baja-help"
                    aria-invalid={Boolean(fieldErrors.motivoBaja)}
                    rows={3}
                  />
                  {fieldErrors.motivoBaja && (
                    <span className="mt-1 block text-xs text-brand-coralInk">{fieldErrors.motivoBaja}</span>
                  )}
                </label>
              </div>
            )}
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
            <label className="vehicle-form-field-vin text-sm font-medium text-brand-ink sm:col-span-2">
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
            <label className="vehicle-form-field-wide vehicle-fleet-responsible text-sm font-medium text-brand-ink sm:col-span-2 lg:col-span-3">
              <span>Responsable / encargado del vehículo</span>
              <input
                className={inputClassName}
                value={form.responsable}
                onChange={(event) => setValue('responsable', event.target.value)}
                aria-invalid={Boolean(fieldErrors.responsable)}
                maxLength={120}
                aria-describedby="fleet-vehicle-responsable-help"
                placeholder="Encargado, taller o rentacar"
              />
              <span id="fleet-vehicle-responsable-help" className="mt-1 block text-xs font-normal text-brand-muted">
                Persona o entidad a cargo: encargado, taller o rentacar. Puede ser externa a la empresa.
              </span>
              {fieldErrors.responsable && (
                <span className="mt-1 block text-xs text-brand-coralInk">
                  {fieldErrors.responsable}
                </span>
              )}
            </label>
            {canEditOwner && (
              <label className="vehicle-form-field-wide vehicle-fleet-private text-sm font-medium text-brand-ink sm:col-span-2 lg:col-span-3">
                <span>Propietario (privado)</span>
                <input
                  className={inputClassName}
                  value={form.propietario}
                  onChange={(event) => setValue('propietario', event.target.value)}
                  maxLength={180}
                  aria-describedby="fleet-vehicle-propietario-help"
                  aria-invalid={Boolean(fieldErrors.propietario)}
                />
                <span id="fleet-vehicle-propietario-help" className="mt-1 block text-xs font-normal text-brand-muted">
                  Visible solo para administradores y desarrolladores.
                </span>
                {fieldErrors.propietario && (
                  <span className="mt-1 block text-xs text-brand-coralInk">{fieldErrors.propietario}</span>
                )}
              </label>
            )}
          </div>

          <fieldset disabled={!canUpdate} className="reference-form-group vehicle-photo-section border-t border-brand-line pt-4">
            <legend className="block text-sm font-semibold text-brand-primaryInk mb-2">Foto del vehículo (opcional)</legend>
            <div className="flex items-center gap-4">
              <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg border border-brand-line bg-slate-50 flex items-center justify-center">
                {photoPreviewUrl ? (
                  <>
                    <img src={photoPreviewUrl} alt="Vista previa del vehículo" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="absolute top-1 right-1 rounded bg-black/60 p-1 text-white hover:bg-black/80 transition"
                      title="Quitar foto"
                      aria-label="Quitar foto"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <Camera className="h-7 w-7 text-slate-300" />
                )}
              </div>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label="Seleccionar foto del vehículo"
                  onChange={handlePhotoChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="secondary-button inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {photoPreviewUrl ? 'Cambiar foto' : 'Seleccionar foto'}
                </button>
                <p className="mt-1 text-[11px] text-brand-muted">JPG, PNG o WebP hasta 8 MB.</p>
              </div>
            </div>
          </fieldset>
          {!canUpdate && <p className="text-xs text-brand-muted">Se requiere permiso de edición para modificar la foto.</p>}
          {photoError && <p role="alert" className="text-sm text-brand-coralInk">{photoError}</p>}
          {savedVehicle && <p role="status" className="text-sm text-brand-muted">Los datos del vehículo ya están guardados. Puede reintentar la foto.</p>}


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

          </fieldset>
          </div>
          <footer className="workspace-form-footer reference-dialog-footer dialog-buttons border-t border-brand-line pt-5">
            <button
              type="button"
              className="secondary-button"
              onClick={close}
              disabled={isSaving}
            >
              Cancelar
            </button>
            <button type="submit" className="primary-button" disabled={isSaving || !canSave}>
              {isSaving && (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              {isSaving
                ? 'Guardando...'
                : vehicle || savedVehicle
                  ? 'Guardar cambios'
                  : 'Crear vehículo de flota'}
            </button>
          </footer>
        </form>
      </motion.section>
    </div>,
    document.body,
  );
};

export default FleetVehicleFormModal;
