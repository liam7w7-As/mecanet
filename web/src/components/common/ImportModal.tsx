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
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import ModalHeader from './ModalHeader';
import {
  downloadImportTemplate,
  useConfirmImportMutation,
  useImportWarehouses,
  usePreviewImportMutation,
} from '../../hooks/useImports';
import { useModalOverlay } from '../../hooks/useModalOverlay';
import { getApiErrorMessage, isApiConflict } from '../../lib/api-error';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';
import { notifySuccess } from '../../stores/toast.store';

import type { ImportTarget } from '../../hooks/useImports';
import type { ImportCellValue, ImportPreview, ImportResult, ImportRowStatus } from '@unithor/shared';

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
      'Sube un Excel con repuestos y servicios. Revisa los registros nuevos y los cambios en los existentes antes de confirmar.',
    success: 'Catálogo importado',
  },
  vehicles: {
    title: 'Importar vehículos de taller',
    description:
      'Sube un Excel con vehículos de clientes. Revisa las altas y actualizaciones; los propietarios nuevos se crean automáticamente.',
    success: 'Vehículos de taller importados',
  },
  'fleet-vehicles': {
    title: 'Importar vehículos de flota',
    description:
      'Sube un Excel con vehículos de uso interno. Revisa los registros nuevos, las actualizaciones y los conflictos antes de confirmar.',
    success: 'Vehículos de flota importados',
  },
};

const STATUS_META: Record<
  ImportRowStatus,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  valid: {
    label: 'Nuevo',
    icon: CheckCircle2,
    className: 'bg-brand-mintPale text-brand-mintInk',
  },
  update: {
    label: 'Actualizar',
    icon: RotateCcw,
    className: 'bg-brand-pale text-brand-primaryInk',
  },
  created: {
    label: 'Creado',
    icon: Check,
    className: 'bg-brand-pale text-brand-primaryInk',
  },
  updated: {
    label: 'Actualizado',
    icon: Check,
    className: 'bg-brand-pale text-brand-primaryInk',
  },
  unchanged: {
    label: 'Sin cambios',
    icon: CheckCircle2,
    className: 'import-status--unchanged',
  },
  conflict: {
    label: 'Conflicto',
    icon: AlertTriangle,
    className: 'bg-brand-goldPale text-brand-goldInk',
  },
  duplicate: {
    label: 'Duplicado',
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
  const user = useAuthStore((state) => state.user);
  const canImport = Boolean(user && (target === 'fleet-vehicles'
    ? hasUserPermission(user, 'flota', 'import')
    : hasUserPermission(user, 'taller', 'import') || hasUserPermission(user, 'admin', 'import')));
  const actorKey = JSON.stringify([user?.id, user?.role, user?.permissions
    ? user.permissions.map((permission) => `${permission.modulo}:${permission.accion}`).sort()
    : 'role-defaults']);
  const canReadWarehouses = target === 'catalog' && Boolean(user && hasUserPermission(user, 'almacen', 'read'));
  const warehousesQuery = useImportWarehouses(canReadWarehouses);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestVersion = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [warehouseId, setWarehouseId] = useState<number | undefined>();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const previewMutation = usePreviewImportMutation(target);
  const confirmMutation = useConfirmImportMutation(target);
  // A preview belongs to the current actor and target, including in-flight responses.
  useEffect(() => {
    requestVersion.current += 1;
    setPreview(null);
    setResult(null);
    setError(null);
    setWarehouseId(undefined);
    return () => { requestVersion.current += 1; };
  }, [target, actorKey]);

  const busy = previewMutation.isPending || confirmMutation.isPending || downloading;
  const canConfirm = canImport && Boolean(file && preview && preview.validRows > 0 && preview.previewToken && !preview.truncated) && !busy && !result;
  const requestClose = (): void => {
    if (busy) return;
    if (file && !result) setConfirmClose(true);
    else onClose();
  };
  useEffect(() => {
    if (!file || result) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [file, result]);
  const setOverlayNode = useModalOverlay({
    isOpen: true,
    onClose: requestClose,
    isPending: busy,
  });

  const reviewFile = (nextFile: File): void => {
    if (!canImport || busy) return;
    const version = ++requestVersion.current;
    setError(null);
    setPreview(null);
    setResult(null);
    previewMutation.reset();
    confirmMutation.reset();
    previewMutation.mutate({ file: nextFile, warehouseId }, {
      onSuccess: (value) => {
        if (version === requestVersion.current) setPreview(value);
      },
      onError: (mutationError) => {
        if (version !== requestVersion.current) return;
        setError(getApiErrorMessage(mutationError, 'No fue posible leer la vista previa del archivo.'));
      },
    });
  };

  const acceptFile = (nextFile: File | undefined): void => {
    if (!nextFile || busy || !canImport) return;

    requestVersion.current += 1;
    setError(null);
    setPreview(null);
    setResult(null);

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
    reviewFile(nextFile);
  };

  const changeWarehouse = (value: string): void => {
    if (busy) return;
    requestVersion.current += 1;
    setWarehouseId(value ? Number(value) : undefined);
    setPreview(null);
    setError(null);
    previewMutation.reset();
    confirmMutation.reset();
  };

  const reset = (): void => {
    requestVersion.current += 1;
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    previewMutation.reset();
    confirmMutation.reset();
    if (inputRef.current) inputRef.current.value = '';
  };

  const confirm = (): void => {
    if (!canConfirm || !file || !preview?.previewToken) return;
    const version = requestVersion.current;
    setError(null);
    confirmMutation.mutate({ file, warehouseId, previewToken: preview.previewToken }, {
      onSuccess: (value) => {
        if (version !== requestVersion.current) return;
        setPreview(null);
        setResult(value);
        notifySuccess(
          `${copy.success}: ${value.created} ${value.created === 1 ? 'registro creado' : 'registros creados'} y ${value.updated ?? 0} ${(value.updated ?? 0) === 1 ? 'actualizado' : 'actualizados'}.`,
        );
      },
      onError: (mutationError) => {
        if (version !== requestVersion.current) return;
        if (isApiConflict(mutationError)) {
          requestVersion.current += 1;
          setPreview(null);
          setError('La vista previa ya no está vigente: el archivo, los permisos o los registros cambiaron. Genera una nueva vista previa antes de confirmar. Conservamos tu archivo.');
          return;
        }
        setError(getApiErrorMessage(mutationError, 'No fue posible importar el archivo.'));
      },
    });
  };

  const downloadTemplate = async (): Promise<void> => {
    if (!canImport || busy) return;
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
        {!canImport && <p className="import-alert import-alert--error" role="status">Tu permiso actual no permite importar en este módulo. El archivo seleccionado se conserva.</p>}

        <div className="reception-edit-body import-dialog-body">
          <div className="import-dialog-toolbar">
            <button
              type="button"
              className="reception-secondary-button"
              onClick={() => void downloadTemplate()}
              disabled={busy || !canImport}
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
              {target === 'catalog' && (
                <div className="import-warehouse">
                  {canReadWarehouses && (
                    <>
                      <label htmlFor="import-warehouse">Almacén para el stock (opcional)</label>
                      <select
                        id="import-warehouse"
                        value={warehouseId ?? ''}
                        onChange={(event) => changeWarehouse(event.target.value)}
                        disabled={busy || !canImport || warehousesQuery.isLoading}
                        aria-describedby="import-warehouse-help"
                      >
                        <option value="">Sin almacén seleccionado</option>
                        {warehousesQuery.data?.map((warehouse) => (
                          <option key={warehouse.id} value={warehouse.id}>
                            {warehouse.codigo} · {warehouse.nombre}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  <p id="import-warehouse-help">
                    El stock es el saldo final del almacén; no se suma. Un 0 explícito deja el saldo
                    en 0 y una celda vacía lo conserva. Selecciona un almacén y asegúrate de tener
                    permisos de inventario; sin almacén, un stock mayor a 0 genera conflicto.
                    {canReadWarehouses && ' Cambiar el almacén requiere generar otra vista previa.'}
                  </p>
                  {canReadWarehouses && warehousesQuery.isError && (
                    <p className="import-warehouse-error" role="alert">
                      No fue posible cargar los almacenes. Puedes revisar el archivo sin seleccionar uno.
                    </p>
                  )}
                </div>
              )}
              <label
                className={`import-dropzone${file ? ' import-dropzone--selected' : ''}${dragging ? ' import-dropzone--active' : ''}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!busy && canImport) setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  if (busy || !canImport) return;
                  acceptFile(event.dataTransfer.files[0]);
                }}
              >
                <input
                  ref={inputRef}
                  type="file"
                  aria-label="Archivo Excel"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  onChange={(event) => {
                    acceptFile(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                  disabled={busy || !canImport}
                />
                <Upload className="import-dropzone-icon" aria-hidden="true" />
                <div className="import-dropzone-copy">
                  <strong>
                    {file ? file.name : 'Arrastra tu Excel aquí o haz clic para seleccionarlo'}
                  </strong>
                  <span>
                    {file
                      ? `${formatFileSize(file.size)} · ${previewMutation.isPending ? 'Leyendo archivo…' : 'Archivo .xlsx'}`
                      : 'Solo archivos .xlsx'}
                  </span>
                </div>
              </label>

              {file && (
                <div className="import-review-actions">
                  <p>
                    {activePreview
                      ? 'Revisa los cambios de cada fila antes de importar.'
                      : 'Genera la vista previa del archivo seleccionado para continuar.'}
                  </p>
                  <button
                    type="button"
                    className="reception-secondary-button"
                    onClick={() => { if (!busy) reviewFile(file); }}
                    disabled={busy || !canImport}
                  >
                    <RotateCcw aria-hidden="true" />
                    {activePreview ? 'Volver a previsualizar' : 'Generar vista previa'}
                  </button>
                </div>
              )}

              {previewMutation.isPending && (
                <div className="import-inline-status" role="status">
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                  Comparando registros y preparando los cambios…
                </div>
              )}

              {error && (
                <div className="import-alert import-alert--error" role="alert">
                  <AlertCircle aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              {activePreview && (
                <>
                  {!activePreview.previewToken && (
                    <div className="import-alert import-alert--warning" role="alert">
                      <AlertTriangle aria-hidden="true" />
                      <span>Genera una nueva vista previa para habilitar la importación.</span>
                    </div>
                  )}
                  <ImportPreviewPanel preview={activePreview} />
                </>
              )}
            </>
          )}
        </div>

        <footer className="reception-edit-footer import-dialog-footer">
          {confirmClose && <div role="alertdialog" aria-label="Descartar importación" className="reception-discard">
            <p>El archivo está seleccionado y aún no has confirmado la importación.</p>
            <button type="button" disabled={busy} onClick={() => setConfirmClose(false)}>Seguir revisando</button>
            <button type="button" disabled={busy} onClick={onClose}>Descartar archivo</button>
          </div>}
          <span role="status">
            {confirmMutation.isPending
              ? 'Importando registros…'
              : result
                ? 'Importación finalizada'
                : activePreview
                  ? `${activePreview.validRows} listos para importar`
                  : file
                    ? 'Vista previa pendiente'
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
  const updates = preview.updateRows ?? preview.rows.filter((row) => row.status === 'update').length;

  return (
    <div className="import-preview">
      <div className="import-summary">
        <div className="import-summary--valid">
          <span>Nuevos</span>
          <strong>{preview.newRows ?? Math.max(0, preview.validRows - updates)}</strong>
        </div>
        <div className="import-summary--update">
          <span>Actualizar</span>
          <strong>{updates}</strong>
        </div>
        <div>
          <span>Sin cambios</span>
          <strong>{preview.unchangedRows ?? preview.rows.filter((row) => row.status === 'unchanged').length}</strong>
        </div>
        <div className="import-summary--duplicate">
          <span>Conflictos</span>
          <strong>{preview.conflictRows ?? preview.rows.filter((row) => row.status === 'conflict').length}</strong>
        </div>
        <div className="import-summary--error">
          <span>Errores</span>
          <strong>{preview.errorRows}</strong>
        </div>
      </div>

      {preview.duplicateRows > 0 && (
        <p className="import-duplicates">
          {preview.duplicateRows} {preview.duplicateRows === 1 ? 'fila duplicada omitida' : 'filas duplicadas omitidas'}.
        </p>
      )}

      {preview.truncated && (
        <div className="import-alert import-alert--warning" role="status">
          <AlertTriangle aria-hidden="true" />
          <span>
            El archivo supera el máximo de {preview.maxRows} filas. Divide la planilla y
            genera otra vista previa para continuar.
          </span>
        </div>
      )}

      <div className="import-preview-heading">
        <h3>Vista previa</h3>
        <p>Hoja «{preview.sheetName}» · {preview.totalRows} filas</p>
      </div>

      <ImportRowsTable preview={preview} />
    </div>
  );
};

const formatCell = (value: ImportCellValue): string => value === null || value === '' ? 'Sin valor' : String(value);

const ImportRowsTable = ({ preview }: { preview: ImportPreview }) => (
  <>
    {preview.totalRows > preview.rows.length && (
      <div className="import-alert import-alert--warning" role="status">
        <AlertTriangle aria-hidden="true" />
        <span>
          Se muestran las primeras {preview.rows.length} de {preview.totalRows} filas (máximo 200).
          Los conteos y la importación incluyen todas las filas del archivo.
        </span>
      </div>
    )}
    <div className="import-preview-table-wrap" role="region" aria-label="Detalle de filas" tabIndex={0}>
        <table className="import-preview-table" aria-label="Registros de la importación">
          <thead>
            <tr>
              <th scope="col">Fila</th>
              <th scope="col">Registro</th>
              <th scope="col">Estado</th>
              <th scope="col">Cambios y detalle</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => {
              const meta = STATUS_META[row.status];
              const Icon = meta.icon;
              return (
                <tr key={`${row.row}-${row.label}`}>
                  <td className="import-preview-row-number">{row.row}</td>
                  <td className="import-preview-label">
                    {row.label}
                    {row.existingId !== undefined && (
                      <span className="import-existing-id">ID existente: {row.existingId}</span>
                    )}
                  </td>
                  <td>
                    <span className={`import-status ${meta.className}`}>
                      <Icon aria-hidden="true" />
                      {meta.label}
                    </span>
                  </td>
                  <td className="import-preview-message">
                    {Boolean(row.changes?.length) && (
                      <ul className="import-changes" aria-label={`Cambios de la fila ${row.row}`}>
                        {row.changes?.map((change) => (
                          <li key={change.field}>
                            <strong>{change.label}</strong>
                            <span className="import-change-values">
                              <span className="import-change-before">{formatCell(change.before)}</span>
                              <span aria-label="cambia a">→</span>
                              <span className="import-change-after">{formatCell(change.after)}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {row.messages.map((message, index) => <p key={index}>{message}</p>)}
                    {!row.changes?.length && row.messages.length === 0 && '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
    </div>
  </>
);

const ImportResultPanel = ({ result }: { result: ImportResult }) => (
  <div className="import-result">
    <div className="import-result-heading">
      <CheckCircle2 aria-hidden="true" />
      <div>
        <h3>Importación completada</h3>
        <p>{result.created} creados y {result.updated ?? 0} actualizados. Revisa el detalle de las filas.</p>
      </div>
    </div>

    <div className="import-summary">
      <div className="import-summary--valid">
        <span>Creados</span>
        <strong>{result.created}</strong>
      </div>
      <div className="import-summary--update">
        <span>Actualizados</span>
        <strong>{result.updated ?? 0}</strong>
      </div>
      <div>
        <span>Sin cambios</span>
        <strong>{result.unchanged ?? result.unchangedRows ?? 0}</strong>
      </div>
      <div className="import-summary--duplicate">
        <span>Conflictos</span>
        <strong>{result.conflicts ?? result.conflictRows ?? 0}</strong>
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

    <div className="import-preview-heading">
      <h3>Detalle de la importación</h3>
      <p>{result.totalRows} filas revisadas</p>
    </div>
    <ImportRowsTable preview={result} />

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
