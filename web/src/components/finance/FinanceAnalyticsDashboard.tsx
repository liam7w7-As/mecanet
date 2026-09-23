import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CircleDollarSign,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  LoaderCircle,
  Percent,
  Receipt,
  RefreshCcw,
  ShoppingBag,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  useDownloadFinancialReport,
  useFinancialAnalytics,
} from '../../hooks/useFinance';
import { formatClp } from '../../lib/formatters';

import type { FinancialReportFilters } from '@unithor/shared';
import type { LucideIcon } from 'lucide-react';

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const initialFilters = (): FinancialReportFilters => {
  const today = todayIso();
  return {
    fechaDesde: `${today.slice(0, 8)}01`,
    fechaHasta: today,
    agruparPor: 'dia',
    comparar: true,
  };
};

const humanize = (value: string): string =>
  value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const percent = (value: number): string =>
  new Intl.NumberFormat('es-CL', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);

interface ComparisonProps {
  value: number | null;
  inverse?: boolean;
}

const Comparison = ({ value, inverse = false }: ComparisonProps) => {
  if (value === null) return <span className="text-slate-400">Sin base comparable</span>;
  const favorable = inverse ? value <= 0 : value >= 0;
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${
      favorable ? 'text-emerald-700' : 'text-red-700'
    }`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {Math.abs(value).toFixed(1)}% vs. período anterior
    </span>
  );
};

interface ExecutiveMetricProps {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  comparison?: number | null;
  inverseComparison?: boolean;
}

const ExecutiveMetric = ({
  label,
  value,
  detail,
  icon: Icon,
  comparison,
  inverseComparison,
}: ExecutiveMetricProps) => (
  <article className="min-h-36 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
        <p className="mt-2 text-2xl font-bold text-brand-blue">{value}</p>
      </div>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand-blue">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
    </div>
    <p className="mt-3 text-xs text-slate-500">{detail}</p>
    {comparison !== undefined && (
      <p className="mt-1 text-xs">
        <Comparison value={comparison} inverse={inverseComparison} />
      </p>
    )}
  </article>
);

const paymentMethods = [
  'efectivo',
  'transferencia',
  'tarjeta_debito',
  'tarjeta_credito',
  'cheque',
  'otro',
] as const;

const quotationStatuses = [
  'por_pagar',
  'parcial',
  'total',
  'por_verificar',
  'ot_finalizado',
] as const;

const movementCategories = [
  'apertura_caja',
  'gasto_operativo',
  'compra_repuesto',
  'pago_proveedor',
  'devolucion',
  'retiro',
  'ajuste',
  'otro',
] as const;

const AnalyticsSkeleton = () => (
  <div className="space-y-5" aria-label="Cargando analítica financiera">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="h-36 animate-pulse rounded-lg bg-slate-200" />
      ))}
    </div>
    <div className="h-72 animate-pulse rounded-lg bg-slate-200" />
  </div>
);

const EmptyRows = ({ label }: { label: string }) => (
  <p className="py-8 text-center text-sm text-slate-500">{label}</p>
);

export const FinanceAnalyticsDashboard = () => {
  const [filters, setFilters] = useState<FinancialReportFilters>(initialFilters);
  const analyticsQuery = useFinancialAnalytics(filters);
  const downloadMutation = useDownloadFinancialReport();
  const data = analyticsQuery.data;

  const maxTrendValue = useMemo(() => {
    if (!data) return 1;
    return Math.max(
      1,
      ...data.trend.flatMap((point) => [
        point.grossSales,
        point.collected,
        point.expenses,
      ]),
    );
  }, [data]);

  const setFilter = <Key extends keyof FinancialReportFilters>(
    key: Key,
    value: FinancialReportFilters[Key],
  ): void => setFilters((current) => ({ ...current, [key]: value }));

  const exportReport = (format: 'pdf' | 'excel'): void => {
    downloadMutation.mutate({ format, filters });
  };

  return (
    <section className="space-y-5" aria-labelledby="financial-analytics-title">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-500">Análisis ejecutivo</p>
          <h2 id="financial-analytics-title" className="mt-1 text-xl font-bold text-brand-blue">
            Rendimiento financiero y comercial
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => exportReport('pdf')}
            disabled={downloadMutation.isPending}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-brand-blue px-4 text-sm font-bold text-brand-blue hover:bg-brand-light disabled:opacity-50"
          >
            {downloadMutation.isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileText className="h-4 w-4" aria-hidden="true" />
            )}
            PDF ejecutivo
          </button>
          <button
            type="button"
            onClick={() => exportReport('excel')}
            disabled={downloadMutation.isPending}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-blue px-4 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            Excel detallado
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-4 flex items-center gap-2 text-sm font-bold text-brand-blue">
          <Filter className="h-4 w-4" aria-hidden="true" />
          Filtros del análisis y reportes
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <label className="text-xs font-bold text-slate-600">
            Desde
            <input
              aria-label="Fecha desde"
              type="date"
              value={filters.fechaDesde}
              max={filters.fechaHasta}
              onChange={(event) => setFilter('fechaDesde', event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal outline-none focus:border-brand-blue"
            />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Hasta
            <input
              aria-label="Fecha hasta"
              type="date"
              value={filters.fechaHasta}
              min={filters.fechaDesde}
              max={todayIso()}
              onChange={(event) => setFilter('fechaHasta', event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal outline-none focus:border-brand-blue"
            />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Agrupar
            <select
              aria-label="Agrupar tendencia"
              value={filters.agruparPor}
              onChange={(event) =>
                setFilter('agruparPor', event.target.value as FinancialReportFilters['agruparPor'])
              }
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal outline-none focus:border-brand-blue"
            >
              <option value="dia">Por día</option>
              <option value="semana">Por semana</option>
              <option value="mes">Por mes</option>
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600">
            Vendedor
            <select
              aria-label="Filtrar por vendedor"
              value={filters.asesorId ?? ''}
              onChange={(event) =>
                setFilter('asesorId', event.target.value ? Number(event.target.value) : undefined)
              }
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal outline-none focus:border-brand-blue"
            >
              <option value="">Todos</option>
              {data?.filterOptions.advisors.map((advisor) => (
                <option key={advisor.id} value={advisor.id}>{advisor.nombre}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600">
            Cliente
            <select
              aria-label="Filtrar por cliente"
              value={filters.clientId ?? ''}
              onChange={(event) =>
                setFilter('clientId', event.target.value ? Number(event.target.value) : undefined)
              }
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal outline-none focus:border-brand-blue"
            >
              <option value="">Todos</option>
              {data?.filterOptions.clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.nombre}{client.rut ? ` · ${client.rut}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600">
            Estado de pago
            <select
              aria-label="Filtrar por estado de pago"
              value={filters.estadoPago ?? ''}
              onChange={(event) =>
                setFilter(
                  'estadoPago',
                  (event.target.value || undefined) as FinancialReportFilters['estadoPago'],
                )
              }
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal outline-none focus:border-brand-blue"
            >
              <option value="">Todos</option>
              {quotationStatuses.map((status) => (
                <option key={status} value={status}>{humanize(status)}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600">
            Método de pago
            <select
              aria-label="Filtrar por método de pago"
              value={filters.metodo ?? ''}
              onChange={(event) =>
                setFilter(
                  'metodo',
                  (event.target.value || undefined) as FinancialReportFilters['metodo'],
                )
              }
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal outline-none focus:border-brand-blue"
            >
              <option value="">Todos</option>
              {paymentMethods.map((method) => (
                <option key={method} value={method}>{humanize(method)}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600">
            Tipo de ítem
            <select
              aria-label="Filtrar por tipo de catálogo"
              value={filters.catalogType ?? ''}
              onChange={(event) =>
                setFilter(
                  'catalogType',
                  (event.target.value || undefined) as FinancialReportFilters['catalogType'],
                )
              }
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal outline-none focus:border-brand-blue"
            >
              <option value="">Todos</option>
              <option value="parte">Repuestos</option>
              <option value="estandar">Servicios estándar</option>
              <option value="especifico">Servicios específicos</option>
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600">
            Tipo de movimiento
            <select
              aria-label="Filtrar por tipo de movimiento"
              value={filters.movimientoTipo ?? ''}
              onChange={(event) =>
                setFilter(
                  'movimientoTipo',
                  (event.target.value || undefined) as FinancialReportFilters['movimientoTipo'],
                )
              }
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal outline-none focus:border-brand-blue"
            >
              <option value="">Todos</option>
              <option value="ingreso">Ingreso</option>
              <option value="egreso">Egreso</option>
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600">
            Categoría de caja
            <select
              aria-label="Filtrar por categoría de caja"
              value={filters.movimientoCategoria ?? ''}
              onChange={(event) =>
                setFilter(
                  'movimientoCategoria',
                  (event.target.value || undefined) as FinancialReportFilters['movimientoCategoria'],
                )
              }
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal outline-none focus:border-brand-blue"
            >
              <option value="">Todas</option>
              {movementCategories.map((category) => (
                <option key={category} value={category}>{humanize(category)}</option>
              ))}
            </select>
          </label>
          <label className="flex h-10 items-center gap-2 self-end text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={filters.comparar}
              onChange={(event) => setFilter('comparar', event.target.checked)}
              className="h-4 w-4 accent-brand-blue"
            />
            Comparar período anterior
          </label>
          <button
            type="button"
            onClick={() => setFilters(initialFilters())}
            className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Restablecer
          </button>
        </div>
      </div>

      {analyticsQuery.isLoading && <AnalyticsSkeleton />}
      {analyticsQuery.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-800">
          No se pudo cargar el análisis financiero. Reintenta la consulta.
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ExecutiveMetric
              label="Ventas emitidas"
              value={formatClp(data.kpis.grossSales)}
              detail={`${data.kpis.quotationCount} cotizaciones en el período`}
              icon={TrendingUp}
              comparison={data.comparison?.grossSales.variationPercent}
            />
            <ExecutiveMetric
              label="Recaudación"
              value={formatClp(data.kpis.collected)}
              detail={`Tasa de cobro: ${percent(data.kpis.collectionRate)}`}
              icon={CircleDollarSign}
              comparison={data.comparison?.collected.variationPercent}
            />
            <ExecutiveMetric
              label="Egresos"
              value={formatClp(data.kpis.expenses)}
              detail="Movimientos activos de caja"
              icon={Receipt}
              comparison={data.comparison?.expenses.variationPercent}
              inverseComparison
            />
            <ExecutiveMetric
              label="Flujo neto"
              value={formatClp(data.kpis.netCash)}
              detail={`Incluye ${formatClp(data.kpis.manualIncome)} en ingresos manuales`}
              icon={Wallet}
              comparison={data.comparison?.netCash.variationPercent}
            />
            <ExecutiveMetric
              label="Saldo por cobrar"
              value={formatClp(data.kpis.receivable)}
              detail="Cartera pendiente del período"
              icon={FileText}
            />
            <ExecutiveMetric
              label="Ticket promedio"
              value={formatClp(data.kpis.averageTicket)}
              detail="Promedio por cotización emitida"
              icon={ShoppingBag}
            />
            <ExecutiveMetric
              label="Conversión a OT"
              value={percent(data.kpis.conversionRate)}
              detail={`${data.kpis.workOrderConversionCount} cotizaciones convertidas`}
              icon={BarChart3}
            />
            <ExecutiveMetric
              label="Cotizaciones pagadas"
              value={String(data.kpis.paidQuotationCount)}
              detail={`${data.kpis.quotationCount} emitidas en total`}
              icon={Percent}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
            <section className="rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-4">
                <h3 className="font-bold text-brand-blue">Evolución del período</h3>
                <p className="mt-1 text-xs text-slate-500">Ventas, cobros y egresos por {filters.agruparPor}.</p>
              </div>
              <div className="max-h-96 overflow-auto p-5">
                {data.trend.length === 0 ? (
                  <EmptyRows label="No hay actividad en este período." />
                ) : (
                  <div className="space-y-4">
                    {data.trend.map((point) => (
                      <div key={point.key} className="grid grid-cols-[5.5rem_1fr] gap-3">
                        <div>
                          <p className="text-xs font-bold text-slate-700">{point.label}</p>
                          <p className={`mt-1 text-xs font-semibold ${
                            point.netCash >= 0 ? 'text-emerald-700' : 'text-red-700'
                          }`}>
                            Neto {formatClp(point.netCash)}
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="w-14 text-right text-[11px] text-slate-500">Ventas</span>
                            <span className="h-2 min-w-1 bg-brand-blue" style={{ width: `${Math.max(2, (point.grossSales / maxTrendValue) * 100)}%` }} />
                            <span className="text-[11px] font-semibold text-slate-600">{formatClp(point.grossSales)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-14 text-right text-[11px] text-slate-500">Cobros</span>
                            <span className="h-2 min-w-1 bg-emerald-600" style={{ width: `${Math.max(2, (point.collected / maxTrendValue) * 100)}%` }} />
                            <span className="text-[11px] font-semibold text-slate-600">{formatClp(point.collected)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-14 text-right text-[11px] text-slate-500">Egresos</span>
                            <span className="h-2 min-w-1 bg-red-500" style={{ width: `${Math.max(2, (point.expenses / maxTrendValue) * 100)}%` }} />
                            <span className="text-[11px] font-semibold text-slate-600">{formatClp(point.expenses)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-4">
                <h3 className="font-bold text-brand-blue">Quién vendió más</h3>
                <p className="mt-1 text-xs text-slate-500">Ranking por venta bruta emitida.</p>
              </div>
              <div className="divide-y divide-slate-100">
                {data.topSellers.length === 0 ? (
                  <EmptyRows label="No hay vendedores para este filtro." />
                ) : data.topSellers.slice(0, 8).map((seller, index) => (
                  <div key={seller.id ?? seller.nombre} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 px-5 py-3">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                      index === 0 ? 'bg-brand-yellow text-brand-dark' : 'bg-slate-100 text-slate-600'
                    }`}>{index + 1}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-800">{seller.nombre}</p>
                      <p className="text-xs text-slate-500">{seller.quotationCount} COT · cobrado {formatClp(seller.collected)}</p>
                    </div>
                    <strong className="text-sm text-brand-blue">{formatClp(seller.grossSales)}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
            <section className="rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-4">
                <h3 className="font-bold text-brand-blue">Productos y servicios con mayor salida</h3>
              </div>
              <div className="overflow-x-auto">
                {data.topItems.length === 0 ? <EmptyRows label="No hay ítems vendidos." /> : (
                  <table className="w-full min-w-[28rem] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr><th className="px-4 py-3">Ítem</th><th className="px-3 py-3 text-right">Cantidad</th><th className="px-4 py-3 text-right">Venta</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.topItems.slice(0, 8).map((item) => (
                        <tr key={`${item.catalogItemId ?? 'libre'}-${item.nombre}`}>
                          <td className="px-4 py-3"><span className="block font-semibold text-slate-800">{item.nombre}</span><span className="text-xs text-slate-500">{item.codigo ?? humanize(item.tipo)}</span></td>
                          <td className="px-3 py-3 text-right font-semibold">{item.quantity.toLocaleString('es-CL')}</td>
                          <td className="px-4 py-3 text-right font-bold text-brand-blue">{formatClp(item.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-4">
                <h3 className="font-bold text-brand-blue">Clientes principales</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {data.topClients.length === 0 ? <EmptyRows label="No hay clientes para este filtro." /> : data.topClients.slice(0, 8).map((client) => (
                  <div key={client.id ?? client.nombre} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-800">{client.nombre}</p><p className="text-xs text-slate-500">{client.rut ?? 'Sin identificación'} · {client.quotationCount} COT</p></div>
                      <strong className="text-sm text-brand-blue">{formatClp(client.grossSales)}</strong>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Por cobrar: <span className="font-semibold text-amber-700">{formatClp(client.receivable)}</span></p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-4">
                <h3 className="font-bold text-brand-blue">Composición de cobros</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {data.paymentMethods.length === 0 ? <EmptyRows label="No hay pagos confirmados." /> : data.paymentMethods.map((method) => (
                  <div key={method.metodo} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-semibold text-slate-700">{humanize(method.metodo)}</span>
                      <strong className="text-brand-blue">{formatClp(method.amount)}</strong>
                    </div>
                    <div className="mt-2 h-1.5 bg-slate-100"><div className="h-full bg-brand-yellow" style={{ width: `${method.share * 100}%` }} /></div>
                    <p className="mt-1 text-xs text-slate-500">{method.count} operaciones · {percent(method.share)}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2"><Users className="h-5 w-5 text-brand-blue" aria-hidden="true" /><h3 className="font-bold text-brand-blue">Estado de cotizaciones</h3></div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {data.quotationStatuses.map((status) => (
                  <div key={status.estado} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm">
                    <span className="text-slate-600">{humanize(status.estado)} ({status.count})</span>
                    <strong className="text-slate-800">{formatClp(status.amount)}</strong>
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2"><Download className="h-5 w-5 text-brand-blue" aria-hidden="true" /><h3 className="font-bold text-brand-blue">Egresos e ingresos por categoría</h3></div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {data.movementCategories.length === 0 ? <EmptyRows label="No hay movimientos manuales." /> : data.movementCategories.map((movement) => (
                  <div key={`${movement.tipo}-${movement.categoria}`} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm">
                    <span className="text-slate-600">{humanize(movement.categoria)} ({movement.count})</span>
                    <strong className={movement.tipo === 'ingreso' ? 'text-emerald-700' : 'text-red-700'}>{formatClp(movement.amount)}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </section>
  );
};

export default FinanceAnalyticsDashboard;
