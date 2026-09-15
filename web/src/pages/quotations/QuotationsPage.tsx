import { FileSpreadsheet, FileText, LoaderCircle, Pencil, Plus, Search, WalletCards, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import Pagination from '../../components/common/Pagination';
import ConvertQuotationModal from '../../components/quotations/ConvertQuotationModal';
import QuotationStatusBadge from '../../components/quotations/QuotationStatusBadge';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useDownloadCommercialExcel } from '../../hooks/usePayments';
import { useQuotations } from '../../hooks/useQuotations';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp } from '../../lib/formatters';
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

const toDateInput = (date: Date): string => date.toISOString().slice(0, 10);

const firstDayOfMonth = (): string => {
  const now = new Date();
  return toDateInput(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
};

const QuotationSkeleton = () => (
  <>{Array.from({ length: 6 }, (_, index) => <tr key={index} className="border-b border-slate-100">{Array.from({ length: 9 }, (_, cell) => <td key={cell} className="px-3 py-4"><div className="h-4 animate-pulse rounded bg-slate-100" /></td>)}</tr>)}</>
);

export const QuotationsPage = () => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [fechaDesde, setFechaDesde] = useState(firstDayOfMonth);
  const [fechaHasta, setFechaHasta] = useState(() => toDateInput(new Date()));
  const [quotationToConvert, setQuotationToConvert] = useState<Quotation | null>(null);
  const debouncedSearch = useDebouncedValue(search, 350);
  const quotationsQuery = useQuotations({
    page,
    pageSize: 20,
    search: debouncedSearch || undefined,
    estadoPago: status === 'all' ? undefined : status,
    fechaDesde,
    fechaHasta,
  });
  const excelMutation = useDownloadCommercialExcel();
  const canCreate = Boolean(user && hasUserPermission(user, 'comercial', 'create'));
  const canEdit = Boolean(user && hasUserPermission(user, 'comercial', 'update'));
  const canConvert = Boolean(user && (hasUserPermission(user, 'comercial', 'update') || hasUserPermission(user, 'taller', 'create')));
  const canExport = Boolean(user && hasUserPermission(user, 'comercial', 'export'));

  useEffect(() => setPage(1), [debouncedSearch, fechaDesde, fechaHasta, status]);

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div><p className="text-sm font-medium text-slate-500">Gestión comercial</p><h1 className="mt-1 text-2xl font-bold text-brand-blue sm:text-3xl">Comercial - Cotizaciones</h1></div>
        <div className="flex flex-wrap gap-2">
          {canExport && <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg border border-brand-blue bg-white px-4 text-sm font-semibold text-brand-blue hover:bg-brand-light disabled:opacity-60" onClick={() => excelMutation.mutate({ fechaDesde, fechaHasta, estadoPago: status === 'all' ? undefined : status })} disabled={excelMutation.isPending}>{excelMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />}Exportar Excel</button>}
          {canCreate && <Link to="/quotations/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-yellow px-4 text-sm font-bold text-brand-dark hover:bg-yellow-400"><Plus className="h-4 w-4" aria-hidden="true" /> Nueva Cotización</Link>}
        </div>
      </header>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white" aria-label="Listado de cotizaciones">
        <div className="border-b border-slate-200 p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_170px_170px]">
            <label className="relative"><span className="sr-only">Buscar cotizaciones</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15" placeholder="Buscar código COT o cliente" /></label>
            <label className="text-xs font-semibold uppercase text-slate-500"><span className="sr-only">Fecha desde</span><input type="date" value={fechaDesde} onChange={(event) => setFechaDesde(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal text-slate-700 outline-none focus:border-brand-blue" aria-label="Fecha desde" /></label>
            <label className="text-xs font-semibold uppercase text-slate-500"><span className="sr-only">Fecha hasta</span><input type="date" value={fechaHasta} min={fechaDesde} onChange={(event) => setFechaHasta(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal text-slate-700 outline-none focus:border-brand-blue" aria-label="Fecha hasta" /></label>
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filtrar cotizaciones por estado">{STATUS_FILTERS.map((filter) => <button key={filter.value} type="button" role="tab" aria-selected={status === filter.value} className={`min-h-9 whitespace-nowrap rounded-lg px-3 text-sm font-semibold ${status === filter.value ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`} onClick={() => setStatus(filter.value)}>{filter.label}</button>)}</div>
        </div>

        {(quotationsQuery.isError || excelMutation.isError) && <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{getApiErrorMessage(quotationsQuery.error ?? excelMutation.error, 'No fue posible completar la operación.')}</div>}

        <div className="overflow-x-auto"><table className="w-full min-w-[940px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3 font-semibold">Código COT</th><th className="px-3 py-3 font-semibold">Cliente</th><th className="px-3 py-3 font-semibold">Vehículo</th><th className="px-3 py-3 font-semibold">OT asociada</th><th className="px-3 py-3 font-semibold">Estado pago</th><th className="px-3 py-3 text-right font-semibold">Total</th><th className="px-3 py-3 text-right font-semibold">Pagado</th><th className="px-3 py-3 text-right font-semibold">Saldo</th><th className="px-3 py-3 text-right font-semibold">Acciones</th></tr></thead><tbody>
          {quotationsQuery.isPending ? <QuotationSkeleton /> : quotationsQuery.data?.items.map((quotation) => {
            const balance = Math.max(0, Number(quotation.total) - Number(quotation.pagado));
            return <tr key={quotation.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"><td className="px-3 py-3"><Link to={`/quotations/${quotation.id}`} className="font-mono font-bold text-brand-blue hover:underline">{quotation.codigo}</Link></td><td className="max-w-48 px-3 py-3"><span className="block truncate font-semibold text-slate-800">{quotation.client?.nombre ?? 'Sin cliente'}</span><span className="block text-xs text-slate-500">{quotation.client?.rut ?? 'Sin identificación'}</span></td><td className="px-3 py-3"><span className="font-mono font-bold text-slate-800">{quotation.vehicle?.patente ?? 'Sin vehículo'}</span><span className="block text-xs text-slate-500">{[quotation.vehicle?.marca, quotation.vehicle?.modelo].filter(Boolean).join(' ') || 'Sin datos'}</span></td><td className="px-3 py-3">{quotation.workOrder ? <Link to={`/work-orders/${quotation.workOrder.id}`} className="font-mono font-semibold text-brand-blue hover:underline">{quotation.workOrder.codigo}</Link> : <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">COT sin OT</span>}</td><td className="px-3 py-3"><QuotationStatusBadge status={quotation.estadoPago} /></td><td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-slate-800">{formatClp(quotation.total)}</td><td className="whitespace-nowrap px-3 py-3 text-right text-slate-600">{formatClp(quotation.pagado)}</td><td className="whitespace-nowrap px-3 py-3 text-right font-bold text-brand-blue">{formatClp(balance)}</td><td className="px-3 py-3"><div className="flex items-center justify-end gap-1"><Link to={`/quotations/${quotation.id}?payment=true`} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-blue-50 hover:text-brand-blue" aria-label={`Ver y registrar pago de ${quotation.codigo}`} title="Ver detalle y pagos"><WalletCards className="h-4 w-4" aria-hidden="true" /></Link>{canEdit && (quotation.estadoPago === 'total' ? <button type="button" disabled className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300" aria-label={`Editar ${quotation.codigo} deshabilitado`} title="Cotización pagada"><Pencil className="h-4 w-4" aria-hidden="true" /></button> : <Link to={`/quotations/${quotation.id}?edit=true`} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-amber-50 hover:text-amber-700" aria-label={`Editar ${quotation.codigo}`} title="Editar"><Pencil className="h-4 w-4" aria-hidden="true" /></Link>)}{canConvert && quotation.workOrderId === null && <button type="button" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-emerald-50 hover:text-emerald-700" onClick={() => setQuotationToConvert(quotation)} aria-label={`Convertir ${quotation.codigo} a OT`} title="Convertir a OT"><Wrench className="h-4 w-4" aria-hidden="true" /></button>}<Link to={`/quotations/${quotation.id}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label={`Ver detalle de ${quotation.codigo}`} title="Ver detalle"><FileText className="h-4 w-4" aria-hidden="true" /></Link></div></td></tr>;
          })}
        </tbody></table></div>

        {!quotationsQuery.isPending && quotationsQuery.data?.items.length === 0 && <div className="flex min-h-56 flex-col items-center justify-center px-4 text-center"><FileText className="h-10 w-10 text-slate-300" aria-hidden="true" /><p className="mt-3 font-semibold text-slate-700">No se encontraron cotizaciones</p><p className="mt-1 text-sm text-slate-500">Cambie los filtros o emita el primer presupuesto.</p></div>}
        <Pagination page={page} totalPages={quotationsQuery.data?.totalPages ?? 0} total={quotationsQuery.data?.total ?? 0} onPageChange={setPage} />
      </section>

      {quotationToConvert && <ConvertQuotationModal quotationId={quotationToConvert.id} codigo={quotationToConvert.codigo} notas={quotationToConvert.notas} onClose={() => setQuotationToConvert(null)} onConverted={(workOrderId) => navigate(`/work-orders/${workOrderId}`)} />}
    </div>
  );
};

export default QuotationsPage;
