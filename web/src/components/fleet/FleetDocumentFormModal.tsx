import {
  createFleetDocumentSchema,
  FLEET_DOCUMENT_FILE_MIME_TYPES,
  getFleetRequiredDocumentType,
} from '@unithor/shared';
import { AlertCircle, FileText, LoaderCircle, Paperclip, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  fleetDocumentFileUrl,
  useCreateFleetDocumentMutation,
  useUpdateFleetDocumentMutation,
} from '../../hooks/useFleetVehicles';
import { useModalOverlay } from '../../hooks/useModalOverlay';
import { getApiErrorMessage } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';
import { formatDate } from '../../lib/formatters';
import ModalHeader from '../common/ModalHeader';

import type { FleetDocument } from '../../types/entities';

interface FleetDocumentFormModalProps {
  vehicleId: number;
  document?: FleetDocument | null;
  initialName?: string;
  onClose: () => void;
}

interface FleetDocumentFormState {
  nombre: string;
  referencia: string;
  fechaEmision: string;
  fechaVencimiento: string;
  notas: string;
}

const SUGGESTIONS = [
  'Permiso de circulación',
  'Revisión técnica',
  'SOAP',
  'Padrón del vehículo',
  'Mantención preventiva',
  'Mantención correctiva',
  'Certificado de emisiones',
];

const getInitialState = (document?: FleetDocument | null): FleetDocumentFormState => ({
  nombre: document?.nombre ?? '',
  referencia: document?.referencia ?? '',
  fechaEmision: document?.fechaEmision ?? '',
  fechaVencimiento: document?.fechaVencimiento ?? '',
  notas: document?.notas ?? '',
});

const inputClassName =
  'h-10 w-full rounded-lg border border-brand-line bg-white px-3 text-sm outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15 aria-[invalid=true]:border-brand-coralInk';

const formatBytes = (bytes: number | null): string => {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getFileError = (file: File | null): string | undefined => {
  if (!file) return undefined;
  if (file.size > 10 * 1024 * 1024) {
    return 'El archivo supera el límite de 10 MB. Selecciona uno más pequeño.';
  }
  if (
    !/\.(pdf|jpe?g|png|webp)$/i.test(file.name) ||
    !FLEET_DOCUMENT_FILE_MIME_TYPES.some((mimeType) => mimeType === file.type.toLowerCase())
  ) {
    return 'Formato de archivo no permitido. Selecciona un PDF, JPG, PNG o WebP.';
  }
  return undefined;
};

/**
 * Documento de flota: metadata libre y archivo opcional. Al reemplazar el
 * archivo se crea una versión y la anterior queda en el historial.
 */
export const FleetDocumentFormModal = ({
  vehicleId,
  document,
  initialName,
  onClose,
}: FleetDocumentFormModalProps) => {
  const [initialForm] = useState<FleetDocumentFormState>(() => ({
    ...getInitialState(document),
    ...(!document && initialName !== undefined ? { nombre: initialName } : {}),
  }));
  const [form, setForm] = useState(initialForm);
  const initialNoExpiry = !initialForm.fechaVencimiento && !getFleetRequiredDocumentType(initialForm.nombre);
  const [noExpiry, setNoExpiry] = useState(initialNoExpiry);
  const isRequiredDocument = getFleetRequiredDocumentType(form.nombre) !== null;
  const [file, setFile] = useState<File | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const continueEditingRef = useRef<HTMLButtonElement>(null);
  const submittingRef = useRef(false);
  const isEditing = Boolean(document);
  const createMutation = useCreateFleetDocumentMutation(vehicleId);
  const updateMutation = useUpdateFleetDocumentMutation(vehicleId, document?.id ?? 0);
  const activeMutation = isEditing ? updateMutation : createMutation;
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm) || file !== null ||
    noExpiry !== initialNoExpiry;
  const close = (): void => {
    if (submittingRef.current || activeMutation.isPending) return;
    if (dirty) setConfirmLeave(true);
    else onClose();
  };

  useEffect(() => {
    if (!dirty && !activeMutation.isPending) return;
    const warn = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, activeMutation.isPending]);

  useEffect(() => {
    if (confirmLeave) continueEditingRef.current?.focus();
  }, [confirmLeave]);

  const setValue = <K extends keyof FleetDocumentFormState>(
    key: K,
    value: FleetDocumentFormState[K],
  ): void => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const clearFile = (): void => {
    setFile(null);
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.file;
      return next;
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (submittingRef.current || activeMutation.isPending) return;
    setFieldErrors({});
    createMutation.reset();
    updateMutation.reset();

    const result = createFleetDocumentSchema.safeParse({
      ...form,
      fechaVencimiento: noExpiry ? '' : form.fechaVencimiento,
    });
    const fileError = getFileError(file);
    if (!result.success || fileError) {
      setFieldErrors({
        ...(!result.success ? getFieldErrors(result.error.issues) : {}),
        ...(fileError ? { file: fileError } : {}),
      });
      return;
    }

    submittingRef.current = true;
    const onSuccess = (): void => onClose();
    const onSettled = (): void => { submittingRef.current = false; };

    if (document) {
      updateMutation.mutate({ data: result.data, file }, { onSuccess, onSettled });
      return;
    }

    createMutation.mutate({ data: result.data, file }, { onSuccess, onSettled });
  };

  const mutationError = activeMutation.error;
  const previewUrl =
    document?.tieneArchivo && !file
      ? fleetDocumentFileUrl(vehicleId, document.id)
      : null;

  const setPanelNode = useModalOverlay({
    isOpen: true,
    onClose: close,
    isPending: activeMutation.isPending,
    initialFocusRef: nameInputRef,
  });

  return createPortal(
    <div className="reference-modal-overlay fixed inset-0 z-[70] flex items-start justify-center px-4 py-4 sm:items-center sm:py-6">
      <button
        type="button"
        className="fixed inset-0 bg-[#18273c55] backdrop-blur-sm transition-opacity"
        aria-label="Cerrar formulario de documento"
        onClick={close}
        disabled={activeMutation.isPending}
      />
      <motion.section
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="workspace-form-dialog workspace-dialog reference-dialog reference-form-dialog fleet-document-form-dialog relative max-h-full w-full overflow-y-auto rounded-2xl border border-brand-line bg-white shadow-2xl"
        role="dialog"
        tabIndex={-1}
        ref={setPanelNode}
        aria-modal="true"
        aria-labelledby="fleet-document-form-title"
        aria-busy={activeMutation.isPending}
      >
        <ModalHeader
          id="fleet-document-form-title"
          title={isEditing ? 'Editar documento' : 'Agregar documento'}
          eyebrow={document?.nombre ?? initialName}
          description="Nombre libre, referencia y fechas. El archivo es opcional."
          badge={<FileText aria-hidden="true" />}
          onClose={close}
          closeDisabled={activeMutation.isPending}
        />

        <form className="workspace-form reference-form" noValidate onSubmit={handleSubmit}>
          <div className="workspace-form-body reference-form-body">
            <fieldset disabled={activeMutation.isPending} className="min-w-0 space-y-5">
          <div className="fleet-document-fields grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-brand-ink sm:col-span-2">
              Nombre del documento
              <input
                className={inputClassName}
                list="fleet-document-suggestions"
                value={form.nombre}
                onChange={(event) => setValue('nombre', event.target.value)}
                aria-invalid={Boolean(fieldErrors.nombre)}
                placeholder="Ej: Permiso de circulación"
                ref={nameInputRef}
              />
              <datalist id="fleet-document-suggestions">
                {SUGGESTIONS.map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>
              {fieldErrors.nombre && (
                <span className="mt-1 block text-xs text-brand-coralInk">{fieldErrors.nombre}</span>
              )}
            </label>

            <label className="text-sm font-medium text-brand-ink sm:col-span-2">
              Referencia
              <input
                className={inputClassName}
                value={form.referencia}
                onChange={(event) => setValue('referencia', event.target.value)}
                aria-invalid={Boolean(fieldErrors.referencia)}
                placeholder="Folio, número de póliza o trámite"
              />
              {fieldErrors.referencia && (
                <span className="mt-1 block text-xs text-brand-coralInk">
                  {fieldErrors.referencia}
                </span>
              )}
            </label>

            <label className="text-sm font-medium text-brand-ink">
              Fecha de emisión
              <input
                className={inputClassName}
                type="date"
                value={form.fechaEmision}
                onChange={(event) => setValue('fechaEmision', event.target.value)}
                aria-invalid={Boolean(fieldErrors.fechaEmision)}
              />
              {fieldErrors.fechaEmision && (
                <span className="mt-1 block text-xs text-brand-coralInk">
                  {fieldErrors.fechaEmision}
                </span>
              )}
            </label>

            <div className="text-sm font-medium text-brand-ink">
              <label htmlFor="fleet-document-expiry">Fecha de vencimiento</label>
              <input
                id="fleet-document-expiry"
                className={inputClassName}
                type="date"
                value={form.fechaVencimiento}
                disabled={noExpiry}
                onChange={(event) => setValue('fechaVencimiento', event.target.value)}
                aria-invalid={Boolean(fieldErrors.fechaVencimiento)}
                aria-describedby="fleet-document-expiry-help"
              />
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={noExpiry}
                  onChange={(event) => {
                    setNoExpiry(event.target.checked);
                    setValue('fechaVencimiento', form.fechaVencimiento);
                  }}
                />
                {isRequiredDocument ? 'Fecha de vencimiento pendiente' : 'Sin vencimiento'}
              </label>
              {fieldErrors.fechaVencimiento && (
                <span className="mt-1 block text-xs text-brand-coralInk">
                  {fieldErrors.fechaVencimiento}
                </span>
              )}
              <span id="fleet-document-expiry-help" className="mt-1 block text-xs text-brand-muted">
                {isRequiredDocument ? 'Si aún no conoces el vencimiento, el documento quedará pendiente de completar.' : 'Opcional. Sin vencimiento, el documento no generará alertas.'}
              </span>
            </div>

            <label className="text-sm font-medium text-brand-ink sm:col-span-2">
              Notas
              <textarea
                className="min-h-24 w-full rounded-lg border border-brand-line bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15 aria-[invalid=true]:border-brand-coralInk"
                value={form.notas}
                onChange={(event) => setValue('notas', event.target.value)}
                aria-invalid={Boolean(fieldErrors.notas)}
                placeholder="Observaciones internas"
              />
              {fieldErrors.notas && (
                <span className="mt-1 block text-xs text-brand-coralInk">{fieldErrors.notas}</span>
              )}
            </label>
          </div>

          <fieldset className="fleet-document-upload border-t border-brand-line pt-5">
            <legend className="text-sm font-semibold text-brand-primaryInk">
              Archivo {isEditing ? '(reemplazo opcional)' : '(opcional)'}
            </legend>
            {document?.tieneArchivo && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-brand-line bg-brand-pale/40 px-3 py-2 text-xs text-brand-muted">
                <FileText className="h-4 w-4 shrink-0 text-brand-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-medium text-brand-ink">
                  {document.archivoNombre ?? 'Archivo actual'}
                </span>
                <span>{formatBytes(document.sizeBytes)}</span>
                {previewUrl && (
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-brand-primaryInk hover:underline"
                  >
                    Ver
                  </a>
                )}
              </div>
            )}

            {file ? (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-brand-mint/30 bg-brand-mintPale px-3 py-2 text-sm text-brand-mintInk">
                <Paperclip className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
                <span className="shrink-0 text-xs">{formatBytes(file.size)}</span>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-white/60"
                  onClick={clearFile}
                  aria-label="Quitar archivo seleccionado"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <label className="fleet-document-file-picker mt-3 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-brand-line bg-brand-pale/30 px-4 py-5 text-center transition-colors hover:border-brand-primary/50 hover:bg-brand-pale/60">
                <Paperclip className="h-5 w-5 text-brand-muted" aria-hidden="true" />
                <span className="mt-1 text-sm font-semibold text-brand-ink">
                  Seleccionar PDF, JPG, PNG o WebP
                </span>
                <span className="mt-0.5 text-xs text-brand-muted">Máximo 10 MB</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="sr-only"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  aria-invalid={Boolean(fieldErrors.file)}
                  aria-describedby={fieldErrors.file ? 'fleet-document-file-error' : undefined}
                  onChange={(event) => {
                    const selectedFile = event.target.files?.[0];
                    if (!selectedFile) return;
                    setFile(selectedFile);
                    const error = getFileError(selectedFile);
                    setFieldErrors((current) => {
                      const next = { ...current };
                      if (error) next.file = error;
                      else delete next.file;
                      return next;
                    });
                  }}
                />
              </label>
            )}

            {fieldErrors.file && (
              <p id="fleet-document-file-error" className="mt-2 text-xs text-brand-coralInk" role="alert">
                {fieldErrors.file}
              </p>
            )}

            {isEditing && (
              <p className="mt-2 text-xs text-brand-muted">
                Si adjuntas un archivo nuevo, la versión actual se conserva en el historial.
              </p>
            )}
          </fieldset>

          {isEditing && document && (
            <p className="text-xs text-brand-muted">
              Última actualización: {formatDate(document.updatedAt)}
              {document.version > 0 ? ` · Versión ${document.version}` : ''}
            </p>
          )}

          {mutationError && (
            <div
              className="flex items-start gap-2 rounded-lg border border-brand-coral/30 bg-brand-coralPale px-3 py-2.5 text-sm text-brand-coralInk"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{getApiErrorMessage(mutationError)}</span>
            </div>
          )}

          </fieldset>
          </div>
          <footer className="workspace-form-footer reference-dialog-footer dialog-buttons border-t border-brand-line pt-5">
            {confirmLeave && (
              <div role="alertdialog" aria-label="Descartar edición" className="reception-discard">
                <p>Hay cambios sin guardar.</p>
                <button type="button" ref={continueEditingRef} disabled={activeMutation.isPending}
                  onClick={() => setConfirmLeave(false)}>Seguir editando</button>
                <button type="button" disabled={activeMutation.isPending}
                  onClick={() => {
                    if (!submittingRef.current && !activeMutation.isPending) onClose();
                  }}>Descartar cambios</button>
              </div>
            )}
            <button
              type="button"
              className="secondary-button"
              onClick={close}
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
                  ? 'Guardar documento'
                  : 'Agregar documento'}
            </button>
          </footer>
        </form>
      </motion.section>
    </div>,
    window.document.body,
  );
};

export default FleetDocumentFormModal;
