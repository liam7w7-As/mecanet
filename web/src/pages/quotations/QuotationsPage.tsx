import { QUOTATION_ARCHIVE_DAYS } from '@unithor/shared';
import { Archive, DollarSign, Download, FileSpreadsheet, FileText, LoaderCircle, Pencil, Plus, Search, Wrench } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { AnimateIcon, AnimatedTableRow } from '../../components/animate-ui';
import Pagination from '../../components/common/Pagination';
import PdfPreviewModal from '../../components/common/PdfPreviewModal';
import ConvertQuotationModal from '../../components/quotations/ConvertQuotationModal';
import PaymentFormModal from '../../components/quotations/PaymentFormModal';
import QuotationDetailModal from '../../components/quotations/QuotationDetailModal';
import QuotationEditModal from '../../components/quotations/QuotationEditModal';
import QuotationStatusBadge from '../../components/quotations/QuotationStatusBadge';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useDownloadCommercialExcel } from '../../hooks/usePayments';
import { useArchiveQuotationMutation, useQuotation, useQuotations } from '../../hooks/useQuotations';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDate } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { getQuotationAttention } from '../../lib/quotation-attention';
import { useAuthStore } from '../../stores/auth.store';

import type { Quotation } from '../../types/entities';
import type { QuotationStatus } from '@unithor/shared';

type StatusFilter = QuotationStatus | 'all' | 'sin_ot' | 'archived';

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'sin_ot', label: 'Sin OT' },
  { value: 'por_pagar', label: 'Por pagar' },
  { value: 'parcial', label: 'Abono parcial' },
  { value: 'total', label: 'Pagadas total' },
  { value: 'por_verificar', label: 'Por verificar' },
  { value: 'archived', label: 'Archivadas' },
];

const toDateInput = (date: Date): string => date.toISOString().slice(0, 10);

const firstDayOfMonth = (): string => {
  const now = new Date();
  return toDateInput(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
};

const QuotationSkeleton = () => (
  <>{Array.from({ length: 6 }, (_, index) => <tr key={index} className="border-b border-brand-line">{Array.from({ length: 9 }, (_, cell) => <td key={cell} className="px-4 py-5"><div className="h-4 animate-pulse rounded bg-brand-pale" /></td>)}</tr>)}</>
);

export const QuotationsPage = () => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [quotationToConvert, setQuotationToConvert] = useState<Quotation | null>(null);
  const [previewQuotationId, setPreviewQuotationId] = useState<number | null>(null);
  const [paymentQuotation, setPaymentQuotation] = useState<{ id: number; codigo: string; saldoPendiente: number } | null>(null);
  const [detailQuotationId, setDetailQuotationId] = useState<number | null>(null);
  const [editQuotationId, setEditQuotationId] = useState<number | null>(null);
  const [quotationToArchive, setQuotationToArchive] = useState<Quotation | null>(null);
  const archiveMutation = useArchiveQuotationMutation();
  const debouncedSearch = useDebouncedValue(search, 350);
  const quotationsQuery = useQuotations({
    page,
    pageSize: 20,
    search: debouncedSearch || undefined,
    estadoPago: status === 'all' || status === 'sin_ot' || status === 'archived' ? undefined : status,
    workOrderLinked: status === 'sin_ot' ? false : undefined,
    archiveStatus: status === 'archived' ? 'archived' : 'active',
    fechaDesde: fechaDesde || undefined,
    fechaHasta: fechaHasta || undefined,
  });
  const excelMutation = useDownloadCommercialExcel();
  // Detalle completo para la vista previa: la lista no trae ítems,
  // el diseño de vista previa necesita ítems y totales completos.
  const previewQuery = useQuotation(previewQuotationId ?? 0);
  // Detalle completo para edición: igual que previewQuery, la lista no incluye ítems.
  const editQuery = useQuotation(editQuotationId ?? 0);
  const canCreate = Boolean(user && hasUserPermission(user, 'comercial', 'create'));
  const canEdit = Boolean(user && hasUserPermission(user, 'comercial', 'update'));
  const canConvert = Boolean(user && (hasUserPermission(user, 'comercial', 'update') || hasUserPermission(user, 'taller', 'create')));
  const canExport = Boolean(user && hasUserPermission(user, 'comercial', 'export'));

  useEffect(() => setPage(1), [debouncedSearch, fechaDesde, fechaHasta, status]);

  return (
    <div className="min-w-0 space-y-5">
      <header className="page-banner max-sm:!h-auto max-sm:flex-col max-sm:items-start max-sm:gap-3">
        <div className="min-w-0">
          <p className="text-sm text-brand-muted">Gestión comercial</p>
          <h1 className="mt-1">Comercial - Cotizaciones</h1>
        </div>
        <div className="relative z-[1] ml-auto flex flex-wrap gap-2">
          {canExport && (
            <button type="button" className="secondary-button inline-flex items-center gap-2 text-sm font-medium text-brand-ink transition-colors hover:border-brand-primary hover:text-brand-primaryInk disabled:opacity-60" onClick={() => excelMutation.mutate({ fechaDesde: fechaDesde || firstDayOfMonth(), fechaHasta: fechaHasta || toDateInput(new Date()), estadoPago: status === 'all' || status === 'sin_ot' || status === 'archived' ? undefined : status })} disabled={excelMutation.isPending} title="Sin fechas seleccionadas, exporta el mes actual">
              {excelMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <AnimateIcon variant="bounce" animateOnHover><FileSpreadsheet className="h-4 w-4" aria-hidden="true" /></AnimateIcon>}
              Exportar Excel
            </button>
          )}
          {canCreate && (
            <Link to="/quotations/new" className="primary-button">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nueva Cotización
            </Link>
          )}
        </div>
      </header>

      <section className="overflow-hidden rounded-xl border border-brand-line bg-white shadow-sm" aria-label="Listado de cotizaciones">
        <div className="border-b border-brand-line p-4 sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_170px_170px]">
            <label className="relative"><span className="sr-only">Buscar cotizaciones</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-brand-muted" aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 w-full rounded-xl border border-brand-line pl-9 pr-3 text-sm outline-none transition-shadow focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15" placeholder="Buscar código COT o cliente" /></label>
            <label className="text-xs font-semibold uppercase text-brand-muted"><span className="sr-only">Fecha desde</span><input type="date" value={fechaDesde} onChange={(event) => setFechaDesde(event.target.value)} className="h-11 w-full rounded-xl border border-brand-line px-3 text-sm font-normal text-brand-ink outline-none transition-shadow focus:border-brand-primary" aria-label="Fecha desde" /></label>
            <label className="text-xs font-semibold uppercase text-brand-muted"><span className="sr-only">Fecha hasta</span><input type="date" value={fechaHasta} min={fechaDesde} onChange={(event) => setFechaHasta(event.target.value)} className="h-11 w-full rounded-xl border border-brand-line px-3 text-sm font-normal text-brand-ink outline-none transition-shadow focus:border-brand-primary" aria-label="Fecha hasta" /></label>
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filtrar cotizaciones por estado">
            {STATUS_FILTERS.map((filter) => {
              const isSelected = status === filter.value;
              return (
                  <button
                    key={filter.value}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    title={filter.value === 'archived' ? `Archivadas manualmente o sin OT ni abonos con ${QUOTATION_ARCHIVE_DAYS} días desde su emisión` : undefined}
                  className={`relative min-h-10 whitespace-nowrap rounded-xl px-4 text-sm font-semibold transition-colors ${
                    isSelected ? 'text-white' : 'bg-brand-pale text-brand-muted hover:bg-brand-line'
                  }`}
                  onClick={() => setStatus(filter.value)}
                >
                  {isSelected && (
                    <motion.span
                      layoutId="quotationStatusPill"
                      className="absolute inset-0 rounded-xl bg-brand-primaryInk"
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    />
                  )}
                  <span className="relative z-10">{filter.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {(quotationsQuery.isError || excelMutation.isError || previewQuery.isError) && <div className="border-b border-brand-coral/30 bg-brand-coralPale px-4 py-3 text-sm text-brand-coralInk" role="alert">{getApiErrorMessage(quotationsQuery.error ?? excelMutation.error ?? previewQuery.error, 'No fue posible completar la operación.')}</div>}

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
        <div className="max-w-full">
          <table className="w-full table-fixed text-left text-sm max-xl:block [&_td]:break-words [&_td]:whitespace-normal [&_td]:px-2 [&_th]:px-2 [&_th]:whitespace-normal [&_th]:text-[11px] max-xl:[&_td]:block max-xl:[&_td]:border-none max-xl:[&_td]:py-2 max-xl:[&_td]:text-left max-xl:[&_td]:before:mb-1 max-xl:[&_td]:before:block max-xl:[&_td]:before:text-[10px] max-xl:[&_td]:before:font-semibold max-xl:[&_td]:before:uppercase max-xl:[&_td]:before:text-brand-muted max-xl:[&_td]:before:content-[attr(data-label)]">
            <colgroup className="max-xl:hidden">
              <col className="w-[4%]" /><col className="w-[13%]" /><col className="w-[23%]" />
              <col className="w-[11%]" /><col className="w-[9%]" /><col className="w-[10%]" />
              <col className="w-[9%]" /><col className="w-[10%]" /><col className="w-[11%]" />
            </colgroup>
            <thead className="bg-brand-line/40 text-[11px] uppercase text-brand-muted max-xl:hidden">
              <tr>
                <th className="px-4 py-4 font-semibold">N°</th>
                <th className="px-4 py-4 font-semibold">Código COT</th>
                <th className="px-4 py-4 font-semibold">Cliente</th>
                <th className="px-4 py-4 font-semibold">Estado pago</th>
                <th className="px-4 py-4 font-semibold">Emitida</th>
                <th className="px-4 py-4 text-right font-semibold">Total</th>
                <th className="px-4 py-4 text-right font-semibold">Pagado</th>
                <th className="px-4 py-4 text-right font-semibold">Saldo</th>
                <th className="px-4 py-4 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="max-xl:block">
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
                  <AnimatedTableRow key={quotation.id} delay={index * 0.02} enableHover={false} className={`border-b border-brand-line transition-colors last:border-0 max-xl:grid max-xl:grid-cols-2 max-xl:p-3 ${rowStyle}`}>
                    <td data-label="N°" className={`border-l-4 px-4 py-5 font-mono text-sm font-bold text-brand-muted ${status === 'archived' ? 'border-slate-300' : attention?.kind === 'linked' ? 'border-orange-400' : attention ? 'border-yellow-400' : 'border-transparent'}`}>{rowNumber}</td>
                    <td data-label="Código COT" className="px-4 py-5">
                      <Link to={`/quotations/${quotation.id}`} className="font-mono text-[15px] font-bold text-brand-primaryInk hover:underline">{quotation.codigo}</Link>
                      {quotation.workOrder && (
                        <Link to={`/work-orders/${quotation.workOrder.id}`} className="mt-1 block font-mono text-sm font-bold text-emerald-700 hover:underline">
                          {quotation.workOrder.codigo}
                        </Link>
                      )}
                      {quotation.asesor?.nombre && <span className="block text-xs text-brand-muted">{quotation.asesor.nombre}</span>}
                      {status === 'archived' ? <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-600"><Archive className="h-3 w-3 shrink-0" aria-hidden="true" />{quotation.archivedAt ? 'Archivada manualmente' : 'Vigencia vencida'}</span> : attention && <span className={`mt-1 block text-xs font-semibold ${attention.kind === 'linked' ? 'text-orange-800' : 'text-amber-800'}`}>{attention.kind === 'linked' ? `OT sin actividad: ${attention.days} días` : attention.kind === 'fading' ? `Se archivará en ${QUOTATION_ARCHIVE_DAYS - attention.days} días` : `Sin OT: ${attention.days} días`}</span>}
                    </td>
                    <td data-label="Cliente" className="px-4 py-5 max-xl:col-span-2">
                      <span className="block break-words text-sm font-semibold text-brand-ink">{quotation.client?.nombre ?? 'Sin cliente'}</span>
                      <span className="block text-xs text-brand-muted">{quotation.client?.rut ?? 'Sin identificación'}</span>
                      {quotation.vehicle?.patente && <span className="mt-1 inline-block rounded border border-brand-line bg-brand-pale px-1.5 py-0.5 font-mono text-xs font-bold text-brand-primaryInk">{quotation.vehicle.patente}</span>}
                    </td>
                    <td data-label="Estado pago" className="px-4 py-5"><QuotationStatusBadge status={quotation.estadoPago} /></td>
                    <td data-label="Emitida" className="px-4 py-5 text-xs text-brand-muted">{formatDate(quotation.createdAt)}</td>
                    <td data-label="Total" className="px-4 py-5 text-right text-sm font-semibold text-brand-ink">{formatClp(quotation.total)}</td>
                    <td data-label="Pagado" className="px-4 py-5 text-right text-brand-muted">{formatClp(quotation.pagado)}</td>
                    <td data-label="Saldo" className="px-4 py-5 text-right text-sm font-bold text-brand-primaryInk">{formatClp(balance)}</td>
                    <td data-label="Acciones" className="px-4 py-5 max-xl:col-span-2"><div className="flex flex-wrap items-center justify-end gap-1 max-xl:justify-start [&>button]:h-8 [&>button]:w-8 [&>button]:rounded-lg">
                      {canEdit && status !== 'archived' && quotation.workOrderId === null && Number(quotation.pagado) === 0 && quotation.estadoPago === 'por_pagar' && (
                        <button type="button" className="flex items-center justify-center text-brand-muted hover:bg-brand-pale hover:text-brand-primaryInk" title="Archivar cotización" aria-label={`Archivar ${quotation.codigo}`} onClick={() => { archiveMutation.reset(); setQuotationToArchive(quotation); }}>
                          <Archive className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                      {balance > 0 && (
                        <button
                          type="button"
                          onClick={() => setPaymentQuotation({ id: quotation.id, codigo: quotation.codigo, saldoPendiente: balance })}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-mintPale text-brand-mintInk ring-1 ring-inset ring-brand-line transition-all hover:bg-brand-mintPale active:scale-95"
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
                            className="flex h-10 w-10 items-center justify-center rounded-xl text-brand-muted/30"
                            aria-label={`Editar ${quotation.codigo} deshabilitado`}
                            title="Cotización pagada"
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="group flex h-10 w-10 items-center justify-center rounded-xl text-brand-muted hover:bg-brand-pale hover:text-brand-primary disabled:opacity-50"
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
                      {canConvert && quotation.workOrderId === null && <button type="button" className="group flex h-10 w-10 items-center justify-center rounded-xl text-brand-muted hover:bg-brand-mintPale hover:text-brand-mintInk" onClick={() => setQuotationToConvert(quotation)} aria-label={`Convertir ${quotation.codigo} a OT`} title="Convertir a OT"><AnimateIcon variant="spin" animateOnHover><Wrench className="h-4 w-4" aria-hidden="true" /></AnimateIcon></button>}
                      <button type="button" className="group flex h-10 w-10 items-center justify-center rounded-xl text-brand-muted hover:bg-brand-pale hover:text-brand-primary disabled:opacity-50" onClick={() => setPreviewQuotationId(quotation.id)} disabled={previewQuery.isPending && previewQuotationId === quotation.id} aria-label={`Vista previa PDF de ${quotation.codigo}`} title="Vista previa / Descargar PDF (mismo diseño)">
                        {previewQuery.isPending && previewQuotationId === quotation.id ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <AnimateIcon variant="bounce" animateOnHover><Download className="h-4 w-4" aria-hidden="true" /></AnimateIcon>}
                      </button>
                      <button type="button" className="group flex h-10 w-10 items-center justify-center rounded-xl bg-brand-pale text-brand-primaryInk hover:bg-brand-primaryHover hover:text-white" onClick={() => setDetailQuotationId(quotation.id)} aria-label={`Ver detalle de ${quotation.codigo}`} title="Ver detalle">
                        <AnimateIcon variant="hover-lift" animateOnHover>
                          <FileText className="h-4 w-4" aria-hidden="true" />
                        </AnimateIcon>
                      </button>
                    </div></td>
                  </AnimatedTableRow>
                );
              })}
            </tbody>
          </table>
        </div>
        {!quotationsQuery.isPending && quotationsQuery.data?.items.length === 0 && <div className="flex min-h-56 flex-col items-center justify-center px-4 text-center"><FileText className="h-10 w-10 text-brand-muted/40" aria-hidden="true" /><p className="mt-3 font-semibold text-brand-ink">{status === 'archived' ? 'No hay cotizaciones archivadas' : 'No se encontraron cotizaciones'}</p><p className="mt-1 text-sm text-brand-muted">Cambie los filtros o emita el primer presupuesto.</p></div>}
        <Pagination page={page} totalPages={quotationsQuery.data?.totalPages ?? 0} total={quotationsQuery.data?.total ?? 0} onPageChange={setPage} />
      </section>

      {quotationToConvert && <ConvertQuotationModal quotationId={quotationToConvert.id} codigo={quotationToConvert.codigo} notas={quotationToConvert.notas} onClose={() => setQuotationToConvert(null)} onConverted={(workOrderId) => navigate(`/work-orders/${workOrderId}`)} />}

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
          onConverted={(workOrderId) => navigate(`/work-orders/${workOrderId}`)}
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
