import { IMPORT_MAX_FILE_SIZE_MB, IMPORT_MAX_ROWS } from '@unithor/shared';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  RotateCcw,
  Upload,
  XCircle,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import ModalHeader from './ModalHeader';
import {
  downloadImportTemplate,
  useConfirmImportMutation,
  usePreviewImportMutation,
} from '../../hooks/useImports';
import { useModalOverlay } from '../../hooks/useModalOverlay';
import { getApiErrorMessage } from '../../lib/api-error';
import { notifySuccess } from '../../stores/toast.store';

import type { ImportTarget } from '../../hooks/useImports';
import type { ImportPreview, ImportResult, ImportRowStatus } from '@unithor/shared';

interface ImportModalProps {
  target: ImportTarget;
  onClose: () => void;
}

const COPY: Record<
  ImportTarget,
  { title: string; description: string; success: string }
> = {
  catalog: {
    title: 'Importar catálogo',
    description:
      'Sube un Excel con repuestos y servicios. Los códigos y nombres existentes se omiten: nunca se sobrescriben precios ni stock.',
    success: 'Catálogo importado',
  },
  vehicles: {
    title: 'Importar vehículos de taller',
    description:
      'Sube un Excel con vehículos de clientes. Las patentes existentes se omiten y los propietarios nuevos se crean automáticamente.',
    success: 'Vehículos de taller importados',
  },
  'fleet-vehicles': {
    title: 'Importar vehículos de flota',
    description:
      'Sube un Excel con vehículos de uso interno. Las patentes y códigos internos existentes se omiten sin modificarse.',
    success: 'Vehículos de flota importados',
  },
};

const STATUS_META: Record<
  ImportRowStatus,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  valid: {
    label: 'Listo',
    icon: CheckCircle2,
    className: 'bg-brand-mintPale text-brand-mintInk',
  },
  created: {
    label: 'Creado',
    icon: Check,
    className: 'bg-brand-pale text-brand-primaryInk',
  },
  duplicate: {
    label: 'Omitido',
    icon: AlertTriangle,
    className: 'bg-brand-goldPale text-brand-goldInk',
  },
  error: {
    label: 'Error',
    icon: XCircle,
    className: 'bg-brand-coralPale text-brand-coralInk',
  },
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function ImportModal({ target, onClose }: ImportModalProps) {
  const copy = COPY[target];
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const previewMutation = usePreviewImportMutation(target);
  const confirmMutation = useConfirmImportMutation(target);
  const busy = previewMutation.isPending || confirmMutation.isPending || downloading;
  const requestClose = (): void => {
    if (busy) return;
    onClose();
  };
  const setOverlayNode = useModalOverlay({
    isOpen: true,
    onClose: requestClose,
    isPending: busy,
  });

  const acceptFile = (nextFile: File | undefined): void => {
    if (!nextFile) return;

    setError(null);
    setPreview(null);
    setResult(null);
    previewMutation.reset();
    confirmMutation.reset();

    if (!/\.xlsx$/i.test(nextFile.name)) {
      setFile(null);
      setError('El archivo debe ser un Excel .xlsx. Descarga la plantilla para comenzar.');
      return;
    }

    if (nextFile.size > IMPORT_MAX_FILE_SIZE_MB * 1024 * 1024) {
      setFile(null);
      setError(`El archivo supera el límite de ${IMPORT_MAX_FILE_SIZE_MB} MB.`);
      return;
    }

    setFile(nextFile);
    previewMutation.mutate(nextFile, {
      onSuccess: (value) => setPreview(value),
      onError: (mutationError) =>
        setError(
          getApiErrorMessage(mutationError, 'No fue posible leer la vista previa del archivo.'),
        ),
    });
  };

  const reset = (): void => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    previewMutation.reset();
    confirmMutation.reset();
    if (inputRef.current) inputRef.current.value = '';
  };

  const confirm = (): void => {
    if (!file) return;
    setError(null);
    confirmMutation.mutate(file, {
      onSuccess: (value) => {
        setResult(value);
        notifySuccess(
          `${copy.success}: ${value.created} ${value.created === 1 ? 'registro creado' : 'registros creados'}.`,
        );
      },
      onError: (mutationError) =>
        setError(getApiErrorMessage(mutationError, 'No fue posible importar el archivo.')),
    });
  };

  const downloadTemplate = async (): Promise<void> => {
    setError(null);
    setDownloading(true);
    try {
      await downloadImportTemplate(target);
    } catch (downloadError) {
      setError(
        getApiErrorMessage(downloadError, 'No fue posible descargar la plantilla.'),
      );
    } finally {
      setDownloading(false);
    }
  };

  const activePreview = preview;
  const canConfirm = Boolean(activePreview && activePreview.validRows > 0) && !confirmMutation.isPending;

  return createPortal(
    <div className="reception-edit-overlay reference-modal-overlay">
      <button
        type="button"
        className="reception-edit-backdrop"
        onClick={requestClose}
        disabled={busy}
        aria-label={`Cerrar ${copy.title.toLowerCase()}`}
        tabIndex={-1}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-modal-title"
        aria-busy={busy}
        tabIndex={-1}
        ref={setOverlayNode}
        className="reception-edit-dialog reference-dialog import-dialog"
      >
        <ModalHeader
          id="import-modal-title"
          title={copy.title}
          description={copy.description}
          eyebrow="Importación desde Excel"
          badge={<FileSpreadsheet aria-hidden="true" />}
          variant="plain"
          tone="primary"
          onClose={requestClose}
          closeDisabled={busy}
        />

        <div className="reception-edit-body import-dialog-body">
          <div className="import-dialog-toolbar">
            <button
              type="button"
              className="reception-secondary-button"
              onClick={() => void downloadTemplate()}
              disabled={busy}
            >
              {downloading ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <Download aria-hidden="true" />
              )}
              {downloading ? 'Generando plantilla…' : 'Descargar plantilla'}
            </button>
            <p>
              Usa la plantilla para conservar los encabezados. Máximo{' '}
              {IMPORT_MAX_FILE_SIZE_MB} MB y {IMPORT_MAX_ROWS} filas por archivo.
            </p>
          </div>

          {result ? (
            <ImportResultPanel result={result} />
          ) : (
            <>
              <label
                className={`import-dropzone${dragging ? ' import-dropzone--active' : ''}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!busy) setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  if (busy) return;
                  acceptFile(event.dataTransfer.files[0]);
                }}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  onChange={(event) => {
                    acceptFile(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                  disabled={busy}
                />
                <Upload className="import-dropzone-icon" aria-hidden="true" />
                <strong>
                  {file ? file.name : 'Arrastra tu Excel aquí o haz clic para seleccionarlo'}
                </strong>
                <span>
                  {file
                    ? `${formatFileSize(file.size)} · ${previewMutation.isPending ? 'Leyendo archivo…' : 'Archivo .xlsx'}`
                    : 'Solo archivos .xlsx'}
                </span>
              </label>

              {previewMutation.isPending && (
                <div className="import-inline-status" role="status">
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                  Validando filas y buscando duplicados…
                </div>
              )}

              {error && (
                <div className="import-alert import-alert--error" role="alert">
                  <AlertCircle aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              {activePreview && (
                <ImportPreviewPanel preview={activePreview} />
              )}
            </>
          )}
        </div>

        <footer className="reception-edit-footer import-dialog-footer">
          <span role="status">
            {confirmMutation.isPending
              ? 'Importando registros…'
              : result
                ? 'Importación finalizada'
                : activePreview
                  ? `${activePreview.validRows} listos para importar`
                  : 'Sin archivo seleccionado'}
          </span>
          <div>
            {result ? (
              <>
                <button
                  type="button"
                  className="reception-secondary-button"
                  onClick={reset}
                >
                  <RotateCcw aria-hidden="true" />
                  Importar otro archivo
                </button>
                <button
                  type="button"
                  className="reception-primary-button"
                  onClick={requestClose}
                >
                  Cerrar
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="reception-secondary-button"
                  onClick={requestClose}
                  disabled={busy}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="reception-primary-button"
                  onClick={confirm}
                  disabled={!canConfirm || busy}
                >
                  {confirmMutation.isPending ? (
                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Upload aria-hidden="true" />
                  )}
                  {confirmMutation.isPending
                    ? 'Importando…'
                    : activePreview
                      ? `Importar ${activePreview.validRows} ${activePreview.validRows === 1 ? 'registro' : 'registros'}`
                      : 'Importar'}
                </button>
              </>
            )}
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

const ImportPreviewPanel = ({ preview }: { preview: ImportPreview }) => {
  const shownRows = preview.rows.length;

  return (
    <div className="import-preview">
      <div className="import-summary">
        <div>
          <span>Filas</span>
          <strong>{preview.totalRows}</strong>
        </div>
        <div className="import-summary--valid">
          <span>Listas</span>
          <strong>{preview.validRows}</strong>
        </div>
        <div className="import-summary--duplicate">
          <span>Omitidas</span>
          <strong>{preview.duplicateRows}</strong>
        </div>
        <div className="import-summary--error">
          <span>Con errores</span>
          <strong>{preview.errorRows}</strong>
        </div>
      </div>

      {preview.truncated && (
        <div className="import-alert import-alert--warning" role="status">
          <AlertTriangle aria-hidden="true" />
          <span>
            El archivo supera el máximo de {preview.maxRows} filas: solo se importarán las
            primeras.
          </span>
        </div>
      )}

      <div className="import-preview-heading">
        <h3>Vista previa</h3>
        <p>
          Hoja «{preview.sheetName}». {shownRows < preview.totalRows
            ? `Mostrando las primeras ${shownRows} de ${preview.totalRows} filas.`
            : 'Revisa los registros antes de confirmar.'}
        </p>
      </div>

      <div className="import-preview-table-wrap">
        <table className="import-preview-table">
          <thead>
            <tr>
              <th scope="col">Fila</th>
              <th scope="col">Registro</th>
              <th scope="col">Estado</th>
              <th scope="col">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => {
              const meta = STATUS_META[row.status];
              const Icon = meta.icon;
              return (
                <tr key={`${row.row}-${row.label}`}>
                  <td className="import-preview-row-number">{row.row}</td>
                  <td className="import-preview-label">{row.label}</td>
                  <td>
                    <span className={`import-status ${meta.className}`}>
                      <Icon aria-hidden="true" />
                      {meta.label}
                    </span>
                  </td>
                  <td className="import-preview-message">
                    {row.messages.length > 0 ? row.messages.join(' ') : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ImportResultPanel = ({ result }: { result: ImportResult }) => (
  <div className="import-result">
    <div className="import-result-heading">
      <CheckCircle2 aria-hidden="true" />
      <div>
        <h3>Importación completada</h3>
        <p>Los registros omitidos no fueron modificados.</p>
      </div>
    </div>

    <div className="import-summary">
      <div className="import-summary--valid">
        <span>Creados</span>
        <strong>{result.created}</strong>
      </div>
      <div className="import-summary--duplicate">
        <span>Omitidos</span>
        <strong>{result.skipped}</strong>
      </div>
      <div className="import-summary--error">
        <span>Fallidos</span>
        <strong>{result.failed}</strong>
      </div>
      {result.module === 'vehicles' && (
        <div>
          <span>Clientes creados</span>
          <strong>{result.clientsCreated}</strong>
        </div>
      )}
    </div>

    {result.failed > 0 && (
      <div className="import-alert import-alert--error" role="alert">
        <AlertTriangle aria-hidden="true" />
        <div>
          <strong>Filas con errores</strong>
          <ul>
            {result.rows
              .filter((row) => row.status === 'error')
              .slice(0, 20)
              .map((row) => (
                <li key={`${row.row}-${row.label}`}>
                  Fila {row.row}: {row.label}
                  {row.messages.length > 0 ? ` — ${row.messages.join(' ')}` : ''}
                </li>
              ))}
          </ul>
        </div>
      </div>
    )}
  </div>
);
