import {
  createFleetDocumentSchema,
} from '@unithor/shared';
import { AlertCircle, FileText, LoaderCircle, Paperclip, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useRef, useState } from 'react';

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
  'Seguro obligatorio',
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

/**
 * Documento de flota: metadata libre y archivo opcional. Al reemplazar el
 * archivo se crea una versión y la anterior queda en el historial.
 */
export const FleetDocumentFormModal = ({
  vehicleId,
  document,
  onClose,
}: FleetDocumentFormModalProps) => {
  const [form, setForm] = useState<FleetDocumentFormState>(() => getInitialState(document));
  const [file, setFile] = useState<File | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEditing = Boolean(document);
  const createMutation = useCreateFleetDocumentMutation(vehicleId);
  const updateMutation = useUpdateFleetDocumentMutation(vehicleId, document?.id ?? 0);
  const activeMutation = isEditing ? updateMutation : createMutation;

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
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setFieldErrors({});
    createMutation.reset();
    updateMutation.reset();

    const result = createFleetDocumentSchema.safeParse(form);
    if (!result.success) {
      setFieldErrors(getFieldErrors(result.error.issues));
      return;
    }

    const onSuccess = (): void => onClose();

    if (document) {
      updateMutation.mutate({ data: result.data, file }, { onSuccess });
      return;
    }

    createMutation.mutate({ data: result.data, file }, { onSuccess });
  };

  const mutationError = activeMutation.error;
  const previewUrl =
    document?.tieneArchivo && !file
      ? fleetDocumentFileUrl(vehicleId, document.id)
      : null;

  const setPanelNode = useModalOverlay({
    isOpen: true,
    onClose,
    isPending: activeMutation.isPending,
  });

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto px-4 py-4 sm:items-center sm:py-6">
      <button
        type="button"
        className="fixed inset-0 bg-[#18273c55] backdrop-blur-sm transition-opacity"
        aria-label="Cerrar formulario de documento"
        onClick={onClose}
      />
      <motion.section
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="relative max-h-full w-full max-w-[680px] overflow-y-auto rounded-2xl border border-brand-line bg-white shadow-2xl"
        role="dialog"
        ref={setPanelNode}
        aria-modal="true"
        aria-labelledby="fleet-document-form-title"
      >
        <ModalHeader
          id="fleet-document-form-title"
          title={isEditing ? 'Editar documento' : 'Agregar documento'}
          description="Nombre libre, referencia y fechas. El archivo es opcional."
          onClose={onClose}
        />

        <form className="space-y-5 p-5 pt-0 sm:p-6 sm:pt-0" noValidate onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-brand-ink sm:col-span-2">
              Nombre del documento
              <input
                className={inputClassName}
                list="fleet-document-suggestions"
                value={form.nombre}
                onChange={(event) => setValue('nombre', event.target.value)}
                aria-invalid={Boolean(fieldErrors.nombre)}
                placeholder="Ej: Permiso de circulación"
                autoFocus
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

            <label className="text-sm font-medium text-brand-ink">
              Fecha de vencimiento
              <input
                className={inputClassName}
                type="date"
                value={form.fechaVencimiento}
                onChange={(event) => setValue('fechaVencimiento', event.target.value)}
                aria-invalid={Boolean(fieldErrors.fechaVencimiento)}
              />
              {fieldErrors.fechaVencimiento && (
                <span className="mt-1 block text-xs text-brand-coralInk">
                  {fieldErrors.fechaVencimiento}
                </span>
              )}
              <span className="mt-1 block text-xs text-brand-muted">
                Opcional. Si la dejas vacía, el documento no generará alertas.
              </span>
            </label>

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

          <fieldset className="border-t border-brand-line pt-5">
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
              <label className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-brand-line bg-brand-pale/30 px-4 py-5 text-center transition-colors hover:border-brand-primary/50 hover:bg-brand-pale/60">
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
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </label>
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
                  ? 'Guardar documento'
                  : 'Agregar documento'}
            </button>
          </footer>
        </form>
      </motion.section>
    </div>
  );
};

export default FleetDocumentFormModal;
