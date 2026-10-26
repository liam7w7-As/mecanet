import {
  AlertCircle,
  CalendarDays,
  Car,
  Download,
  Eye,
  FileClock,
  FilePlus2,
  FileText,
  Fuel,
  Gauge,
  Hash,
  MapPin,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  UserRound,
  Wrench,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';

import FleetDocumentFormModal from './FleetDocumentFormModal';
import FleetDocumentVersionsModal from './FleetDocumentVersionsModal';
import FleetExpiryBadge from './FleetExpiryBadge';
import FleetVehicleFormModal from './FleetVehicleFormModal';
import FleetVehicleStatusBadge from './FleetVehicleStatusBadge';
import {
  fleetDocumentFileUrl,
  useDeleteFleetDocumentMutation,
  useFleetVehicle,
} from '../../hooks/useFleetVehicles';
import { useModalOverlay } from '../../hooks/useModalOverlay';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatDate } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';

import type { FleetDocument } from '../../types/entities';
import type { LucideIcon } from 'lucide-react';

const formatKilometres = (value: number | null): string =>
  value === null ? 'Sin registrar' : `${new Intl.NumberFormat('es-CL').format(value)} km`;

const fuelLabels: Record<string, string> = {
  bencina: 'Bencina',
  diesel: 'Diésel',
  hibrido: 'Híbrido',
  electrico: 'Eléctrico',
  gas: 'Gas',
};

const transmissionLabels: Record<string, string> = {
  manual: 'Manual',
  automatica: 'Automática',
  cvt: 'CVT',
};

const formatFleetOption = (value: string | null, labels: Record<string, string>): string =>
  value ? (labels[value] ?? value) : 'Sin registrar';

const formatBytes = (bytes: number | null): string => {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const Fact = ({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) => (
  <div className="min-w-0 border-b border-brand-line py-3">
    <dt className="flex items-center gap-2 text-xs text-brand-muted">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {label}
    </dt>
    <dd className="mt-1.5 break-words text-sm font-medium text-brand-ink">{value}</dd>
  </div>
);

const ProfileSkeleton = () => (
  <div className="space-y-5 p-6" role="status" aria-label="Cargando ficha del vehículo de flota">
    <div className="h-16 w-2/3 animate-pulse rounded bg-brand-pale" />
    <div className="h-16 animate-pulse rounded bg-brand-pale" />
    <div className="h-52 animate-pulse rounded bg-brand-pale" />
  </div>
);

interface DeleteDocumentDialogProps {
  document: FleetDocument;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const DeleteDocumentDialog = ({
  document,
  isPending,
  onClose,
  onConfirm,
}: DeleteDocumentDialogProps) => {
  const setPanelNode = useModalOverlay({ isOpen: true, onClose, isPending });

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto px-4 py-4 sm:items-center sm:py-6">
      <button
        type="button"
        className="fixed inset-0 bg-[#18273c55] backdrop-blur-sm transition-opacity"
        aria-label="Cancelar eliminación del documento"
        onClick={onClose}
      />
      <motion.section
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="relative w-full max-w-md rounded-2xl border border-brand-line bg-white p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        ref={setPanelNode}
        aria-labelledby="delete-fleet-document-title"
      >
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-coralPale text-brand-coralInk">
            <Trash2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 id="delete-fleet-document-title" className="text-lg font-bold text-brand-ink">
            Eliminar documento
          </h2>
        </div>
        <p className="text-sm leading-6 text-brand-muted">
          Se ocultará <strong className="text-brand-ink">{document.nombre}</strong> de la ficha. El
          archivo y sus versiones se conservan internamente para auditoría.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="h-10 rounded-lg border border-brand-line px-4 text-sm font-semibold text-brand-ink hover:bg-brand-pale transition-colors"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="h-10 rounded-lg bg-brand-coralInk px-4 text-sm font-semibold text-white hover:bg-brand-coralInk/90 transition-colors disabled:opacity-60"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      </motion.section>
    </div>
  );
};

interface FleetVehicleDetailProps {
  vehicleId: number;
  onClose: () => void;
}

export const FleetVehicleDetail = ({ vehicleId, onClose }: FleetVehicleDetailProps) => {
  const user = useAuthStore((state) => state.user);
  const vehicleQuery = useFleetVehicle(vehicleId);
  const deleteDocumentMutation = useDeleteFleetDocumentMutation(vehicleId);
  const [isEditingVehicle, setIsEditingVehicle] = useState(false);
  const [documentForm, setDocumentForm] = useState<FleetDocument | null | undefined>(undefined);
  const [versionsDocument, setVersionsDocument] = useState<FleetDocument | null>(null);
  const [deleteDocument, setDeleteDocument] = useState<FleetDocument | null>(null);

  const canCreateFleet = Boolean(user && hasUserPermission(user, 'flota', 'create'));
  const canUpdateFleet = Boolean(user && hasUserPermission(user, 'flota', 'update'));
  const canDeleteFleet = Boolean(user && hasUserPermission(user, 'flota', 'delete'));

  const closeControl = (
    <button
      type="button"
      onClick={onClose}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-brand-muted transition-colors hover:bg-brand-pale hover:text-brand-primaryInk focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-primary"
      aria-label="Cerrar ficha"
      title="Cerrar ficha"
    >
      <X className="h-5 w-5" aria-hidden="true" />
    </button>
  );

  if (vehicleQuery.isPending || vehicleQuery.isError || !vehicleQuery.data) {
    return (
      <div className="min-h-0 overflow-y-auto">
        <header className="flex items-center justify-between border-b border-brand-line bg-brand-page px-5 py-3 text-brand-ink">
          <p className="text-sm font-semibold">Ficha del vehículo de flota</p>
          {closeControl}
        </header>
        {vehicleQuery.isPending ? (
          <ProfileSkeleton />
        ) : (
          <div
            className="m-5 flex items-start gap-3 rounded-lg bg-brand-coralPale p-5 text-sm text-brand-coralInk"
            role="alert"
          >
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
            {getApiErrorMessage(
              vehicleQuery.error,
              'No fue posible cargar la ficha del vehículo de flota.',
            )}
          </div>
        )}
      </div>
    );
  }

  const vehicle = vehicleQuery.data;
  const summary = vehicle.documentSummary;
  const displayName = [vehicle.marca, vehicle.modelo, vehicle.ano].filter(Boolean).join(' · ');

  const confirmDeleteDocument = (): void => {
    if (!deleteDocument) return;
    deleteDocumentMutation.mutate(deleteDocument.id, {
      onSuccess: () => setDeleteDocument(null),
    });
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-white">
      <header className="shrink-0 border-b border-brand-line bg-brand-page text-brand-ink">
        <div className="flex items-center justify-between gap-3 px-5 pt-4 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted">
            Flota interna / Ficha del vehículo
          </p>
          {closeControl}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 pb-5 pt-2 sm:px-6">
          <div className="flex min-w-0 max-w-full items-center gap-3.5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-brand-line bg-brand-pale text-brand-primaryInk">
              <Car className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="break-all font-mono text-2xl font-bold leading-8 text-brand-ink">
                  {vehicle.patente}
                </h1>
                <FleetVehicleStatusBadge status={vehicle.estadoOperativo} />
              </div>
              <p className="mt-0.5 break-words text-sm text-brand-muted">
                {displayName || 'Vehículo de flota sin descripción técnica'}
                {vehicle.codigoInterno ? ` · Código ${vehicle.codigoInterno}` : ''}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canUpdateFleet && (
              <button
                type="button"
                onClick={() => setIsEditingVehicle(true)}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-brand-line bg-white px-3 text-xs font-bold text-brand-ink transition-colors hover:border-brand-primary/40 hover:bg-brand-pale hover:text-brand-primaryInk focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-primary"
                aria-label="Editar ficha"
                title="Editar ficha"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" /> Editar
              </button>
            )}
          </div>
        </div>
      </header>

      <section
        className="grid shrink-0 grid-cols-2 border-b border-brand-line bg-brand-line/40 sm:grid-cols-4"
        aria-label="Resumen de documentos"
      >
        <div className="min-w-0 border-b border-r border-brand-line px-4 py-3 sm:border-b-0 sm:px-6">
          <p className="text-xs text-brand-muted">Documentos</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-brand-primaryInk">
            {summary.total}
          </p>
        </div>
        <div className="min-w-0 border-b border-brand-line px-4 py-3 sm:border-b-0 sm:border-r sm:px-6">
          <p className="text-xs text-brand-muted">Vencidos</p>
          <p
            className={`mt-1 text-xl font-semibold tabular-nums ${summary.expired > 0 ? 'text-brand-coralInk' : 'text-brand-mintInk'}`}
          >
            {summary.expired}
          </p>
        </div>
        <div className="min-w-0 border-r border-brand-line px-4 py-3 sm:px-6">
          <p className="text-xs text-brand-muted">Por vencer</p>
          <p
            className={`mt-1 text-xl font-semibold tabular-nums ${summary.expiringSoon > 0 ? 'text-brand-goldInk' : 'text-brand-mintInk'}`}
          >
            {summary.expiringSoon}
          </p>
        </div>
        <div className="min-w-0 px-4 py-3 sm:px-6">
          <p className="text-xs text-brand-muted">Próximo vencimiento</p>
          <p className="mt-1 break-words text-sm font-semibold text-brand-primaryInk">
            {summary.nextExpiry ? formatDate(summary.nextExpiry.fechaVencimiento) : 'Sin fechas'}
          </p>
        </div>
      </section>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <section aria-labelledby="fleet-vehicle-data-title">
            <h2 id="fleet-vehicle-data-title" className="flex items-center gap-2 text-base font-semibold text-brand-ink">
              <Settings2 className="h-4 w-4 text-brand-muted" aria-hidden="true" /> Datos del vehículo
            </h2>
            <dl className="mt-2 grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-1">
              <Fact icon={Hash} label="Código interno" value={vehicle.codigoInterno ?? 'Sin código'} />
              <Fact icon={MapPin} label="Sucursal" value={vehicle.sucursal ?? 'Sin sucursal'} />
              <Fact icon={UserRound} label="Responsable" value={vehicle.responsable ?? 'Sin responsable'} />
              <Fact icon={Car} label="Marca y modelo" value={[vehicle.marca, vehicle.modelo].filter(Boolean).join(' ') || 'Sin registrar'} />
              <Fact icon={CalendarDays} label="Año" value={vehicle.ano ? String(vehicle.ano) : 'Sin registrar'} />
              <Fact icon={Gauge} label="Kilometraje" value={formatKilometres(vehicle.kilometraje)} />
              <Fact icon={Fuel} label="Combustible" value={formatFleetOption(vehicle.combustible, fuelLabels)} />
              <Fact
                icon={Settings2}
                label="Transmisión"
                value={formatFleetOption(vehicle.transmision, transmissionLabels)}
              />
              <Fact icon={Hash} label="VIN / Chasis" value={vehicle.vinChasis ?? 'Sin registrar'} />
              <Fact icon={Wrench} label="Motor" value={vehicle.motor ?? 'Sin registrar'} />
              <Fact icon={CalendarDays} label="Registrado" value={formatDate(vehicle.createdAt)} />
            </dl>
          </section>

          <section aria-labelledby="fleet-documents-title" className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="fleet-documents-title" className="flex items-center gap-2 text-base font-semibold text-brand-ink">
                  <FileText className="h-4 w-4 text-brand-muted" aria-hidden="true" /> Documentos
                  <span className="rounded-full bg-brand-pale px-2 py-0.5 text-[11px] font-bold text-brand-muted">
                    {vehicle.documents.length}
                  </span>
                </h2>
                <p className="mt-0.5 text-xs text-brand-muted">
                  Documentación interna del vehículo. Los vencimientos generan alertas.
                </p>
              </div>
              {canCreateFleet && (
                <button
                  type="button"
                  className="secondary-button inline-flex h-9 items-center gap-1.5 px-3 text-xs font-bold"
                  onClick={() => setDocumentForm(null)}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" /> Agregar documento
                </button>
              )}
            </div>

            {vehicle.documents.length === 0 ? (
              <div className="mt-4 flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed border-brand-line bg-brand-pale/30 px-4 text-center">
                <FilePlus2 className="h-9 w-9 text-brand-muted" aria-hidden="true" />
                <p className="mt-2 font-semibold text-brand-ink">Sin documentos registrados</p>
                <p className="mt-1 text-sm text-brand-muted">
                  Agrega permisos, revisiones o seguros para controlar sus vencimientos.
                </p>
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {vehicle.documents.map((document) => (
                  <li
                    key={document.id}
                    className="rounded-xl border border-brand-line bg-white p-4 shadow-sm"
                  >
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-pale text-brand-primaryInk">
                          <FileText className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="break-words text-sm font-semibold text-brand-ink">
                            {document.nombre}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-brand-muted">
                            {document.referencia ? `Ref. ${document.referencia}` : 'Sin referencia'}
                            {document.version > 0 ? ` · v${document.version}` : ''}
                          </p>
                        </div>
                      </div>
                      <FleetExpiryBadge expiry={document.expiry} />
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-brand-pale/40 px-3 py-2 text-xs text-brand-muted">
                      <p>
                        <span className="block text-[11px] uppercase">Emisión</span>
                        <span className="font-medium text-brand-ink">
                          {document.fechaEmision ? formatDate(document.fechaEmision) : 'Sin fecha'}
                        </span>
                      </p>
                      <p>
                        <span className="block text-[11px] uppercase">Vencimiento</span>
                        <span className="font-medium text-brand-ink">
                          {document.fechaVencimiento
                            ? formatDate(document.fechaVencimiento)
                            : 'Sin vencimiento'}
                        </span>
                      </p>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-brand-line pt-3">
                      {document.tieneArchivo ? (
                        <>
                          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-brand-muted">
                            <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span className="truncate" title={document.archivoNombre ?? undefined}>
                              {document.archivoNombre}
                            </span>
                            {document.sizeBytes !== null ? (
                              <span className="shrink-0">{formatBytes(document.sizeBytes)}</span>
                            ) : null}
                          </span>
                          <a
                            href={fleetDocumentFileUrl(vehicleId, document.id)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-brand-line px-2 text-xs font-semibold text-brand-ink hover:bg-brand-pale"
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Ver
                          </a>
                          <a
                            href={fleetDocumentFileUrl(vehicleId, document.id, { download: true })}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-brand-line px-2 text-xs font-semibold text-brand-ink hover:bg-brand-pale"
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden="true" /> Descargar
                          </a>
                        </>
                      ) : (
                        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium text-brand-muted">
                          <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Sin archivo
                        </span>
                      )}

                      {document.version > 0 && (
                        <button
                          type="button"
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-brand-line px-2 text-xs font-semibold text-brand-ink hover:bg-brand-pale"
                          onClick={() => setVersionsDocument(document)}
                        >
                          <FileClock className="h-3.5 w-3.5" aria-hidden="true" /> Versiones
                        </button>
                      )}
                      {canUpdateFleet && (
                        <button
                          type="button"
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-brand-line px-2 text-xs font-semibold text-brand-ink hover:bg-brand-pale"
                          onClick={() => setDocumentForm(document)}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar
                        </button>
                      )}
                      {canDeleteFleet && (
                        <button
                          type="button"
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-brand-line px-2 text-xs font-semibold text-brand-coralInk hover:bg-brand-coralPale"
                          onClick={() => {
                            deleteDocumentMutation.reset();
                            setDeleteDocument(document);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Eliminar
                        </button>
                      )}
                    </div>

                    {document.notas && (
                      <p className="mt-2 whitespace-pre-line break-words border-t border-brand-line pt-2 text-xs text-brand-muted">
                        {document.notas}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {deleteDocumentMutation.isError && (
              <div
                className="mt-3 flex items-start gap-2 rounded-lg border border-brand-coral/30 bg-brand-coralPale px-3 py-2 text-sm text-brand-coralInk"
                role="alert"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {getApiErrorMessage(
                  deleteDocumentMutation.error,
                  'No fue posible eliminar el documento.',
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {isEditingVehicle && (
        <FleetVehicleFormModal
          vehicle={vehicle}
          onClose={() => setIsEditingVehicle(false)}
        />
      )}

      {documentForm !== undefined && (
        <FleetDocumentFormModal
          vehicleId={vehicleId}
          document={documentForm}
          onClose={() => setDocumentForm(undefined)}
        />
      )}

      {versionsDocument && (
        <FleetDocumentVersionsModal
          vehicleId={vehicleId}
          document={versionsDocument}
          onClose={() => setVersionsDocument(null)}
        />
      )}

      {deleteDocument && (
        <DeleteDocumentDialog
          document={deleteDocument}
          isPending={deleteDocumentMutation.isPending}
          onClose={() => setDeleteDocument(null)}
          onConfirm={confirmDeleteDocument}
        />
      )}
    </div>
  );
};

export default FleetVehicleDetail;
