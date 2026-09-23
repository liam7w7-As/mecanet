import {
  ArrowRight,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  WalletCards,
  Wrench,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { AnimateIcon, AnimatedCard, Stagger, StaggerItem } from '../../components/animate-ui';
import Pagination from '../../components/common/Pagination';
import PdfPreviewModal from '../../components/common/PdfPreviewModal';
import ConvertQuotationModal from '../../components/quotations/ConvertQuotationModal';
import PaymentFormModal from '../../components/quotations/PaymentFormModal';
import QuotationDetailModal from '../../components/quotations/QuotationDetailModal';
import QuotationStatusBadge from '../../components/quotations/QuotationStatusBadge';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useDownloadCommercialExcel } from '../../hooks/usePayments';
import { useQuotation, useQuotations } from '../../hooks/useQuotations';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDate } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';

import type { Quotation } from '../../types/entities';
import type { QuotationStatus } from '@unithor/shared';

type StatusFilter = QuotationStatus | 'all';

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'por_pagar', label: 'Por pagar' },
  { value: 'parcial', label: 'Abono parcial' },
  { value: 'total', label: 'Pagadas total' },
  { value: 'por_verificar', label: 'Por verificar' },
];

const STATUS_CONFIG: Record<
  QuotationStatus,
  {
    topBar: string;
    borderHover: string;
    progressGradient: string;
  }
> = {
  por_pagar: {
    topBar: 'bg-gradient-to-r from-amber-500 to-amber-400',
    borderHover: 'hover:border-amber-300 hover:shadow-amber-500/10',
    progressGradient: 'bg-gradient-to-r from-amber-500 to-amber-400',
  },
  parcial: {
    topBar: 'bg-gradient-to-r from-brand-blue to-cyan-500',
    borderHover: 'hover:border-blue-300 hover:shadow-blue-500/10',
    progressGradient: 'bg-gradient-to-r from-brand-blue to-cyan-500',
  },
  total: {
    topBar: 'bg-gradient-to-r from-emerald-500 to-teal-400',
    borderHover: 'hover:border-emerald-300 hover:shadow-emerald-500/10',
    progressGradient: 'bg-gradient-to-r from-emerald-500 to-teal-400',
  },
  por_verificar: {
    topBar: 'bg-gradient-to-r from-purple-500 to-pink-500',
    borderHover: 'hover:border-purple-300 hover:shadow-purple-500/10',
    progressGradient: 'bg-gradient-to-r from-purple-500 to-pink-500',
  },
  ot_finalizado: {
    topBar: 'bg-slate-700',
    borderHover: 'hover:border-slate-400',
    progressGradient: 'bg-slate-600',
  },
};

const getInitials = (name?: string | null): string => {
  if (!name) return 'CL';
  const clean = name.trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'CL';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

const toDateInput = (date: Date): string => date.toISOString().slice(0, 10);

const firstDayOfMonth = (): string => {
  const now = new Date();
  return toDateInput(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
};

const QuotationCardSkeleton = () => (
  <>
    {Array.from({ length: 6 }, (_, index) => (
      <div key={index} className="flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
        <div>
          <div className="flex items-center justify-between gap-3">
            <div className="h-4 w-28 animate-pulse rounded bg-slate-100" />
            <div className="h-5 w-20 animate-pulse rounded-full bg-slate-100" />
          </div>
          <div className="mt-1.5 h-3 w-36 animate-pulse rounded bg-slate-100" />
          <div className="mt-3 h-11 animate-pulse rounded-lg bg-slate-100" />
          <div className="mt-3 space-y-1.5">
            <div className="flex justify-between">
              <div className="h-3 w-16 animate-pulse rounded bg-slate-100" />
              <div className="h-3 w-16 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="h-1.5 w-full animate-pulse rounded-full bg-slate-100" />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
          <div className="h-7 w-18 animate-pulse rounded-lg bg-slate-100" />
          <div className="flex gap-1">
            <div className="h-7 w-7 animate-pulse rounded-md bg-slate-100" />
            <div className="h-7 w-7 animate-pulse rounded-md bg-slate-100" />
            <div className="h-7 w-12 animate-pulse rounded-md bg-slate-100" />
          </div>
        </div>
      </div>
    ))}
  </>
);

const QuotationCard = ({
  quotation,
  balance,
  paidPercent,
  canEdit,
  canConvert,
  previewPending,
  onConvert,
  onPreview,
  onPay,
  onViewDetail,
}: {
  quotation: Quotation;
  balance: number;
  paidPercent: number;
  canEdit: boolean;
  canConvert: boolean;
  previewPending: boolean;
  onConvert: () => void;
  onPreview: () => void;
  onPay: () => void;
  onViewDetail: () => void;
}) => {
  const config = STATUS_CONFIG[quotation.estadoPago] ?? STATUS_CONFIG.por_pagar;
  const isFullyPaid = quotation.estadoPago === 'total' || (paidPercent === 100 && balance === 0);
  const hasWorkOrder = Boolean(quotation.workOrder);

  return (
    <AnimatedCard
      className={`group relative flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${config.borderHover}`}
    >
      {/* Top status accent line */}
      <div className={`absolute inset-x-0 top-0 h-1 ${config.topBar}`} />

      <div>
        {/* Header: Código, Status & OT Badge */}
        <div className="flex items-start justify-between gap-2 pt-0.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onViewDetail}
                className="group/link inline-flex items-center gap-1 font-mono text-base font-bold tracking-tight text-brand-blue hover:text-brand-dark transition-colors text-left"
              >
                <span>{quotation.codigo}</span>
                <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover/link:opacity-100" aria-hidden="true" />
              </button>
              {hasWorkOrder ? (
                <Link
                  to={`/work-orders/${quotation.workOrder!.id}`}
                  className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100 transition-colors"
                  title={`OT asociada: ${quotation.workOrder!.codigo}`}
                >
                  <Wrench className="h-2.5 w-2.5" aria-hidden="true" />
                  <span>OT · <span className="font-mono">{quotation.workOrder!.codigo}</span></span>
                </Link>
              ) : null}
            </div>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
              <Calendar className="h-3 w-3 text-slate-400" aria-hidden="true" />
              <span>{formatDate(quotation.createdAt)}</span>
              {quotation.asesor?.nombre && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="truncate max-w-[130px]" title={quotation.asesor.nombre}>
                    {quotation.asesor.nombre}
                  </span>
                </>
              )}
            </p>
          </div>
          <QuotationStatusBadge status={quotation.estadoPago} />
        </div>

        {/* Compact & Clean Client + Vehicle Row */}
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50/75 p-2 text-xs">
          {/* Client info */}
          <div className="min-w-0 border-r border-slate-200/60 pr-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-blue/10 text-[9px] font-black text-brand-blue">
                {getInitials(quotation.client?.nombre)}
              </span>
              <span className="truncate font-semibold text-slate-800" title={quotation.client?.nombre ?? 'Sin cliente'}>
                {quotation.client?.nombre ?? 'Sin cliente'}
              </span>
            </div>
            <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500 pl-6.5">
              {quotation.client?.rut || quotation.client?.telefono || 'Sin identificación'}
            </p>
          </div>

          {/* Vehicle info */}
          <div className="min-w-0 pl-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="truncate font-semibold text-slate-800" title={[quotation.vehicle?.marca, quotation.vehicle?.modelo].filter(Boolean).join(' ') || 'Sin datos'}>
                {[quotation.vehicle?.marca, quotation.vehicle?.modelo].filter(Boolean).join(' ') || 'Sin vehículo'}
              </span>
              {quotation.vehicle?.patente ? (
                <span className="shrink-0 rounded bg-brand-yellow px-1.5 py-0.5 font-mono text-[10px] font-extrabold text-brand-dark shadow-2xs">
                  {quotation.vehicle.patente}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-[11px] text-slate-500">
              {quotation.items && quotation.items.length > 0
                ? `${quotation.items.length} ${quotation.items.length === 1 ? 'ítem' : 'ítems'}`
                : (quotation.vehicle?.patente ? 'En taller' : 'Sin patente')}
            </p>
          </div>
        </div>

        {/* Dynamic Financial Summary & Progress */}
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-xs">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total </span>
              <span className="font-bold text-slate-900">{formatClp(quotation.total)}</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-blue">Saldo </span>
              <span className={`font-bold ${balance === 0 ? 'text-emerald-600' : 'text-brand-blue'}`}>
                {formatClp(balance)}
              </span>
            </div>
          </div>

          {/* Slim dynamic progress bar */}
          <div className="mt-1.5">
            <div
              className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={paidPercent}
              aria-label={`Avance de pago de ${quotation.codigo}`}
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${paidPercent}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className={`h-full rounded-full ${config.progressGradient}`}
              />
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
              <span>{isFullyPaid ? 'Pagado al 100%' : `Pagado: ${formatClp(quotation.pagado)}`}</span>
              <span className="font-mono font-medium text-slate-600">{paidPercent}%</span>
            </div>
          </div>
        </div>

        {/* Quick note if present */}
        {quotation.notas && (
          <p className="mt-2 truncate text-[11px] italic text-slate-400" title={quotation.notas}>
            <span className="font-medium not-italic text-slate-500">Nota:</span> {quotation.notas}
          </p>
        )}
      </div>

      {/* Dynamic Action Toolbar */}
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
        {/* Left: Quick Payment Action */}
        <div>
          {!isFullyPaid ? (
            <button
              type="button"
              onClick={onPay}
              className="group/pay inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200/80 transition-all hover:bg-emerald-100 active:scale-95"
              aria-label={`Abonar a ${quotation.codigo}`}
              title="Registrar abono"
            >
              <AnimateIcon variant="bounce" animateOnHover size={13}>
                <WalletCards className="h-3.5 w-3.5" aria-hidden="true" />
              </AnimateIcon>
              <span>Abonar</span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Al día
            </span>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1">
          {/* Convert to OT button if not linked */}
          {canConvert && quotation.workOrderId === null && (
            <button
              type="button"
              className="group/conv flex h-7 w-7 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 transition-colors hover:bg-emerald-100 hover:text-emerald-800"
              onClick={onConvert}
              aria-label={`Convertir ${quotation.codigo} a OT`}
              title="Convertir a Orden de Trabajo"
            >
              <AnimateIcon variant="spin" animateOnHover size={13}>
                <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
              </AnimateIcon>
            </button>
          )}

          {/* Edit */}
          {canEdit && (
            quotation.estadoPago === 'total' ? (
              <button
                type="button"
                disabled
                className="flex h-7 w-7 cursor-not-allowed items-center justify-center rounded-md text-slate-300"
                aria-label={`Editar ${quotation.codigo} deshabilitado`}
                title="Cotización pagada (no editable)"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : (
              <Link
                to={`/quotations/${quotation.id}?edit=true`}
                className="group flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-amber-50 hover:text-amber-700"
                aria-label={`Editar ${quotation.codigo}`}
                title="Editar cotización"
              >
                <AnimateIcon variant="wiggle" animateOnHover size={13}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </AnimateIcon>
              </Link>
            )
          )}

          {/* Preview / Download PDF */}
          <button
            type="button"
            className="group flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-blue-50 hover:text-brand-blue disabled:opacity-50"
            onClick={onPreview}
            disabled={previewPending}
            aria-label={`Vista previa PDF de ${quotation.codigo}`}
            title="Vista previa / Descargar PDF"
          >
            {previewPending ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin text-brand-blue" aria-hidden="true" />
            ) : (
              <AnimateIcon variant="bounce" animateOnHover size={13}>
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
              </AnimateIcon>
            )}
          </button>

          {/* Primary CTA: Detail Action */}
          <button
            type="button"
            onClick={onViewDetail}
            className="group/cta ml-0.5 inline-flex h-7 items-center gap-1 rounded-md bg-brand-blue px-2 text-xs font-semibold text-white shadow-2xs transition-all hover:bg-brand-dark active:scale-95"
            aria-label={`Ver detalle de ${quotation.codigo}`}
            title="Ver detalle completo"
          >
            <span>Ver</span>
            <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover/cta:translate-x-0.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </AnimatedCard>
  );
};

export const QuotationsPage = () => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [fechaDesde, setFechaDesde] = useState(firstDayOfMonth);
  const [fechaHasta, setFechaHasta] = useState(() => toDateInput(new Date()));
  const [quotationToConvert, setQuotationToConvert] = useState<Quotation | null>(null);
  const [paymentQuotation, setPaymentQuotation] = useState<{ id: number; codigo: string; saldoPendiente: number } | null>(null);
  const [detailQuotationId, setDetailQuotationId] = useState<number | null>(null);
  const [previewQuotationId, setPreviewQuotationId] = useState<number | null>(null);
  const debouncedSearch = useDebouncedValue(search, 350);
  const quotationsQuery = useQuotations({
    page,
    pageSize: 12,
    search: debouncedSearch || undefined,
    estadoPago: status === 'all' ? undefined : status,
    fechaDesde,
    fechaHasta,
  });
  const excelMutation = useDownloadCommercialExcel();
  // Detalle completo para la vista previa: la lista no trae ítems,
  // el diseño de vista previa necesita ítems y totales completos.
  const previewQuery = useQuotation(previewQuotationId ?? 0);
  const canCreate = Boolean(user && hasUserPermission(user, 'comercial', 'create'));
  const canEdit = Boolean(user && hasUserPermission(user, 'comercial', 'update'));
  const canConvert = Boolean(user && (hasUserPermission(user, 'comercial', 'update') || hasUserPermission(user, 'taller', 'create')));
  const canExport = Boolean(user && (hasUserPermission(user, 'comercial', 'export') || hasUserPermission(user, 'finanzas', 'export')));

  useEffect(() => setPage(1), [debouncedSearch, fechaDesde, fechaHasta, status]);

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div><p className="text-sm font-medium text-slate-500">Gestión comercial</p><h1 className="mt-1 text-2xl font-bold text-brand-blue sm:text-3xl">Comercial - Cotizaciones</h1></div>
        <div className="flex flex-wrap gap-2">
          {canExport && (
            <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg border border-brand-blue bg-white px-4 text-sm font-semibold text-brand-blue shadow-sm transition-all hover:bg-brand-light hover:shadow disabled:opacity-60" onClick={() => excelMutation.mutate({ fechaDesde, fechaHasta, estadoPago: status === 'all' ? undefined : status })} disabled={excelMutation.isPending}>
              {excelMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <AnimateIcon variant="bounce" animateOnHover><FileSpreadsheet className="h-4 w-4" aria-hidden="true" /></AnimateIcon>}
              Exportar Excel
            </button>
          )}
          {canCreate && (
            <Link to="/quotations/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-yellow px-4 text-sm font-bold text-brand-dark shadow-sm transition-all hover:bg-yellow-400 hover:shadow-md">
              <AnimateIcon variant="spin" animateOnHover>
                <Plus className="h-4 w-4" aria-hidden="true" />
              </AnimateIcon>
              Nueva Cotización
            </Link>
          )}
        </div>
      </header>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" aria-label="Listado de cotizaciones">
        <div className="border-b border-slate-200 p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_170px_170px]">
            <label className="relative"><span className="sr-only">Buscar cotizaciones</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm outline-none transition-shadow focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15" placeholder="Buscar código COT o cliente" /></label>
            <label className="text-xs font-semibold uppercase text-slate-500"><span className="sr-only">Fecha desde</span><input type="date" value={fechaDesde} onChange={(event) => setFechaDesde(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal text-slate-700 outline-none transition-shadow focus:border-brand-blue" aria-label="Fecha desde" /></label>
            <label className="text-xs font-semibold uppercase text-slate-500"><span className="sr-only">Fecha hasta</span><input type="date" value={fechaHasta} min={fechaDesde} onChange={(event) => setFechaHasta(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal text-slate-700 outline-none transition-shadow focus:border-brand-blue" aria-label="Fecha hasta" /></label>
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
                  className={`relative min-h-9 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors ${isSelected ? 'text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  onClick={() => setStatus(filter.value)}
                >
                  {isSelected && (
                    <motion.span
                      layoutId="quotationStatusPill"
                      className="absolute inset-0 rounded-lg bg-brand-blue"
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    />
                  )}
                  <span className="relative z-10">{filter.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {(quotationsQuery.isError || excelMutation.isError || previewQuery.isError) && <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{getApiErrorMessage(quotationsQuery.error ?? excelMutation.error ?? previewQuery.error, 'No fue posible completar la operación.')}</div>}

        <div className="bg-slate-50/60 p-4">
          {quotationsQuery.isPending ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <QuotationCardSkeleton />
            </div>
          ) : (quotationsQuery.data?.items.length ?? 0) === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center px-4 text-center">
              <FileText className="h-10 w-10 text-slate-300" aria-hidden="true" />
              <p className="mt-3 font-semibold text-slate-700">No se encontraron cotizaciones</p>
              <p className="mt-1 text-sm text-slate-500">Cambie los filtros o emita el primer presupuesto.</p>
            </div>
          ) : (
            <Stagger className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" stagger={0.05}>
              {quotationsQuery.data?.items.map((quotation) => {
                const total = Number(quotation.total);
                const balance = Math.max(0, total - Number(quotation.pagado));
                const paidPercent = total > 0 ? Math.min(100, Math.round((Number(quotation.pagado) / total) * 100)) : 0;
                return (
                  <StaggerItem key={quotation.id}>
                    <QuotationCard
                      quotation={quotation}
                      balance={balance}
                      paidPercent={paidPercent}
                      canEdit={canEdit}
                      canConvert={canConvert}
                      previewPending={previewQuery.isPending && previewQuotationId === quotation.id}
                      onConvert={() => setQuotationToConvert(quotation)}
                      onPreview={() => setPreviewQuotationId(quotation.id)}
                      onPay={() => setPaymentQuotation({ id: quotation.id, codigo: quotation.codigo, saldoPendiente: balance })}
                      onViewDetail={() => setDetailQuotationId(quotation.id)}
                    />
                  </StaggerItem>
                );
              })}
            </Stagger>
          )}
        </div>

        <Pagination page={page} totalPages={quotationsQuery.data?.totalPages ?? 0} total={quotationsQuery.data?.total ?? 0} onPageChange={setPage} />
      </section>

      {quotationToConvert && <ConvertQuotationModal quotationId={quotationToConvert.id} codigo={quotationToConvert.codigo} notas={quotationToConvert.notas} onClose={() => setQuotationToConvert(null)} onConverted={(workOrderId) => navigate(`/work-orders/${workOrderId}`)} />}

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
