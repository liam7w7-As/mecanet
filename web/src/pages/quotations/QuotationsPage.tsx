import { QUOTATION_ARCHIVE_DAYS } from '@unithor/shared';
import { Archive, ArchiveRestore, CalendarDays, CheckCheck, CircleDollarSign, Clock3, DollarSign, Download, FileText, LayoutGrid, Link2Off, LoaderCircle, Pencil, Plus, Search, Wrench, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';

import { AnimateIcon, AnimatedTableRow } from '../../components/animate-ui';
import ListExportButtons from '../../components/common/ListExportButtons';
import ModalHeader from '../../components/common/ModalHeader';
import Pagination from '../../components/common/Pagination';
import PdfPreviewModal from '../../components/common/PdfPreviewModal';
import PaymentFormModal from '../../components/quotations/PaymentFormModal';
import QuotationDateFilter from '../../components/quotations/QuotationDateFilter';
import QuotationDetailModal from '../../components/quotations/QuotationDetailModal';
import QuotationEditModal from '../../components/quotations/QuotationEditModal';
import QuotationStatusBadge from '../../components/quotations/QuotationStatusBadge';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useModalOverlay } from '../../hooks/useModalOverlay';
import { useArchiveQuotationMutation, useQuotation, useQuotations, useUnarchiveQuotationMutation } from '../../hooks/useQuotations';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDate, formatTime } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { getQuotationAttention } from '../../lib/quotation-attention';
import { useAuthStore } from '../../stores/auth.store';

import type { Quotation } from '../../types/entities';
import type { QuotationStatus } from '@unithor/shared';
import type { LucideIcon } from 'lucide-react';

type StatusFilter = QuotationStatus | 'all' | 'sin_ot' | 'archived';

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string; icon: LucideIcon }> = [
  { value: 'all', label: 'Todas', icon: LayoutGrid },
  { value: 'sin_ot', label: 'Sin OT', icon: Link2Off },
  { value: 'por_pagar', label: 'Por pagar', icon: CircleDollarSign },
  { value: 'parcial', label: 'Abono parcial', icon: Clock3 },
  { value: 'total', label: 'Pagadas total', icon: CheckCheck },
  { value: 'por_verificar', label: 'Por verificar', icon: Search },
  { value: 'archived', label: 'Archivadas', icon: Archive },
];

const QuotationSkeleton = () => (
  <>
    {Array.from({ length: 6 }, (_, index) => (
      <tr key={index} className="border-b border-brand-line">
        {Array.from({ length: 9 }, (_, cell) => (
          <td
            key={cell}
            className={`px-3 py-3.5 ${
              cell === 0
                ? 'hidden sm:table-cell'
                : cell === 4
                  ? 'hidden lg:table-cell'
                  : cell === 6
                    ? 'hidden md:table-cell'
                    : ''
            }`}
          >
            <div className="h-4 animate-pulse rounded bg-brand-pale" />
          </td>
        ))}
      </tr>
    ))}
  </>
);

const QuotationEditLoadDialog = ({ loading, error, onClose, onRetry }: {
  loading: boolean;
  error: unknown;
  onClose: () => void;
  onRetry: () => void;
}) => {
  const setOverlayNode = useModalOverlay({ isOpen: true, onClose });

  return createPortal(
    <div className="reception-edit-overlay reference-modal-overlay">
      <button type="button" className="reception-edit-backdrop" onClick={onClose}
        aria-label="Cerrar carga de cotización" tabIndex={-1} />
      <section role="dialog" aria-modal="true" aria-labelledby="quotation-edit-load-title"
        aria-busy={loading} tabIndex={-1} ref={setOverlayNode}
        className="reception-edit-dialog reference-dialog commercial-form-dialog">
        <ModalHeader id="quotation-edit-load-title" title="Editar cotización" onClose={onClose} />
        <div className="reception-edit-body">
          {loading ? (
            <p role="status" className="flex items-center gap-2 text-sm text-brand-muted">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              Cargando cotización para editar…
            </p>
          ) : (
            <p role="alert" className="text-sm text-brand-coralInk">
              {getApiErrorMessage(error, 'No fue posible cargar la cotización para editar.')}
            </p>
          )}
        </div>
        <footer className="reception-edit-footer">
          <div>
            <button type="button" className="reception-secondary-button" onClick={onClose}>Cancelar</button>
            {!loading && <button type="button" className="reception-primary-button" onClick={onRetry}>Reintentar</button>}
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
};

export const QuotationsPage = () => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [previewQuotationId, setPreviewQuotationId] = useState<number | null>(null);
  const [paymentQuotation, setPaymentQuotation] = useState<{ id: number; codigo: string; saldoPendiente: number } | null>(null);
  const [detailQuotationId, setDetailQuotationId] = useState<number | null>(null);
  const [editQuotationId, setEditQuotationId] = useState<number | null>(null);
  const [quotationToArchive, setQuotationToArchive] = useState<Quotation | null>(null);
  const archiveMutation = useArchiveQuotationMutation();
  const [quotationToUnarchive, setQuotationToUnarchive] = useState<Quotation | null>(null);
  const unarchiveMutation = useUnarchiveQuotationMutation();
  const debouncedSearch = useDebouncedValue(search, 350);
  const filters = {
    page,
    pageSize: 20,
    search: debouncedSearch || undefined,
    estadoPago: status === 'all' || status === 'sin_ot' || status === 'archived' ? undefined : status,
    workOrderLinked: status === 'sin_ot' ? false : undefined,
    archiveStatus: status === 'archived' ? 'archived' : 'active',
    fechaDesde: fechaDesde || undefined,
    fechaHasta: fechaHasta || undefined,
  } satisfies Parameters<typeof useQuotations>[0];
  const quotationsQuery = useQuotations(filters);
  // Detalle completo para la vista previa: la lista no trae ítems,
  // el diseño de vista previa necesita ítems y totales completos.
  const previewQuery = useQuotation(previewQuotationId ?? 0);
  // Detalle completo para edición: igual que previewQuery, la lista no incluye ítems.
  const editQuery = useQuotation(editQuotationId ?? 0);
  const canCreate = Boolean(user && hasUserPermission(user, 'comercial', 'create'));
  const canPay = Boolean(user && (hasUserPermission(user, 'comercial', 'create') || hasUserPermission(user, 'finanzas', 'create')));
  const canEdit = Boolean(user && hasUserPermission(user, 'comercial', 'update'));
  const canConvert = Boolean(user && (hasUserPermission(user, 'comercial', 'update') || hasUserPermission(user, 'taller', 'create')));

  useEffect(() => setPage(1), [debouncedSearch, fechaDesde, fechaHasta, status]);

  return (
    <div className="commercial-board min-w-0 space-y-5">
      <header className="commercial-heading"><h1>Comercial y Cotizaciones</h1></header>
      <div className="commercial-toolbar">
        <label className="commercial-search"><Search aria-hidden="true" /><span className="sr-only">Buscar cotizaciones</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="COT o nombre del cliente" />{search && <button type="button" aria-label="Limpiar búsqueda" onClick={() => setSearch('')}><X aria-hidden="true" /></button>}</label>
        <QuotationDateFilter from={fechaDesde} to={fechaHasta} onApply={(from, to) => { setFechaDesde(from); setFechaHasta(to); setPage(1); }} />
        {canCreate && <Link to="/quotations/new" className="commercial-new primary-button"><Plus aria-hidden="true" /><span>Nueva Cotización</span></Link>}
        <div className="commercial-status-filters" role="tablist" aria-label="Filtrar cotizaciones por estado">
          {STATUS_FILTERS.map(({ value, label, icon: Icon }) => <button key={value} type="button" role="tab" aria-selected={status === value} aria-label={label} title={value === 'archived' ? 'Archivadas manualmente o con vigencia vencida, sin OT ni abonos' : label} onClick={() => setStatus(value)}><Icon aria-hidden="true" /><span>{label}</span></button>)}
        </div>
      </div>
      {(fechaDesde || fechaHasta) && <div className="commercial-date-context"><CalendarDays aria-hidden="true" /><span>{fechaDesde ? formatDate(fechaDesde + 'T12:00:00') : 'Desde el inicio'} — {fechaHasta ? formatDate(fechaHasta + 'T12:00:00') : 'Sin fecha final'}</span><button type="button" aria-label="Quitar filtro de fechas" onClick={() => { setFechaDesde(''); setFechaHasta(''); }}><X aria-hidden="true" /></button></div>}
      <div className="commercial-results-context">
        <span><strong>{quotationsQuery.data?.total ?? 0}</strong> cotizaciones · {STATUS_FILTERS.find((filter) => filter.value === status)?.label}</span>
        <ListExportButtons
          target="quotations"
          filters={filters}
          disabled={quotationsQuery.isPending || quotationsQuery.isError}
        />
      </div>
      <section className="commercial-register" aria-label="Listado de cotizaciones">
        {(quotationsQuery.isError || previewQuery.isError) && <div className="border-b border-brand-coral/30 bg-brand-coralPale px-4 py-3 text-sm text-brand-coralInk" role="alert">{getApiErrorMessage(quotationsQuery.error ?? previewQuery.error, 'No fue posible completar la operación.')}</div>}

        {quotationToArchive && (
          <div role="region" aria-label="Confirmar archivo" className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-line bg-brand-pale p-4">
            <div className="min-w-0 text-sm text-brand-ink">
              <p className="font-semibold">¿Archivar {quotationToArchive.codigo}?</p>
              <p className="text-brand-muted">Se moverá a Archivadas sin eliminar sus datos.</p>
              {archiveMutation.isError && <p role="alert" className="mt-1 text-brand-coralInk">{getApiErrorMessage(archiveMutation.error)}</p>}
            </div>
            <div className="flex gap-2">
              <button type="button" className="secondary-button" disabled={archiveMutation.isPending} onClick={() => setQuotationToArchive(null)}>Cancelar</button>
              <button type="button" className="primary-button" disabled={archiveMutation.isPending} onClick={() => archiveMutation.mutate(quotationToArchive.id, { onSuccess: () => setQuotationToArchive(null) })}>
                {archiveMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Archive className="h-4 w-4" aria-hidden="true" />}
                Confirmar archivo
              </button>
            </div>
          </div>
        )}
        {quotationToUnarchive && (
          <div role="region" aria-label="Confirmar desarchivo" className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-line bg-brand-pale p-4">
            <div className="min-w-0 text-sm text-brand-ink">
              <p className="font-semibold">¿Desarchivar {quotationToUnarchive.codigo}?</p>
              <p className="text-brand-muted">Volverá al listado de cotizaciones activas.</p>
              {unarchiveMutation.isError && <p role="alert" className="mt-1 text-brand-coralInk">{getApiErrorMessage(unarchiveMutation.error)}</p>}
            </div>
            <div className="flex gap-2">
              <button type="button" className="secondary-button" disabled={unarchiveMutation.isPending} onClick={() => setQuotationToUnarchive(null)}>Cancelar</button>
              <button type="button" className="primary-button" disabled={unarchiveMutation.isPending} onClick={() => unarchiveMutation.mutate(quotationToUnarchive.id, { onSuccess: () => setQuotationToUnarchive(null) })}>
                {unarchiveMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArchiveRestore className="h-4 w-4" aria-hidden="true" />}
                Confirmar desarchivo
              </button>
            </div>
          </div>
        )}
        <div className="commercial-table-frame rounded-xl border border-brand-line bg-white shadow-sm">
          <table className="commercial-table w-full text-left text-sm" aria-label="Cotizaciones">
            <thead className="bg-brand-line/40 text-[11px] uppercase text-brand-muted">
              <tr>
                <th className="hidden sm:table-cell px-3.5 py-3 font-semibold">N°</th>
                <th className="px-3.5 py-3 font-semibold">Código COT</th>
                <th className="px-3.5 py-3 font-semibold">Cliente</th>
                <th className="px-3.5 py-3 font-semibold">Estado pago</th>
                <th className="hidden lg:table-cell px-3.5 py-3 font-semibold">Emitida</th>
                <th className="px-3.5 py-3 text-right font-semibold">Total</th>
                <th className="hidden md:table-cell px-3.5 py-3 text-right font-semibold">Pagado</th>
                <th className="px-3.5 py-3 text-right font-semibold">Saldo</th>
                <th className="px-3.5 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {quotationsQuery.isPending ? <QuotationSkeleton /> : quotationsQuery.data?.items.map((quotation, index) => {
                const balance = Math.max(0, Number(quotation.total) - Number(quotation.pagado));
                const rowNumber = (page - 1) * (quotationsQuery.data?.pageSize ?? 20) + index + 1;
                const attention = status === 'archived' ? null : getQuotationAttention(quotation);
                const rowStyle = status === 'archived'
                  ? 'bg-slate-50/60 hover:bg-slate-100/70'
                  : attention?.kind === 'linked'
                    ? 'bg-orange-50/80 hover:bg-orange-100/70'
                    : attention?.kind === 'fading'
                      ? 'bg-amber-50/50 hover:bg-amber-100/70'
                      : attention?.kind === 'unlinked'
                        ? 'bg-yellow-50/80 hover:bg-yellow-100/70'
                        : 'hover:bg-brand-pale/50';
                return (
                  <AnimatedTableRow
                    key={quotation.id}
                    delay={index * 0.02}
                    enableHover={false}
                    tabIndex={0}
                    aria-label={`Cotización ${quotation.codigo}`}
                    onClick={(event) => { if (event.target instanceof Element && !event.target.closest('button, a, input, select')) setDetailQuotationId(quotation.id); }}
                    onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setDetailQuotationId(quotation.id); } }}
                    data-attention={attention?.kind} data-archived={status === 'archived'} className={`border-b border-brand-line transition-colors last:border-0 ${rowStyle}`}
                  >
                    <td data-label="N°" className={`hidden sm:table-cell border-l-4 px-3.5 py-3 font-mono text-xs font-bold text-brand-muted ${status === 'archived' ? 'border-slate-300' : attention?.kind === 'linked' ? 'border-orange-400' : attention ? 'border-yellow-400' : 'border-transparent'}`}>
                      {rowNumber}
                    </td>
                    <td data-label="Código COT" className="px-3.5 py-3">
                      <Link to={`/quotations/${quotation.id}`} onClick={(event) => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); setDetailQuotationId(quotation.id); } }} className="font-mono text-sm font-bold text-brand-primaryInk hover:underline">
                        {quotation.codigo}
                      </Link>
                      {quotation.workOrder && (
                        <Link to={`/work-orders/${quotation.workOrder.id}`} className="mt-0.5 block font-mono text-xs font-bold text-emerald-700 hover:underline">
                          {quotation.workOrder.codigo}
                        </Link>
                      )}
                      {quotation.asesor?.nombre && <span className="commercial-advisor" title={quotation.asesor.nombre}>{quotation.asesor.nombre}</span>}
                      <span className="commercial-issued-inline">{formatDate(quotation.createdAt)}</span>
                      {status === 'archived' ? (
                        <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-600">
                          <Archive className="h-3 w-3 shrink-0" aria-hidden="true" />
                          {quotation.archivedAt ? 'Archivada manualmente' : 'Vigencia vencida'}
                        </span>
                      ) : (
                        attention && (
                          <span className={`mt-1 block text-xs font-semibold ${
                            attention.kind === 'linked' ? 'text-orange-800' : 'text-amber-800'
                          }`}>
                            {attention.kind === 'linked' ? `OT sin actividad: ${attention.days} días` : attention.kind === 'fading' ? `Se archivará en ${(quotation.validezDias ?? QUOTATION_ARCHIVE_DAYS) - attention.days} días` : `Sin OT: ${attention.days} días`}
                          </span>
                        )
                      )}
                    </td>
                    <td data-label="Cliente" className="px-3.5 py-3">
                      <span className="block break-words text-sm font-semibold text-brand-ink">{quotation.client?.nombre ?? 'Sin cliente'}</span>
                      <span className="block text-xs font-mono text-brand-muted">{quotation.client?.rut ?? 'Sin identificación'}</span>
                      {quotation.vehicle?.patente && (
                        <span className="mt-1 inline-block rounded border border-brand-line bg-brand-pale px-1.5 py-0.5 font-mono text-xs font-bold text-brand-primaryInk">
                          {quotation.vehicle.patente}
                        </span>
                      )}
                    </td>
                    <td data-label="Estado pago" className="px-3.5 py-3 whitespace-nowrap">
                      <QuotationStatusBadge status={quotation.estadoPago} />
                    </td>
                    <td data-label="Emitida" className="hidden lg:table-cell px-3.5 py-3 text-xs text-brand-muted whitespace-nowrap">
                      <span className="block">{formatDate(quotation.createdAt)}</span>
                      <span className="mt-0.5 block text-[11px]">{formatTime(quotation.createdAt)}</span>
                    </td>
                    <td data-label="Total" className="px-3.5 py-3 text-right text-sm font-semibold text-brand-ink whitespace-nowrap">
                      {formatClp(quotation.total)}
                    </td>
                    <td data-label="Pagado" className="hidden md:table-cell px-3.5 py-3 text-right text-sm text-brand-muted whitespace-nowrap">
                      {formatClp(quotation.pagado)}
                    </td>
                    <td data-label="Saldo" className="px-3.5 py-3 text-right text-sm font-bold text-brand-primaryInk whitespace-nowrap">
                      {formatClp(balance)}
                    </td>
                    <td data-label="Acciones" className="px-3.5 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1 [&>button]:h-8 [&>button]:w-8 [&>button]:rounded-lg">
                        {canEdit && status === 'archived' && quotation.archivedAt && (
                          <button type="button" className="flex items-center justify-center text-brand-muted hover:bg-brand-pale hover:text-brand-primaryInk" title="Desarchivar cotización" aria-label={`Desarchivar ${quotation.codigo}`} onClick={() => { unarchiveMutation.reset(); setQuotationToUnarchive(quotation); }}>
                            <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                        {canEdit && status !== 'archived' && quotation.workOrderId === null && Number(quotation.pagado) === 0 && quotation.estadoPago === 'por_pagar' && (
                          <button type="button" className="flex items-center justify-center text-brand-muted hover:bg-brand-pale hover:text-brand-primaryInk" title="Archivar cotización" aria-label={`Archivar ${quotation.codigo}`} onClick={() => { archiveMutation.reset(); setQuotationToArchive(quotation); }}>
                            <Archive className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                        {canPay && balance > 0 && status !== 'archived' && (
                          <button
                            type="button"
                            onClick={() => setPaymentQuotation({ id: quotation.id, codigo: quotation.codigo, saldoPendiente: balance })}
                            className="inline-flex items-center justify-center rounded-lg bg-brand-mintPale text-brand-mintInk ring-1 ring-inset ring-brand-line transition-all hover:bg-brand-mintPale active:scale-95"
                            aria-label={`Abonar a ${quotation.codigo}`}
                            title="Registrar abono"
                          >
                            <AnimateIcon variant="bounce" animateOnHover>
                              <DollarSign className="h-4 w-4" aria-hidden="true" />
                            </AnimateIcon>
                          </button>
                        )}
                        {canEdit && (
                          quotation.estadoPago === 'total' ? (
                            <button
                              type="button"
                              disabled
                              className="flex items-center justify-center rounded-lg text-brand-muted/30"
                              aria-label={`Editar ${quotation.codigo} deshabilitado`}
                              title="Cotización pagada"
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="group flex items-center justify-center rounded-lg text-brand-muted hover:bg-brand-pale hover:text-brand-primary disabled:opacity-50"
                              aria-label={`Editar ${quotation.codigo}`}
                              title="Editar"
                              onClick={() => setEditQuotationId(quotation.id)}
                              disabled={editQuery.isPending && editQuotationId === quotation.id}
                            >
                              {editQuery.isPending && editQuotationId === quotation.id
                                ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                                : <AnimateIcon variant="wiggle" animateOnHover><Pencil className="h-4 w-4" aria-hidden="true" /></AnimateIcon>
                              }
                            </button>
                          )
                        )}
                        {canConvert && quotation.workOrderId === null && !quotation.archivedAt && (
                          <button type="button" className="group flex items-center justify-center rounded-lg text-brand-muted hover:bg-brand-mintPale hover:text-brand-mintInk" onClick={() => navigate(`/quotations/${quotation.id}/convert-to-ot`)} aria-label={`Convertir ${quotation.codigo} a OT`} title="Convertir a OT">
                            <AnimateIcon variant="spin" animateOnHover><Wrench className="h-4 w-4" aria-hidden="true" /></AnimateIcon>
                          </button>
                        )}
                        <button type="button" className="group flex items-center justify-center rounded-lg text-brand-muted hover:bg-brand-pale hover:text-brand-primary disabled:opacity-50" onClick={() => setPreviewQuotationId(quotation.id)} disabled={previewQuery.isPending && previewQuotationId === quotation.id} aria-label={`Vista previa PDF de ${quotation.codigo}`} title="Vista previa / Descargar PDF (mismo diseño)">
                          {previewQuery.isPending && previewQuotationId === quotation.id ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <AnimateIcon variant="bounce" animateOnHover><Download className="h-4 w-4" aria-hidden="true" /></AnimateIcon>}
                        </button>
                        <button type="button" className="group flex items-center justify-center rounded-lg bg-brand-pale text-brand-primaryInk hover:bg-brand-primaryHover hover:text-white" onClick={() => setDetailQuotationId(quotation.id)} aria-label={`Ver detalle de ${quotation.codigo}`} title="Ver detalle">
                          <AnimateIcon variant="hover-lift" animateOnHover>
                            <FileText className="h-4 w-4" aria-hidden="true" />
                          </AnimateIcon>
                        </button>
                      </div>
                    </td>
                  </AnimatedTableRow>
                );
              })}
            </tbody>
          </table>
        </div>
        {!quotationsQuery.isPending && quotationsQuery.data?.items.length === 0 && <div className="flex min-h-56 flex-col items-center justify-center px-4 text-center"><FileText className="h-10 w-10 text-brand-muted/40" aria-hidden="true" /><p className="mt-3 font-semibold text-brand-ink">{status === 'archived' ? 'No hay cotizaciones archivadas' : 'No se encontraron cotizaciones'}</p><p className="mt-1 text-sm text-brand-muted">Cambie los filtros o emita el primer presupuesto.</p><button type="button" className="commercial-reset" onClick={() => { setSearch(''); setStatus('all'); setFechaDesde(''); setFechaHasta(''); }}>Limpiar filtros</button></div>}
        <Pagination page={page} totalPages={quotationsQuery.data?.totalPages ?? 0} total={quotationsQuery.data?.total ?? 0} onPageChange={setPage} />
      </section>


      {editQuotationId !== null && !editQuery.data && (
        <QuotationEditLoadDialog
          loading={editQuery.isPending || editQuery.isFetching}
          error={editQuery.error}
          onClose={() => setEditQuotationId(null)}
          onRetry={() => void editQuery.refetch()}
        />
      )}
      {editQuotationId !== null && editQuery.data && (
        <QuotationEditModal
          quotation={editQuery.data}
          onClose={() => setEditQuotationId(null)}
        />
      )}

      {paymentQuotation && (
        <PaymentFormModal
          quotationId={paymentQuotation.id}
          codigo={paymentQuotation.codigo}
          saldoPendiente={paymentQuotation.saldoPendiente}
          onClose={() => setPaymentQuotation(null)}
        />
      )}

      {detailQuotationId !== null && (
        <QuotationDetailModal
          quotationId={detailQuotationId}
          onClose={() => setDetailQuotationId(null)}
        />
      )}

      {previewQuotationId !== null && previewQuery.data && (
        <PdfPreviewModal
          type="quotation"
          quotation={previewQuery.data}
          onClose={() => setPreviewQuotationId(null)}
        />
      )}
    </div>
  );
};

export default QuotationsPage;
