import { CATALOG_TYPES, PAYMENT_METHODS, QUOTATION_STATUS, STOCK_MOVEMENT_TYPES, WORK_ORDER_STATUS } from '@unithor/shared';
import { Download, FileText, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useCatalogItems } from '../../hooks/useCatalog';
import { useClients } from '../../hooks/useClients';
import { useFinancialAnalytics } from '../../hooks/useFinance';
import { useQuotations } from '../../hooks/useQuotations';
import { useReportDownload } from '../../hooks/useReports';
import { useRoles, useUsers } from '../../hooks/useUsers';
import { useVehicles } from '../../hooks/useVehicles';
import { useStockMovements, useWarehouses } from '../../hooks/useWarehouses';
import { useMechanics, useWorkOrders } from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDate, formatDateTime } from '../../lib/formatters';

import type { CatalogType, FinancialReportFilters, PaymentMethod, QuotationStatus, StockMovementType, WorkOrderStatus } from '@unithor/shared';
import type { Dispatch, SetStateAction } from 'react';

export interface ReportPanelProps {
  from: string;
  to: string;
  search: string;
  searchValue: string;
  setSearch: Dispatch<SetStateAction<string>>;
  params: URLSearchParams;
  setFilter: (key: string, value: string) => void;
}

const label = (value: string): string =>
  value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());

const DateFilters = ({ from, to, setFilter }: Pick<ReportPanelProps, 'from' | 'to' | 'setFilter'>) => (
  <div className="grid gap-2 sm:grid-cols-2">
    <label className="text-xs font-semibold text-brand-muted">Desde
      <input type="date" aria-label="Fecha desde" value={from} max={to} onChange={(event) => setFilter('from', event.target.value)} className="mt-1 h-10 w-full rounded-md border border-brand-line px-3 text-sm text-brand-ink" />
    </label>
    <label className="text-xs font-semibold text-brand-muted">Hasta
      <input type="date" aria-label="Fecha hasta" value={to} min={from} onChange={(event) => setFilter('to', event.target.value)} className="mt-1 h-10 w-full rounded-md border border-brand-line px-3 text-sm text-brand-ink" />
    </label>
  </div>
);

const SearchFilter = ({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) => (
  <label className="relative block min-w-0"><span className="sr-only">Buscar</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-brand-muted" aria-hidden="true" /><input aria-label="Buscar" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-10 w-full rounded-md border border-brand-line pl-9 pr-3 text-sm text-brand-ink" /></label>
);

const PanelHeader = ({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-line pb-3">
    <div className="min-w-0">
      <h2 className="text-lg font-bold text-brand-primaryInk">{title}</h2>
      {description && <p className="mt-1 text-sm text-brand-muted">{description}</p>}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      {action}
    </div>
  </div>
);

const Empty = () => <p className="py-8 text-center text-sm text-brand-muted">Sin registros para los filtros seleccionados.</p>;
const QueryError = ({ error }: { error: unknown }) => <p role="alert" className="rounded-md bg-brand-coralPale px-4 py-3 text-sm text-brand-coralInk">{getApiErrorMessage(error, 'No se pudieron cargar los datos.')}</p>;

export const FinanceReportPanel = ({ from, to, params, setFilter, canExport }: ReportPanelProps & { canExport: boolean }) => {
  const rawGrouping = params.get('financeGrouping');
  const agruparPor: FinancialReportFilters['agruparPor'] = rawGrouping === 'semana' || rawGrouping === 'mes' ? rawGrouping : 'dia';
  const rawStatus = params.get('financeStatus');
  const estadoPago = QUOTATION_STATUS.find((status) => status === rawStatus) as QuotationStatus | undefined;
  const rawMethod = params.get('financeMethod');
  const metodo = PAYMENT_METHODS.find((method) => method === rawMethod) as PaymentMethod | undefined;
  const asesorId = Number(params.get('financeAdvisor')) || undefined;
  const clientId = Number(params.get('financeClient')) || undefined;
  const comparar = params.get('financeCompare') !== 'false';
  const validRange = from <= to;
  const filters: FinancialReportFilters = {
    fechaDesde: from,
    fechaHasta: to,
    agruparPor,
    asesorId,
    clientId,
    estadoPago,
    metodo,
    comparar,
  };
  const analytics = useFinancialAnalytics(filters);
  const report = useReportDownload();
  const data = analytics.data;

  return <section className="min-w-0 space-y-4" aria-label="Reporte financiero">
    <PanelHeader
      title="Informe financiero ejecutivo"
      description="Define el alcance, revisa la muestra tabular y genera el documento final."
      action={canExport && <>
        <button type="button" className="secondary-button" disabled={!validRange || report.isPending} onClick={() => report.openPdf('finance', filters)}><FileText className="h-4 w-4" aria-hidden="true" />Abrir PDF</button>
        <button type="button" className="primary-button" disabled={!validRange || report.isPending} onClick={() => report.downloadExcel('finance', filters)}><Download className="h-4 w-4" aria-hidden="true" />Excel</button>
      </>}
    />
    <div className="grid gap-3 rounded-lg border border-brand-line bg-brand-light p-4 md:grid-cols-2 xl:grid-cols-6">
      <div className="md:col-span-2"><DateFilters from={from} to={to} setFilter={setFilter} /></div>
      <label className="text-xs font-semibold text-brand-muted">Agrupar<select aria-label="Agrupar finanzas" value={agruparPor} onChange={(event) => setFilter('financeGrouping', event.target.value)} className="mt-1 h-10 w-full rounded-md border border-brand-line bg-white px-3 text-sm text-brand-ink"><option value="dia">Por día</option><option value="semana">Por semana</option><option value="mes">Por mes</option></select></label>
      <label className="text-xs font-semibold text-brand-muted">Vendedor<select aria-label="Vendedor financiero" value={asesorId ?? ''} onChange={(event) => setFilter('financeAdvisor', event.target.value)} className="mt-1 h-10 w-full rounded-md border border-brand-line bg-white px-3 text-sm text-brand-ink"><option value="">Todos</option>{data?.filterOptions.advisors.map((advisor) => <option key={advisor.id} value={advisor.id}>{advisor.nombre}</option>)}</select></label>
      <label className="text-xs font-semibold text-brand-muted">Cliente<select aria-label="Cliente financiero" value={clientId ?? ''} onChange={(event) => setFilter('financeClient', event.target.value)} className="mt-1 h-10 w-full rounded-md border border-brand-line bg-white px-3 text-sm text-brand-ink"><option value="">Todos</option>{data?.filterOptions.clients.map((client) => <option key={client.id} value={client.id}>{client.nombre}</option>)}</select></label>
      <label className="text-xs font-semibold text-brand-muted">Estado de pago<select aria-label="Estado financiero" value={estadoPago ?? ''} onChange={(event) => setFilter('financeStatus', event.target.value)} className="mt-1 h-10 w-full rounded-md border border-brand-line bg-white px-3 text-sm text-brand-ink"><option value="">Todos</option>{QUOTATION_STATUS.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></label>
      <label className="text-xs font-semibold text-brand-muted">Método de pago<select aria-label="Método financiero" value={metodo ?? ''} onChange={(event) => setFilter('financeMethod', event.target.value)} className="mt-1 h-10 w-full rounded-md border border-brand-line bg-white px-3 text-sm text-brand-ink"><option value="">Todos</option>{PAYMENT_METHODS.map((method) => <option key={method} value={method}>{label(method)}</option>)}</select></label>
      <label className="flex h-10 items-center gap-2 self-end text-sm font-semibold text-brand-ink"><input type="checkbox" checked={comparar} onChange={(event) => setFilter('financeCompare', String(event.target.checked))} className="h-4 w-4 accent-brand-primary" />Comparar período</label>
    </div>
    {!validRange && <p role="alert" className="text-sm text-brand-coralInk">La fecha desde debe ser anterior o igual a la fecha hasta.</p>}
    {(analytics.isError || report.isError) && <QueryError error={analytics.error ?? report.error} />}
    {analytics.isPending ? <div role="status" className="h-52 animate-pulse rounded-lg bg-brand-line/40" aria-label="Cargando reporte financiero" /> : data && <>
      <div className="overflow-x-auto rounded-lg border border-brand-line bg-white"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-brand-primaryInk text-xs uppercase text-white"><tr><th className="px-4 py-3">Ventas</th><th className="px-4 py-3">Recaudado</th><th className="px-4 py-3">Egresos</th><th className="px-4 py-3">Flujo neto</th><th className="px-4 py-3">Por cobrar</th><th className="px-4 py-3">Ticket promedio</th></tr></thead><tbody><tr className="font-bold text-brand-primaryInk"><td className="px-4 py-3">{formatClp(data.kpis.grossSales)}</td><td className="px-4 py-3">{formatClp(data.kpis.collected)}</td><td className="px-4 py-3">{formatClp(data.kpis.expenses)}</td><td className="px-4 py-3">{formatClp(data.kpis.netCash)}</td><td className="px-4 py-3">{formatClp(data.kpis.receivable)}</td><td className="px-4 py-3">{formatClp(data.kpis.averageTicket)}</td></tr></tbody></table></div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="overflow-x-auto rounded-lg border border-brand-line bg-white"><div className="border-b border-brand-line px-4 py-3"><h3 className="font-bold text-brand-primaryInk">Vista previa por vendedor</h3></div><table className="w-full min-w-[480px] text-left text-sm"><thead className="bg-brand-line/40 text-xs uppercase text-brand-muted"><tr><th className="px-4 py-2.5">Vendedor</th><th className="px-3 py-2.5 text-right">COT</th><th className="px-4 py-2.5 text-right">Venta</th><th className="px-4 py-2.5 text-right">Cobrado</th></tr></thead><tbody className="divide-y divide-brand-line">{data.topSellers.slice(0, 8).map((seller) => <tr key={seller.id ?? seller.nombre}><td className="px-4 py-2.5 font-semibold">{seller.nombre}</td><td className="px-3 py-2.5 text-right">{seller.quotationCount}</td><td className="px-4 py-2.5 text-right">{formatClp(seller.grossSales)}</td><td className="px-4 py-2.5 text-right">{formatClp(seller.collected)}</td></tr>)}</tbody></table>{data.topSellers.length === 0 && <Empty />}</div>
        <div className="overflow-x-auto rounded-lg border border-brand-line bg-white"><div className="border-b border-brand-line px-4 py-3"><h3 className="font-bold text-brand-primaryInk">Vista previa de productos y servicios</h3></div><table className="w-full min-w-[480px] text-left text-sm"><thead className="bg-brand-line/40 text-xs uppercase text-brand-muted"><tr><th className="px-4 py-2.5">Ítem</th><th className="px-3 py-2.5">Tipo</th><th className="px-3 py-2.5 text-right">Cantidad</th><th className="px-4 py-2.5 text-right">Venta</th></tr></thead><tbody className="divide-y divide-brand-line">{data.topItems.slice(0, 8).map((item) => <tr key={`${item.catalogItemId ?? 'libre'}-${item.nombre}`}><td className="px-4 py-2.5 font-semibold">{item.nombre}</td><td className="px-3 py-2.5">{label(item.tipo)}</td><td className="px-3 py-2.5 text-right">{item.quantity.toLocaleString('es-CL')}</td><td className="px-4 py-2.5 text-right">{formatClp(item.revenue)}</td></tr>)}</tbody></table>{data.topItems.length === 0 && <Empty />}</div>
      </div>
    </>}
  </section>;
};

export const CommercialReportPanel = ({ from, to, params, setFilter, canExport }: ReportPanelProps & { canExport: boolean }) => {
  const rawStatus = params.get('quotationStatus');
  const estadoPago = QUOTATION_STATUS.find((status) => status === rawStatus) as QuotationStatus | undefined;
  const rawLinked = params.get('quotationLinked');
  const workOrderLinked = rawLinked === 'true' ? true : rawLinked === 'false' ? false : undefined;
  const search = params.get('q') ?? undefined;
  const validRange = from <= to;
  const filters = { fechaDesde: from, fechaHasta: to, estadoPago, workOrderLinked, search };
  const query = useQuotations({ page: 1, pageSize: 8, ...filters }, validRange);
  const report = useReportDownload();

  return (
    <section className="min-w-0 space-y-4" aria-label="Reporte comercial">
      <PanelHeader
        title="Reporte comercial de cotizaciones"
        action={canExport && (
          <>
            <button type="button" className="secondary-button" disabled={!validRange || report.isPending} onClick={() => report.openPdf('commercial', filters)}>
              <FileText className="h-4 w-4" aria-hidden="true" />Abrir PDF
            </button>
            <button type="button" className="primary-button" disabled={!validRange || report.isPending} onClick={() => report.downloadExcel('commercial', filters)}>
              <Download className="h-4 w-4" aria-hidden="true" />Excel
            </button>
          </>
        )}
      />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)_180px_180px]">
        <SearchFilter value={params.get('q') ?? ''} onChange={(value) => setFilter('q', value)} placeholder="COT, nota o referencia" />
        <DateFilters from={from} to={to} setFilter={setFilter} />
        <label className="text-xs font-semibold text-brand-muted">Estado de pago
          <select aria-label="Estado de pago" value={estadoPago ?? ''} onChange={(event) => setFilter('quotationStatus', event.target.value)} className="mt-1 h-10 w-full rounded-md border border-brand-line bg-white px-3 text-sm text-brand-ink"><option value="">Todos</option>{QUOTATION_STATUS.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select>
        </label>
        <label className="text-xs font-semibold text-brand-muted">Orden de trabajo
          <select aria-label="Vínculo con OT" value={rawLinked ?? ''} onChange={(event) => setFilter('quotationLinked', event.target.value)} className="mt-1 h-10 w-full rounded-md border border-brand-line bg-white px-3 text-sm text-brand-ink"><option value="">Todas</option><option value="true">Con OT</option><option value="false">Sin OT</option></select>
        </label>
      </div>
      {!validRange && <p role="alert" className="text-sm text-brand-coralInk">La fecha desde debe ser anterior o igual a la fecha hasta.</p>}
      {(query.isError || report.isError) && <QueryError error={query.error ?? report.error} />}
      {validRange && (query.isPending ? <div role="status" className="h-44 animate-pulse bg-brand-line/40" aria-label="Cargando cotizaciones" /> : <>
        <p className="text-sm text-brand-muted"><strong className="text-brand-primaryInk">{query.data?.total ?? 0}</strong> cotizaciones en el período</p>
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="border-b border-brand-line text-xs uppercase text-brand-muted"><tr><th className="py-3 pr-4">COT</th><th className="py-3 pr-4">Cliente</th><th className="py-3 pr-4">Estado</th><th className="py-3 pr-4">Emisión</th><th className="py-3 text-right">Total</th></tr></thead><tbody>{query.data?.items.map((item) => <tr key={item.id} className="border-b border-brand-line last:border-0"><td className="py-3 pr-4"><Link to={`/quotations/${item.id}`} className="font-mono font-semibold text-brand-primaryInk hover:underline">{item.codigo}</Link></td><td className="py-3 pr-4">{item.client?.nombre ?? 'Sin cliente'}</td><td className="py-3 pr-4">{label(item.estadoPago)}</td><td className="py-3 pr-4">{formatDate(item.createdAt)}</td><td className="py-3 text-right font-semibold">{formatClp(item.total)}</td></tr>)}</tbody></table></div>
        {query.data?.items.length === 0 && <Empty />}
      </>)}
    </section>
  );
};

export const WorkshopReportPanel = ({ from, to, search, searchValue, setSearch, params, setFilter, canExport }: ReportPanelProps & { canExport: boolean }) => {
  const rawStatus = params.get('workStatus');
  const estado = WORK_ORDER_STATUS.find((status) => status === rawStatus) as WorkOrderStatus | undefined;
  const mechanicId = Number(params.get('mechanicId')) || undefined;
  const validRange = from <= to;
  const filters = { fechaDesde: from, fechaHasta: to, estado, mechanicId, search: search || undefined };
  const query = useWorkOrders({ page: 1, pageSize: 8, ...filters }, validRange);
  const mechanics = useMechanics();
  const report = useReportDownload();

  return <section className="min-w-0 space-y-4" aria-label="Reporte de taller">
    <PanelHeader
      title="Reporte de taller y progreso de OT"
      action={canExport && (
        <>
          <button type="button" className="secondary-button" disabled={!validRange || report.isPending} onClick={() => report.openPdf('workshop', filters)}>
            <FileText className="h-4 w-4" aria-hidden="true" />Abrir PDF
          </button>
          <button type="button" className="primary-button" disabled={!validRange || report.isPending} onClick={() => report.downloadExcel('workshop', filters)}>
            <Download className="h-4 w-4" aria-hidden="true" />Excel
          </button>
        </>
      )}
    />
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)_180px_220px]">
      <SearchFilter value={searchValue} onChange={setSearch} placeholder="OT, cliente o patente" />
      <DateFilters from={from} to={to} setFilter={setFilter} />
      <label className="text-xs font-semibold text-brand-muted">Estado
        <select aria-label="Estado de OT" value={estado ?? ''} onChange={(event) => setFilter('workStatus', event.target.value)} className="mt-1 h-10 w-full rounded-md border border-brand-line bg-white px-3 text-sm text-brand-ink"><option value="">Todos</option>{WORK_ORDER_STATUS.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select>
      </label>
      <label className="text-xs font-semibold text-brand-muted">Mecánico
        <select aria-label="Mecánico" value={mechanicId ?? ''} onChange={(event) => setFilter('mechanicId', event.target.value)} className="mt-1 h-10 w-full rounded-md border border-brand-line bg-white px-3 text-sm text-brand-ink"><option value="">Todos</option>{mechanics.data?.map((mechanic) => <option key={mechanic.id} value={mechanic.id}>{mechanic.nombre}</option>)}</select>
      </label>
    </div>
    {!validRange && <p role="alert" className="text-sm text-brand-coralInk">La fecha desde debe ser anterior o igual a la fecha hasta.</p>}
    {(query.isError || mechanics.isError || report.isError) && <QueryError error={query.error ?? mechanics.error ?? report.error} />}
    {validRange && (query.isPending ? <div role="status" className="h-44 animate-pulse bg-brand-line/40" aria-label="Cargando órdenes" /> : <>
      <p className="text-sm text-brand-muted"><strong className="text-brand-primaryInk">{query.data?.total ?? 0}</strong> órdenes en el período</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[540px] text-left text-sm"><thead className="border-b border-brand-line text-xs uppercase text-brand-muted"><tr><th className="py-3 pr-4">OT</th><th className="py-3 pr-4">Vehículo</th><th className="py-3 pr-4">Cliente</th><th className="py-3 pr-4">Estado</th><th className="py-3">Ingreso</th></tr></thead><tbody>{query.data?.items.map((item) => <tr key={item.id} className="border-b border-brand-line last:border-0"><td className="py-3 pr-4"><Link to={`/work-orders/${item.id}`} className="font-mono font-semibold text-brand-primaryInk hover:underline">{item.codigo}</Link></td><td className="py-3 pr-4">{item.vehicle?.patente ?? 'Sin vehículo'}</td><td className="py-3 pr-4">{item.client?.nombre ?? 'Sin cliente'}</td><td className="py-3 pr-4">{label(item.estado)}</td><td className="py-3">{formatDate(item.fechaIngreso)}</td></tr>)}</tbody></table></div>
      {query.data?.items.length === 0 && <Empty />}
    </>)}
  </section>;
};

export const InventoryReportPanel = ({ from, to, searchValue, setSearch, params, setFilter, canExport }: ReportPanelProps & { canExport: boolean }) => {
  const rawType = params.get('movementType');
  const tipo = STOCK_MOVEMENT_TYPES.find((value) => value === rawType) as StockMovementType | undefined;
  const warehouseId = Number(params.get('warehouseId')) || undefined;
  const rawStock = params.get('stock');
  const stock = rawStock === 'con_stock' || rawStock === 'sin_stock' || rawStock === 'critico' ? rawStock : undefined;
  const search = params.get('q') ?? undefined;
  const validRange = from <= to;
  const warehouses = useWarehouses({ page: 1, pageSize: 100 });
  const movements = useStockMovements({ page: 1, pageSize: 10, fechaDesde: from, fechaHasta: to, tipo, warehouseId }, validRange);
  const report = useReportDownload();
  const filters = { fechaDesde: from, fechaHasta: to, tipo, warehouseId, stock, search };

  return <section className="min-w-0 space-y-4" aria-label="Reporte de almacenes">
    <PanelHeader
      title="Reporte de almacenes, stock y transferencias"
      action={canExport && (
        <>
          <button type="button" className="secondary-button" disabled={!validRange || report.isPending} onClick={() => report.openPdf('inventory', filters)}>
            <FileText className="h-4 w-4" aria-hidden="true" />Abrir PDF
          </button>
          <button type="button" className="primary-button" disabled={!validRange || report.isPending} onClick={() => report.downloadExcel('inventory', filters)}>
            <Download className="h-4 w-4" aria-hidden="true" />Excel
          </button>
        </>
      )}
    />
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)_180px_220px_190px]">
      <SearchFilter value={searchValue} onChange={setSearch} placeholder="Repuesto, código o referencia" />
      <DateFilters from={from} to={to} setFilter={setFilter} />
      <label className="text-xs font-semibold text-brand-muted">Movimiento
        <select aria-label="Tipo de movimiento" value={tipo ?? ''} onChange={(event) => setFilter('movementType', event.target.value)} className="mt-1 h-10 w-full rounded-md border border-brand-line bg-white px-3 text-sm text-brand-ink"><option value="">Todos</option>{STOCK_MOVEMENT_TYPES.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select>
      </label>
      <label className="text-xs font-semibold text-brand-muted">Almacén
        <select aria-label="Almacén" value={warehouseId ?? ''} onChange={(event) => setFilter('warehouseId', event.target.value)} className="mt-1 h-10 w-full rounded-md border border-brand-line bg-white px-3 text-sm text-brand-ink"><option value="">Todos</option>{warehouses.data?.items.map((item) => <option key={item.id} value={item.id}>{item.codigo} · {item.nombre}</option>)}</select>
      </label>
      <label className="text-xs font-semibold text-brand-muted">Stock
        <select aria-label="Estado de stock" value={stock ?? ''} onChange={(event) => setFilter('stock', event.target.value)} className="mt-1 h-10 w-full rounded-md border border-brand-line bg-white px-3 text-sm text-brand-ink"><option value="">Todos</option><option value="con_stock">Con stock</option><option value="sin_stock">Sin stock</option><option value="critico">Crítico</option></select>
      </label>
    </div>
    {!validRange && <p role="alert" className="text-sm text-brand-coralInk">La fecha desde debe ser anterior o igual a la fecha hasta.</p>}
    {(movements.isError || warehouses.isError || report.isError) && <QueryError error={movements.error ?? warehouses.error ?? report.error} />}
    {validRange && (movements.isPending ? <div role="status" className="h-44 animate-pulse bg-brand-line/40" aria-label="Cargando movimientos" /> : <>
      <p className="text-sm text-brand-muted"><strong className="text-brand-primaryInk">{movements.data?.total ?? 0}</strong> movimientos en el período</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="border-b border-brand-line text-xs uppercase text-brand-muted"><tr><th className="py-3 pr-4">Fecha</th><th className="py-3 pr-4">Repuesto</th><th className="py-3 pr-4">Almacén</th><th className="py-3 pr-4">Tipo</th><th className="py-3 text-right">Unidades</th></tr></thead><tbody>{movements.data?.items.map((item) => <tr key={item.id} className="border-b border-brand-line last:border-0"><td className="py-3 pr-4">{formatDateTime(item.fecha)}</td><td className="py-3 pr-4">{item.nombre}</td><td className="py-3 pr-4">{item.warehouseCodigo}</td><td className="py-3 pr-4">{label(item.tipo)}</td><td className="py-3 text-right font-semibold">{item.cantidad}</td></tr>)}</tbody></table></div>
      {movements.data?.items.length === 0 && <Empty />}
    </>)}
  </section>;
};

export const CatalogReportPanel = ({ from, to, searchValue, setSearch, params, setFilter, canExport }: ReportPanelProps & { canExport: boolean }) => {
  const rawType = params.get('catalogType');
  const tipo = CATALOG_TYPES.find((value) => value === rawType) as CatalogType | undefined;
  const rawStock = params.get('catalogStock');
  const stock = rawStock === 'con_stock' || rawStock === 'sin_stock' || rawStock === 'critico' ? rawStock : undefined;
  const search = params.get('q') ?? undefined;
  const validRange = from <= to;
  const items = useCatalogItems({ page: 1, pageSize: 10, search, tipo, soloConStock: stock === 'con_stock' ? true : undefined });
  const report = useReportDownload();
  const filters = { fechaDesde: from, fechaHasta: to, tipo, stock, search };

  return <section className="min-w-0 space-y-4" aria-label="Reporte de catálogo">
    <PanelHeader
      title="Reporte de catálogo, servicios y repuestos"
      action={canExport && (
        <>
          <button type="button" className="secondary-button" disabled={!validRange || report.isPending} onClick={() => report.openPdf('catalog', filters)}>
            <FileText className="h-4 w-4" aria-hidden="true" />Abrir PDF
          </button>
          <button type="button" className="primary-button" disabled={!validRange || report.isPending} onClick={() => report.downloadExcel('catalog', filters)}>
            <Download className="h-4 w-4" aria-hidden="true" />Excel
          </button>
        </>
      )}
    />
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)_190px_190px]">
      <SearchFilter value={searchValue} onChange={setSearch} placeholder="Servicio, repuesto o código" />
      <DateFilters from={from} to={to} setFilter={setFilter} />
      <label className="text-xs font-semibold text-brand-muted">Tipo
        <select aria-label="Tipo de catálogo" value={tipo ?? ''} onChange={(event) => setFilter('catalogType', event.target.value)} className="mt-1 h-10 w-full rounded-md border border-brand-line bg-white px-3 text-sm text-brand-ink"><option value="">Todos</option>{CATALOG_TYPES.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select>
      </label>
      <label className="text-xs font-semibold text-brand-muted">Stock
        <select aria-label="Stock de catálogo" value={stock ?? ''} onChange={(event) => setFilter('catalogStock', event.target.value)} className="mt-1 h-10 w-full rounded-md border border-brand-line bg-white px-3 text-sm text-brand-ink"><option value="">Todos</option><option value="con_stock">Con stock</option><option value="sin_stock">Sin stock</option><option value="critico">Crítico</option></select>
      </label>
    </div>
    {!validRange && <p role="alert" className="text-sm text-brand-coralInk">La fecha desde debe ser anterior o igual a la fecha hasta.</p>}
    {(items.isError || report.isError) && <QueryError error={items.error ?? report.error} />}
    {validRange && (items.isPending ? <div role="status" className="h-44 animate-pulse bg-brand-line/40" aria-label="Cargando catálogo" /> : <>
      <p className="text-sm text-brand-muted"><strong className="text-brand-primaryInk">{items.data?.total ?? 0}</strong> items filtrados. El PDF y Excel incluyen uso en COT, OT y stock.</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="border-b border-brand-line text-xs uppercase text-brand-muted"><tr><th className="py-3 pr-4">Código</th><th className="py-3 pr-4">Nombre</th><th className="py-3 pr-4">Tipo</th><th className="py-3 text-right">Precio</th><th className="py-3 text-right">Stock</th></tr></thead><tbody>{items.data?.items.map((item) => <tr key={item.id} className="border-b border-brand-line last:border-0"><td className="py-3 pr-4 font-mono font-semibold">{item.codigo ?? '-'}</td><td className="py-3 pr-4 font-semibold text-brand-primaryInk">{item.nombre}</td><td className="py-3 pr-4">{label(item.tipo)}</td><td className="py-3 text-right">{formatClp(item.precio)}</td><td className="py-3 text-right font-semibold">{item.tipo === 'parte' ? item.stock : '-'}</td></tr>)}</tbody></table></div>
      {items.data?.items.length === 0 && <Empty />}
    </>)}
  </section>;
};

export const FleetReportPanel = ({ from, to, search, searchValue, setSearch, params, setFilter, canExport }: ReportPanelProps & { canExport: boolean }) => {
  const type = params.get('clientType');
  const clientType = type === 'cliente' || type === 'empresa' ? type : undefined;
  const rawScope = params.get('fleetScope');
  const scope = rawScope === 'clients' || rawScope === 'vehicles' ? rawScope : 'all';
  const onlyWithHistory = params.get('onlyWithHistory') === 'true' ? true : undefined;
  const validRange = from <= to;
  const clients = useClients({ page: 1, pageSize: 8, search: search || undefined, tipo: clientType });
  const vehicles = useVehicles({ page: 1, pageSize: 8, search: search || undefined });
  const report = useReportDownload();
  const filters = { fechaDesde: from, fechaHasta: to, scope, clientType, onlyWithHistory, search: search || undefined };

  return <section className="min-w-0 space-y-4" aria-label="Reporte de clientes y vehículos">
    <PanelHeader
      title="Reporte de clientes, vehículos e historial"
      description="Elige si el documento incluirá clientes, vehículos o ambos, con su actividad del período."
      action={canExport && (
        <>
          <button type="button" className="secondary-button" disabled={!validRange || report.isPending} onClick={() => report.openPdf('fleet', filters)}>
            <FileText className="h-4 w-4" aria-hidden="true" />Abrir PDF
          </button>
          <button type="button" className="primary-button" disabled={!validRange || report.isPending} onClick={() => report.downloadExcel('fleet', filters)}>
            <Download className="h-4 w-4" aria-hidden="true" />Excel
          </button>
        </>
      )}
    />
    <div className="grid gap-3 rounded-lg border border-brand-line bg-brand-light p-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(260px,340px)_190px_190px_210px]"><SearchFilter value={searchValue} onChange={setSearch} placeholder="Cliente, RUT o patente" /><DateFilters from={from} to={to} setFilter={setFilter} /><label className="text-xs font-semibold text-brand-muted">Contenido del reporte<select aria-label="Contenido del reporte" value={scope} onChange={(event) => setFilter('fleetScope', event.target.value)} className="mt-1 h-10 w-full rounded-md border border-brand-line bg-white px-3 text-sm text-brand-ink"><option value="all">Clientes y vehículos</option><option value="clients">Solo clientes</option><option value="vehicles">Solo vehículos</option></select></label><label className="text-xs font-semibold text-brand-muted">Tipo de cliente<select aria-label="Tipo de cliente" value={clientType ?? ''} onChange={(event) => setFilter('clientType', event.target.value)} disabled={scope === 'vehicles'} className="mt-1 h-10 w-full rounded-md border border-brand-line bg-white px-3 text-sm text-brand-ink disabled:bg-brand-line/50"><option value="">Todos</option><option value="cliente">Persona</option><option value="empresa">Empresa</option></select></label><label className="text-xs font-semibold text-brand-muted">Historial<select aria-label="Historial vinculado" value={onlyWithHistory ? 'true' : ''} onChange={(event) => setFilter('onlyWithHistory', event.target.value)} className="mt-1 h-10 w-full rounded-md border border-brand-line bg-white px-3 text-sm text-brand-ink"><option value="">Todos los registros</option><option value="true">Solo con OT/COT</option></select></label></div>
    {!validRange && <p role="alert" className="text-sm text-brand-coralInk">La fecha desde debe ser anterior o igual a la fecha hasta.</p>}
    {(clients.isError || vehicles.isError || report.isError) && <QueryError error={clients.error ?? vehicles.error ?? report.error} />}
    <div className={`grid gap-4 ${scope === 'all' ? 'xl:grid-cols-2' : ''}`}>
      {scope !== 'vehicles' && <div className="min-w-0 overflow-x-auto rounded-lg border border-brand-line bg-white"><div className="flex items-center justify-between border-b border-brand-line px-4 py-3"><h3 className="font-bold text-brand-primaryInk">Vista previa de clientes · {clients.data?.total ?? 0}</h3></div>{clients.isPending ? <p role="status" className="py-8 text-center text-brand-muted">Cargando...</p> : <><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-brand-line/40 text-xs uppercase text-brand-muted"><tr><th className="px-4 py-2.5">Cliente</th><th className="px-3 py-2.5">RUT</th><th className="px-3 py-2.5">Tipo</th><th className="px-3 py-2.5">Contacto</th><th className="px-4 py-2.5 text-right">Vehículos</th></tr></thead><tbody className="divide-y divide-brand-line">{clients.data?.items.map((item) => <tr key={item.id}><td className="px-4 py-2.5 font-semibold text-brand-primaryInk">{item.nombre}</td><td className="px-3 py-2.5">{item.rut ?? '-'}</td><td className="px-3 py-2.5">{item.tipo === 'empresa' ? 'Empresa' : 'Persona'}</td><td className="px-3 py-2.5">{item.telefono ?? item.email ?? '-'}</td><td className="px-4 py-2.5 text-right">{item.vehiclesCount ?? item.vehicles?.length ?? 0}</td></tr>)}</tbody></table>{clients.data?.items.length === 0 && <Empty />}</>}</div>}
      {scope !== 'clients' && <div className="min-w-0 overflow-x-auto rounded-lg border border-brand-line bg-white"><div className="flex items-center justify-between border-b border-brand-line px-4 py-3"><h3 className="font-bold text-brand-primaryInk">Vista previa de vehículos · {vehicles.data?.total ?? 0}</h3></div>{vehicles.isPending ? <p role="status" className="py-8 text-center text-brand-muted">Cargando...</p> : <><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-brand-line/40 text-xs uppercase text-brand-muted"><tr><th className="px-4 py-2.5">Patente</th><th className="px-3 py-2.5">Vehículo</th><th className="px-3 py-2.5">Año</th><th className="px-3 py-2.5">Dueño</th><th className="px-4 py-2.5 text-right">Kilometraje</th></tr></thead><tbody className="divide-y divide-brand-line">{vehicles.data?.items.map((item) => <tr key={item.id}><td className="px-4 py-2.5 font-mono font-bold text-brand-primaryInk">{item.patente}</td><td className="px-3 py-2.5">{[item.marca, item.modelo].filter(Boolean).join(' ') || '-'}</td><td className="px-3 py-2.5">{item.ano ?? '-'}</td><td className="px-3 py-2.5">{item.client?.nombre ?? 'Sin dueño'}</td><td className="px-4 py-2.5 text-right">{item.kilometraje?.toLocaleString('es-CL') ?? '-'}</td></tr>)}</tbody></table>{vehicles.data?.items.length === 0 && <Empty />}</>}</div>}
    </div>
  </section>;
};

export const AdministrationReportPanel = ({ from, to, search, searchValue, setSearch, params, setFilter, canExport }: ReportPanelProps & { canExport: boolean }) => {
  const roles = useRoles();
  const roleId = Number(params.get('roleId')) || undefined;
  const status = params.get('active');
  const activo = status === 'true' ? true : status === 'false' ? false : undefined;
  const includeDeleted = params.get('includeDeleted') === 'true';
  const users = useUsers({ page: 1, pageSize: 8, search: search || undefined, roleId, activo });
  const validRange = from <= to;
  const report = useReportDownload();
  const filters = { fechaDesde: from, fechaHasta: to, search: search || undefined, roleId, activo, includeDeleted };

  return <section className="min-w-0 space-y-4" aria-label="Reporte de cuentas">
    <PanelHeader
      title="Cuentas, roles y accesos"
      action={canExport && (
        <>
          <button type="button" className="secondary-button" disabled={!validRange || report.isPending} onClick={() => report.openPdf('administration', filters)}>
            <FileText className="h-4 w-4" aria-hidden="true" />Abrir PDF
          </button>
          <button type="button" className="primary-button" disabled={!validRange || report.isPending} onClick={() => report.downloadExcel('administration', filters)}>
            <Download className="h-4 w-4" aria-hidden="true" />Excel
          </button>
        </>
      )}
    />
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)_200px_160px_170px]"><SearchFilter value={searchValue} onChange={setSearch} placeholder="Nombre, usuario o correo" /><DateFilters from={from} to={to} setFilter={setFilter} /><label className="text-xs font-semibold text-brand-muted">Rol<select aria-label="Rol" value={roleId ?? ''} onChange={(event) => setFilter('roleId', event.target.value)} className="mt-1 h-10 w-full rounded-md border border-brand-line bg-white px-3 text-sm text-brand-ink"><option value="">Todos</option>{roles.data?.map((role) => <option key={role.id} value={role.id}>{label(role.nombre)}</option>)}</select></label><label className="text-xs font-semibold text-brand-muted">Acceso<select aria-label="Acceso" value={status ?? ''} onChange={(event) => setFilter('active', event.target.value)} className="mt-1 h-10 w-full rounded-md border border-brand-line bg-white px-3 text-sm text-brand-ink"><option value="">Todos</option><option value="true">Activos</option><option value="false">Inactivos</option></select></label><label className="text-xs font-semibold text-brand-muted">Eliminados<select aria-label="Cuentas eliminadas" value={includeDeleted ? 'true' : ''} onChange={(event) => setFilter('includeDeleted', event.target.value)} className="mt-1 h-10 w-full rounded-md border border-brand-line bg-white px-3 text-sm text-brand-ink"><option value="">Ocultar</option><option value="true">Incluir</option></select></label></div>
    {!validRange && <p role="alert" className="text-sm text-brand-coralInk">La fecha desde debe ser anterior o igual a la fecha hasta.</p>}
    {(users.isError || roles.isError || report.isError) && <QueryError error={users.error ?? roles.error ?? report.error} />}
    {users.isPending ? <div role="status" className="h-44 animate-pulse bg-brand-line/40" aria-label="Cargando cuentas" /> : <><p className="text-sm text-brand-muted"><strong className="text-brand-primaryInk">{users.data?.meta.total ?? 0}</strong> cuentas</p><div className="overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm"><thead className="border-b border-brand-line text-xs uppercase text-brand-muted"><tr><th className="py-3 pr-4">Nombre</th><th className="py-3 pr-4">Usuario</th><th className="py-3 pr-4">Rol</th><th className="py-3">Estado</th></tr></thead><tbody>{users.data?.data.map((item) => <tr key={item.id} className="border-b border-brand-line last:border-0"><td className="py-3 pr-4 font-semibold">{item.nombre}</td><td className="py-3 pr-4">{item.username}</td><td className="py-3 pr-4">{label(item.role.nombre)}</td><td className="py-3">{item.activo ? 'Activo' : 'Inactivo'}</td></tr>)}</tbody></table></div>{users.data?.data.length === 0 && <Empty />}</>}
  </section>;
};
