import { FLEET_REQUIRED_DOCUMENTS, getFleetRequiredDocumentSummary, getFleetRequiredDocumentType } from '@unithor/shared';
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
import { useId, useState } from 'react';

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
import ModalHeader from '../common/ModalHeader';

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
        className="workspace-dialog vehicle-delete-dialog relative w-full max-w-md rounded-2xl border border-brand-line bg-white p-6 shadow-2xl"
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
  showOwner?: boolean;
  onClose: () => void;
}

export const FleetVehicleDetail = ({ vehicleId, showOwner = false, onClose }: FleetVehicleDetailProps) => {
  const profileId = useId();
  const [activeTab, setActiveTab] = useState<'data' | 'documents'>('data');
  const user = useAuthStore((state) => state.user);
  const vehicleQuery = useFleetVehicle(vehicleId);
  const deleteDocumentMutation = useDeleteFleetDocumentMutation(vehicleId);
  const [isEditingVehicle, setIsEditingVehicle] = useState(false);
  const [documentForm, setDocumentForm] = useState<{ document?: FleetDocument; initialName?: string } | null>(null);
  const [versionsDocument, setVersionsDocument] = useState<FleetDocument | null>(null);
  const [deleteDocument, setDeleteDocument] = useState<FleetDocument | null>(null);

  const canCreateFleet = Boolean(user && hasUserPermission(user, 'flota', 'create'));
  const canUpdateFleet = Boolean(user && hasUserPermission(user, 'flota', 'update'));
  const canDeleteFleet = Boolean(user && hasUserPermission(user, 'flota', 'delete'));
  const canViewOwner = user?.role === 'admin' || user?.role === 'desarrollador';

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
  const requiredSummary = getFleetRequiredDocumentSummary(vehicle.documents);
  const additionalDocuments = vehicle.documents.filter((document) => getFleetRequiredDocumentType(document.nombre) === null);
  const displayName = [vehicle.marca, vehicle.modelo, vehicle.ano].filter(Boolean).join(' · ');

  const confirmDeleteDocument = (): void => {
    if (!deleteDocument) return;
    deleteDocumentMutation.mutate(deleteDocument.id, {
      onSuccess: () => setDeleteDocument(null),
    });
  };

  const renderDocument = (document: FleetDocument) => (
                  <li
                    key={document.id}
                    className="fleet-document-row rounded-xl border border-brand-line bg-white p-4 shadow-sm"
                  >
                    <div className="fleet-document-row-heading flex min-w-0 flex-wrap items-start justify-between gap-2">
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
                      {getFleetRequiredDocumentType(document.nombre) && !document.fechaVencimiento ? <span className="text-xs font-semibold text-amber-700">Fecha de vencimiento pendiente</span> : <FleetExpiryBadge expiry={document.expiry} />}
                    </div>

                    <div className="fleet-document-row-dates mt-3 grid grid-cols-2 gap-2 rounded-lg bg-brand-pale/40 px-3 py-2 text-xs text-brand-muted">
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
                            : getFleetRequiredDocumentType(document.nombre) ? 'Pendiente de informar' : 'Sin vencimiento'}
                        </span>
                      </p>
                    </div>

                    <div className="fleet-document-row-actions mt-3 flex flex-wrap items-center gap-2 border-t border-brand-line pt-3">
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
                          onClick={() => setDocumentForm({ document })}
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
                      <p className="fleet-document-row-notes mt-2 whitespace-pre-line break-words border-t border-brand-line pt-2 text-xs text-brand-muted">
                        {document.notas}
                      </p>
                    )}
                  </li>
  );

  return (
    <div className="vehicle-profile vehicle-profile--fleet flex min-h-0 min-w-0 flex-col overflow-hidden bg-white">
      <header className="vehicle-profile-header">
        <ModalHeader id={`${profileId}-title`} title={vehicle.patente} variant="brand" eyebrow="Flota interna" description={<>
          {showOwner && canViewOwner && <span className="mb-1 block break-words">Propietario: {vehicle.propietario ?? 'Sin registrar'}</span>}
          <span>{`${displayName || 'Vehículo de flota sin descripción técnica'}${vehicle.codigoInterno ? ` · Código ${vehicle.codigoInterno}` : ''}`}</span>
        </>} badge={<Car aria-hidden="true" />} actions={<FleetVehicleStatusBadge status={vehicle.estadoOperativo} />} onClose={onClose} closeLabel="Cerrar ficha" />
        {canUpdateFleet && <div className="vehicle-profile-actions"><button type="button" onClick={() => setIsEditingVehicle(true)} aria-label="Editar ficha"><Pencil aria-hidden="true" />Editar vehículo</button></div>}
      </header>
      <div className="reference-dialog-tabs vehicle-profile-tabs" role="tablist" aria-label="Información de flota" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        {([{ id: 'data', label: 'Ficha', icon: Car }, { id: 'documents', label: 'Documentos', icon: FileText }] as const).map(({ id, label, icon: Icon }) => <button key={id} id={`${profileId}-${id}-tab`} type="button" role="tab" aria-selected={activeTab === id} aria-controls={`${profileId}-${id}-panel`} tabIndex={activeTab === id ? 0 : -1} onClick={() => setActiveTab(id)} onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 'data' : event.key === 'End' ? 'documents' : id === 'data' ? 'documents' : 'data';
          setActiveTab(next); document.getElementById(`${profileId}-${next}-tab`)?.focus();
        }}><Icon aria-hidden="true" />{label}{id === 'documents' && <span>{vehicle.documents.length}</span>}</button>)}
      </div>

      <section
        className="vehicle-profile-metrics"
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

      <div className="reference-dialog-body vehicle-profile-body">
        <div className="p-5 sm:p-6">
          <section role="tabpanel" id={`${profileId}-data-panel`} aria-labelledby={`${profileId}-data-tab`} hidden={activeTab !== 'data'} tabIndex={0} className="fleet-profile-technical">
            <h2 id="fleet-vehicle-data-title" className="flex items-center gap-2 text-base font-semibold text-brand-ink">
              <Settings2 className="h-4 w-4 text-brand-muted" aria-hidden="true" /> Datos del vehículo
            </h2>
            <dl className="mt-2 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <Fact icon={Hash} label="Código interno" value={vehicle.codigoInterno ?? 'Sin código'} />
              <Fact icon={MapPin} label="Sucursal" value={vehicle.sucursal ?? 'Sin sucursal'} />
              <Fact icon={UserRound} label="Responsable / encargado del vehículo" value={vehicle.responsable ?? 'Sin responsable'} />
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
              {(vehicle.estadoOperativo === 'dado_de_baja' || vehicle.fechaBaja || vehicle.motivoBaja) && (
                <>
                  <Fact icon={CalendarDays} label="Última fecha de baja" value={vehicle.fechaBaja ? formatDate(vehicle.fechaBaja) : 'Sin registrar'} />
                  <Fact icon={FileText} label="Motivo de la última baja" value={vehicle.motivoBaja ?? 'Sin motivo registrado'} />
                </>
              )}
            </dl>
          </section>

          <section role="tabpanel" id={`${profileId}-documents-panel`} aria-labelledby={`${profileId}-documents-tab`} hidden={activeTab !== 'documents'} tabIndex={0} className="min-w-0">
            <div className="fleet-documents-heading flex flex-wrap items-center justify-between gap-3">
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
                  onClick={() => setDocumentForm({})}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" /> Agregar documento
                </button>
              )}
            </div>

            <section className="mt-4 space-y-3" aria-label="Documentos obligatorios">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-brand-primaryInk">Documentos obligatorios</h3>
                <p className="text-xs text-brand-muted">{requiredSummary.registered}/3 registrados · {requiredSummary.complete}/3 con archivo y vencimiento</p>
              </div>
              <div className="grid min-w-0 gap-3 lg:grid-cols-3">
                {FLEET_REQUIRED_DOCUMENTS.map(({ type, nombre }) => {
                  const documents = vehicle.documents.filter((document) => getFleetRequiredDocumentType(document.nombre) === type);
                  return <section key={type} aria-label={nombre} className="min-w-0 rounded-xl border border-brand-line bg-brand-pale/20 p-3">
                    <h4 className="text-sm font-bold text-brand-primaryInk">{nombre} · Obligatorio</h4>
                    {documents.length ? <ul className="fleet-document-list mt-3 space-y-3">{documents.map(renderDocument)}</ul> : <div className="py-5 text-center">
                      <FilePlus2 className="mx-auto h-7 w-7 text-brand-muted" aria-hidden="true" />
                      <p className="mt-2 text-sm font-semibold text-amber-700">Pendiente de registro</p>
                      <p className="mt-1 text-xs text-brand-muted">Carga el archivo e informa su vencimiento cuando esté disponible.</p>
                      {canCreateFleet && <button type="button" onClick={() => setDocumentForm({ initialName: nombre })} className="secondary-button mt-3 inline-flex min-h-9 items-center gap-1.5 px-3 text-xs font-bold" aria-label={`Registrar ${nombre}`}><Plus className="h-4 w-4" aria-hidden="true" />Registrar documento</button>}
                    </div>}
                  </section>;
                })}
              </div>
            </section>
            <section className="mt-6 border-t border-brand-line pt-4" aria-label="Documentos adicionales">
              <h3 className="text-sm font-bold text-brand-primaryInk">Documentos adicionales <span className="font-normal text-brand-muted">({additionalDocuments.length})</span></h3>
              <p className="mt-1 text-xs text-brand-muted">Otros certificados, mantenciones o respaldos. Pueden registrarse sin vencimiento.</p>
              {additionalDocuments.length ? <ul className="fleet-document-list mt-3 space-y-3">{additionalDocuments.map(renderDocument)}</ul> : <p className="mt-3 rounded-lg border border-dashed border-brand-line p-4 text-sm text-brand-muted">Sin documentos adicionales registrados.</p>}
            </section>

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

      <footer className="reference-dialog-footer"><button type="button" className="secondary-button" onClick={onClose}>Cerrar</button></footer>
      {isEditingVehicle && canUpdateFleet && (
        <FleetVehicleFormModal
          vehicle={vehicle}
          onClose={() => setIsEditingVehicle(false)}
        />
      )}

      {documentForm && (
        <FleetDocumentFormModal
          vehicleId={vehicleId}
          document={documentForm.document}
          initialName={documentForm.initialName}
          onClose={() => setDocumentForm(null)}
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
