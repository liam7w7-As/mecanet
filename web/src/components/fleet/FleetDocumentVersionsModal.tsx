import { AlertCircle, Download, Eye, FileClock, FileText, LoaderCircle } from 'lucide-react';
import { motion } from 'motion/react';

import {
  fleetDocumentFileUrl,
  useFleetDocumentVersions,
} from '../../hooks/useFleetVehicles';
import { useModalOverlay } from '../../hooks/useModalOverlay';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatDate } from '../../lib/formatters';
import ModalHeader from '../common/ModalHeader';

import type { FleetDocument } from '../../types/entities';

interface FleetDocumentVersionsModalProps {
  vehicleId: number;
  document: FleetDocument;
  onClose: () => void;
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const FleetDocumentVersionsModal = ({
  vehicleId,
  document,
  onClose,
}: FleetDocumentVersionsModalProps) => {
  const versionsQuery = useFleetDocumentVersions(vehicleId, document.id);
  const setPanelNode = useModalOverlay({ isOpen: true, onClose });

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto px-4 py-4 sm:items-center sm:py-6">
      <button
        type="button"
        className="fixed inset-0 bg-[#18273c55] backdrop-blur-sm transition-opacity"
        aria-label="Cerrar historial de versiones"
        onClick={onClose}
      />
      <motion.section
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="relative max-h-full w-full max-w-[640px] overflow-y-auto rounded-2xl border border-brand-line bg-white shadow-2xl"
        role="dialog"
        ref={setPanelNode}
        aria-modal="true"
        aria-labelledby="fleet-document-versions-title"
      >
        <ModalHeader
          id="fleet-document-versions-title"
          title="Historial de versiones"
          description={document.nombre}
          onClose={onClose}
        />

        <div className="space-y-4 px-5 pb-6 pt-0 sm:px-6">
          {versionsQuery.isPending && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-brand-muted" role="status">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              Cargando versiones...
            </div>
          )}

          {versionsQuery.isError && (
            <div
              className="flex items-start gap-2 rounded-lg border border-brand-coral/30 bg-brand-coralPale px-3 py-2.5 text-sm text-brand-coralInk"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {getApiErrorMessage(
                versionsQuery.error,
                'No fue posible cargar el historial de versiones.',
              )}
            </div>
          )}

          {versionsQuery.data && (
            <>
              <div className="rounded-xl border border-brand-primary/20 bg-brand-pale/50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold text-brand-primaryInk">
                      <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
                      Versión actual
                      {versionsQuery.data.current.version > 0 && (
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-brand-primaryInk">
                          v{versionsQuery.data.current.version}
                        </span>
                      )}
                    </p>
                    <p className="mt-2 break-words text-sm font-medium text-brand-ink">
                      {versionsQuery.data.current.archivoNombre ?? 'Sin archivo adjunto'}
                    </p>
                    <p className="mt-1 text-xs text-brand-muted">
                      {versionsQuery.data.current.fechaEmision
                        ? `Emitido: ${formatDate(versionsQuery.data.current.fechaEmision)} · `
                        : ''}
                      {versionsQuery.data.current.fechaVencimiento
                        ? `Vence: ${formatDate(versionsQuery.data.current.fechaVencimiento)}`
                        : 'Sin vencimiento'}
                      {versionsQuery.data.current.sizeBytes !== null
                        ? ` · ${formatBytes(versionsQuery.data.current.sizeBytes)}`
                        : ''}
                    </p>
                  </div>
                  {versionsQuery.data.current.tieneArchivo && (
                    <div className="flex shrink-0 items-center gap-2">
                      <a
                        href={fleetDocumentFileUrl(vehicleId, document.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-brand-line bg-white px-2.5 text-xs font-semibold text-brand-ink hover:bg-brand-pale"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Ver
                      </a>
                      <a
                        href={fleetDocumentFileUrl(vehicleId, document.id, { download: true })}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-brand-line bg-white px-2.5 text-xs font-semibold text-brand-ink hover:bg-brand-pale"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" /> Descargar
                      </a>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-brand-ink">
                  <FileClock className="h-4 w-4 text-brand-muted" aria-hidden="true" />
                  Versiones anteriores
                  <span className="rounded-full bg-brand-pale px-2 py-0.5 text-[11px] font-bold text-brand-muted">
                    {versionsQuery.data.versions.length}
                  </span>
                </h3>

                {versionsQuery.data.versions.length === 0 ? (
                  <p className="mt-3 rounded-lg border border-brand-line bg-brand-pale/30 px-4 py-5 text-sm text-brand-muted">
                    Aún no hay versiones anteriores para este documento.
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-brand-line rounded-xl border border-brand-line">
                    {versionsQuery.data.versions.map((version) => (
                      <li key={version.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <span className="inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg bg-brand-pale px-2 text-xs font-bold text-brand-primaryInk">
                          v{version.version}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-brand-ink">
                            {version.archivoNombre}
                          </span>
                          <span className="block text-xs text-brand-muted">
                            {formatDate(version.createdAt)} · {formatBytes(version.sizeBytes)}
                            {version.fechaVencimiento
                              ? ` · Vencía: ${formatDate(version.fechaVencimiento)}`
                              : ''}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <a
                            href={fleetDocumentFileUrl(vehicleId, document.id, {
                              versionId: version.id,
                            })}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-brand-line px-2 text-xs font-semibold text-brand-ink hover:bg-brand-pale"
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Ver
                          </a>
                          <a
                            href={fleetDocumentFileUrl(vehicleId, document.id, {
                              versionId: version.id,
                              download: true,
                            })}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-brand-line px-2 text-xs font-semibold text-brand-ink hover:bg-brand-pale"
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden="true" /> Descargar
                          </a>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </motion.section>
    </div>
  );
};

export default FleetDocumentVersionsModal;
