import { createVehicleSchema, formatChilePatente, isValidChilePatente, normalizeChilePatente } from '@unithor/shared';
import { AlertCircle, Camera, Car, Check, LoaderCircle, Search, Trash2, Upload, UserRound } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useClients } from '../../hooks/useClients';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useModalOverlay } from '../../hooks/useModalOverlay';
import {
  useCreateVehicleMutation,
  useDeleteVehiclePhotoMutation,
  useUpdateVehicleMutation,
  useUploadVehiclePhotoMutation,
} from '../../hooks/useVehicles';
import { getApiErrorMessage, isApiConflict } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';
import ModalHeader from '../common/ModalHeader';

import type { Client, Vehicle } from '../../types/entities';



interface VehicleFormModalProps {
  vehicle?: Vehicle | null;
  initialPatente?: string;
  suggestedClient?: Pick<Client, 'id' | 'nombre' | 'rut'> | null;
  onClose: () => void;
  onSaved?: (vehicle: Vehicle) => void;
}

interface VehicleFormState {
  patente: string;
  esExtranjera: boolean;
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

const normalizePlateInput = (value: string, isForeign: boolean): string => {
  if (isForeign) {
    return value.toUpperCase().slice(0, 15);
  }
  const normalized = value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8);
  return isValidChilePatente(normalized) ? formatChilePatente(normalized) : normalized;
};

const getInitialState = (vehicle?: Vehicle | null, initialPatente = ''): VehicleFormState => {
  const rawPlate = vehicle?.patente ?? initialPatente;
  const isForeign = rawPlate.trim() !== '' ? !isValidChilePatente(rawPlate) : false;

  return {
    patente: isForeign ? rawPlate.toUpperCase().slice(0, 15) : normalizePlateInput(rawPlate, false),
    esExtranjera: isForeign,
    marca: vehicle?.marca ?? '',
    modelo: vehicle?.modelo ?? '',
    ano: vehicle?.ano?.toString() ?? '',
    color: vehicle?.color ?? '',
    vinChasis: vehicle?.vinChasis ?? '',
    motor: vehicle?.motor ?? '',
    kilometraje: vehicle?.kilometraje?.toString() ?? '',
    combustible: vehicle?.combustible ?? '',
    transmision: vehicle?.transmision ?? '',
  };
};

const inputClassName =
  'h-10 w-full rounded-lg border border-brand-line bg-white px-3 text-sm outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15 aria-[invalid=true]:border-brand-coralInk';

export const VehicleFormModal = ({
  vehicle,
  initialPatente = '',
  suggestedClient = null,
  onClose,
  onSaved,
}: VehicleFormModalProps) => {
  const [form, setForm] = useState<VehicleFormState>(() => getInitialState(vehicle, initialPatente));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [ownerSearch, setOwnerSearch] = useState(vehicle?.client?.nombre ?? suggestedClient?.nombre ?? '');
  const [selectedClient, setSelectedClient] = useState<Pick<Client, 'id' | 'nombre' | 'rut'> | null>(
    vehicle?.client
      ? { id: vehicle.client.id, nombre: vehicle.client.nombre, rut: vehicle.client.rut }
      : suggestedClient,
  );
  const [withoutOwner, setWithoutOwner] = useState(vehicle?.clientId === null || (!vehicle && !suggestedClient));
  const debouncedOwnerSearch = useDebouncedValue(ownerSearch, 300);
  const clientsQuery = useClients({ page: 1, pageSize: 8, search: debouncedOwnerSearch || undefined });
  const createMutation = useCreateVehicleMutation();
  const updateMutation = useUpdateVehicleMutation();
  const uploadPhotoMutation = useUploadVehiclePhotoMutation();
  const deletePhotoMutation = useDeleteVehiclePhotoMutation();
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(vehicle?.fotoUrl ?? null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEditing = Boolean(vehicle);
  const user = useAuthStore((state) => state.user);
  const canUpdate = Boolean(user && (hasUserPermission(user, 'taller', 'update') || hasUserPermission(user, 'comercial', 'update')));
  const canSave = isEditing ? canUpdate : Boolean(user && (hasUserPermission(user, 'taller', 'create') || hasUserPermission(user, 'comercial', 'create')));
  const [savedVehicle, setSavedVehicle] = useState<Vehicle | null>(null);
  const savedPayload = useRef<string | null>(null);
  const savingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const activeMutation = vehicle || savedVehicle ? updateMutation : createMutation;
  const plateRef = useRef<HTMLInputElement>(null);
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

  const setValue = <K extends keyof VehicleFormState>(key: K, value: VehicleFormState[K]): void => {
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

    const candidate = {
      ...form,
      esExtranjera: form.esExtranjera,
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

  const setPanelNode = useModalOverlay({ isOpen: true, onClose: close, isPending: isSaving, initialFocusRef: plateRef });
  return createPortal(
    <div className="reference-modal-overlay fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-4 sm:items-center sm:py-6">
      <button type="button" className="fixed inset-0 bg-[#18273c55] backdrop-blur-sm transition-opacity" aria-label="Cerrar formulario de vehículo" onClick={close} disabled={isSaving} tabIndex={-1} />
      <motion.section
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="workspace-form-dialog workspace-dialog reference-dialog reference-form-dialog vehicle-form-dialog relative max-h-full w-full max-w-[720px] border border-brand-line bg-white shadow-2xl"
        role="dialog" ref={setPanelNode}
        aria-modal="true"
        aria-labelledby="vehicle-form-title"
        tabIndex={-1}
      >
        <ModalHeader
          id="vehicle-form-title"
          title={isEditing ? 'Editar vehículo' : 'Nuevo vehículo'}
          description="Identificación, mecánica y propietario"
          badge={<Car aria-hidden="true" />}
          onClose={close}
          closeDisabled={isSaving}
        />

        <form className="workspace-form reference-form" noValidate onSubmit={handleSubmit} aria-busy={isSaving}>
          <div className="workspace-form-body reference-form-body">
          <fieldset className="reference-form-sections" disabled={isSaving || !canSave}>
          <legend className="sr-only">Datos del vehículo</legend>
          <div className="vehicle-form-section-heading"><h3>Identificación y mecánica</h3><span>La patente identifica al vehículo</span></div>
          <div className="reference-form-group vehicle-technical-form-grid grid gap-4 sm:grid-cols-2">
            <div className="vehicle-form-field-plate">
              <label className="text-sm font-medium text-brand-ink">
                Patente
                <input
                  ref={plateRef}
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
              {fieldErrors.patente && <span className="mt-1 block text-xs text-brand-coralInk">{fieldErrors.patente}</span>}
            </div>
            <label className="text-sm font-medium text-brand-ink">
              Marca
              <input className={inputClassName} value={form.marca} onChange={(event) => setValue('marca', event.target.value)} aria-invalid={Boolean(fieldErrors.marca)} placeholder="Toyota" />
            </label>
            <label className="text-sm font-medium text-brand-ink">
              Modelo
              <input className={inputClassName} value={form.modelo} onChange={(event) => setValue('modelo', event.target.value)} aria-invalid={Boolean(fieldErrors.modelo)} placeholder="Corolla" />
            </label>
            <label className="text-sm font-medium text-brand-ink">
              Año
              <input className={inputClassName} type="number" inputMode="numeric" value={form.ano} onChange={(event) => setValue('ano', event.target.value)} aria-invalid={Boolean(fieldErrors.ano)} min="1950" />
              {fieldErrors.ano && <span className="mt-1 block text-xs text-brand-coralInk">{fieldErrors.ano}</span>}
            </label>
            <label className="text-sm font-medium text-brand-ink">
              Color
              <input className={inputClassName} value={form.color} onChange={(event) => setValue('color', event.target.value)} aria-invalid={Boolean(fieldErrors.color)} />
            </label>
            <label className="text-sm font-medium text-brand-ink">
              Kilometraje actual
              <input className={inputClassName} type="number" inputMode="numeric" value={form.kilometraje} onChange={(event) => setValue('kilometraje', event.target.value)} aria-invalid={Boolean(fieldErrors.kilometraje)} min="0" />
              {fieldErrors.kilometraje && <span className="mt-1 block text-xs text-brand-coralInk">{fieldErrors.kilometraje}</span>}
            </label>
            <label className="vehicle-form-field-vin text-sm font-medium text-brand-ink">
              VIN / Chasis
              <input className={`${inputClassName} uppercase`} value={form.vinChasis} onChange={(event) => setValue('vinChasis', event.target.value.toUpperCase())} aria-invalid={Boolean(fieldErrors.vinChasis)} />
            </label>
            <label className="vehicle-form-field-engine text-sm font-medium text-brand-ink">
              Motor
              <input className={inputClassName} value={form.motor} onChange={(event) => setValue('motor', event.target.value)} aria-invalid={Boolean(fieldErrors.motor)} />
            </label>
            <label className="text-sm font-medium text-brand-ink">
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
            <label className="text-sm font-medium text-brand-ink">
              Transmisión
              <select className={inputClassName} value={form.transmision} onChange={(event) => setValue('transmision', event.target.value)}>
                <option value="">Sin especificar</option>
                <option value="manual">Manual</option>
                <option value="automatica">Automática</option>
                <option value="cvt">CVT</option>
              </select>
            </label>
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


          <fieldset className="reference-form-group vehicle-owner-selector">
            <legend className="text-sm font-semibold text-brand-primaryInk">Propietario</legend>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-brand-muted">
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
                  className="h-4 w-4 rounded border-brand-line text-brand-primaryInk focus:ring-brand-primary"
                />
                Sin dueño asignado por ahora
              </label>
            </div>

            {!withoutOwner && (
              <div className="mt-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-brand-muted" aria-hidden="true" />
                  <input
                    className={`${inputClassName} pl-9`}
                    value={ownerSearch}
                    onChange={(event) => {
                      setOwnerSearch(event.target.value);
                      setSelectedClient(null);
                    }}
                    aria-invalid={Boolean(fieldErrors.clientId)}
                    aria-label="Buscar propietario"
                    placeholder="Buscar cliente por nombre o RUT"
                  />
                </div>
                {fieldErrors.clientId && <p className="mt-1 text-xs text-brand-coralInk">{fieldErrors.clientId}</p>}

                {selectedClient ? (
                  <div className="vehicle-owner-selected mt-2 flex items-center gap-2 border-l-2 border-brand-gold px-3 py-2 text-sm text-brand-ink">
                    <Check className="h-4 w-4 text-brand-mintInk" aria-hidden="true" />
                    <span className="font-semibold">{selectedClient.nombre}</span>
                    <span className="text-brand-muted">{selectedClient.rut ?? 'Sin RUT'}</span>
                  </div>
                ) : (
                  <div className="vehicle-owner-results mt-2 max-h-40 overflow-y-auto border-y border-brand-line">
                    {clientsQuery.isFetching && <p className="px-3 py-3 text-sm text-brand-muted">Buscando clientes...</p>}
                    {!clientsQuery.isFetching && clientsQuery.data?.items.length === 0 && (
                      <p className="px-3 py-3 text-sm text-brand-muted">No se encontraron clientes</p>
                    )}
                    {clientsQuery.data?.items.map((clientOption) => (
                      <button
                        key={clientOption.id}
                        type="button"
                        className="flex w-full items-center gap-3 border-b border-brand-line px-3 py-2.5 text-left last:border-0 hover:bg-brand-pale"
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
                        <UserRound className="h-4 w-4 shrink-0 text-brand-muted" aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-brand-ink">{clientOption.nombre}</span>
                          <span className="block text-xs text-brand-muted">{clientOption.rut ?? 'Sin RUT'}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </fieldset>

          {mutationError && (
            <div className="flex items-start gap-2 rounded-lg border border-brand-coral/30 bg-brand-coralPale px-3 py-2.5 text-sm text-brand-coralInk" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{isApiConflict(mutationError) ? 'Ya existe un vehículo con esa patente.' : getApiErrorMessage(mutationError)}</span>
            </div>
          )}

          </fieldset>
          </div>
          <footer className="workspace-form-footer reference-dialog-footer dialog-buttons">
            <button type="button" className="secondary-button" onClick={close} disabled={isSaving}>Cancelar</button>
            <button type="submit" className="primary-button" disabled={isSaving || !canSave}>
              {isSaving && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {isSaving ? 'Guardando...' : vehicle || savedVehicle ? 'Guardar cambios' : 'Crear vehículo'}
            </button>
          </footer>
        </form>
      </motion.section>
    </div>,
    document.body,
  );
};

export default VehicleFormModal;
