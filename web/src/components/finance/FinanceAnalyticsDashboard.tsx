import { financialReportQuerySchema } from '@unithor/shared';
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
import { useSearchParams } from 'react-router-dom';

import {
  useDownloadFinancialReport,
  useFinancialAnalytics,
} from '../../hooks/useFinance';
import { formatClp } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';

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

const filterKeys: Array<keyof FinancialReportFilters> = [
  'fechaDesde', 'fechaHasta', 'agruparPor', 'asesorId', 'clientId',
  'estadoPago', 'metodo', 'catalogType', 'movimientoTipo',
  'movimientoCategoria', 'comparar',
];

const filtersFromUrl = (params: URLSearchParams): FinancialReportFilters => {
  const values = Object.fromEntries(filterKeys.flatMap((key) => {
    const value = params.get(`f_${key}`);
    return value === null ? [] : [[key, value]];
  }));
  const parsed = financialReportQuerySchema.safeParse(values);
  return parsed.success ? parsed.data : initialFilters();
};

const humanize = (value: string): string =>
  value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const percent = (value: number): string =>
  `${new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)}%`;

interface ComparisonProps {
  value: number | null;
  inverse?: boolean;
}

const Comparison = ({ value, inverse = false }: ComparisonProps) => {
  if (value === null) return <span className="text-brand-muted">Sin base comparable</span>;
  const favorable = inverse ? value <= 0 : value >= 0;
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${
      favorable ? 'text-brand-mintInk' : 'text-brand-coralInk'
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
  <article className="min-h-36 min-w-0 rounded-lg border border-brand-line bg-white p-4 shadow-sm">
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase text-brand-muted">{label}</p>
        <p className="mt-2 break-words text-xl font-bold text-brand-primaryInk sm:text-2xl">{value}</p>
      </div>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-line/40 text-brand-primaryInk">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
    </div>
    <p className="mt-3 text-xs text-brand-muted">{detail}</p>
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
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="h-36 animate-pulse rounded-lg bg-brand-line" />
      ))}
    </div>
    <div className="h-72 animate-pulse rounded-lg bg-brand-line" />
  </div>
);

const EmptyRows = ({ label }: { label: string }) => (
  <p className="py-8 text-center text-sm text-brand-muted">{label}</p>
);

export const FinanceAnalyticsDashboard = () => {
  const [urlParams, setUrlParams] = useSearchParams();
  const [filters, setFilters] = useState<FinancialReportFilters>(() => filtersFromUrl(urlParams));
  const user = useAuthStore((state) => state.user);
  const canExport = Boolean(user && hasUserPermission(user, 'finanzas', 'export'));
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
  ): void => {
    setFilters((current) => ({ ...current, [key]: value }));
    setUrlParams((current) => {
      const next = new URLSearchParams(current);
      if (value === undefined || value === null || value === '') next.delete(`f_${key}`);
      else next.set(`f_${key}`, String(value));
      return next;
    }, { replace: true });
  };

  const resetFilters = (): void => {
    setFilters(initialFilters());
    setUrlParams((current) => {
      const next = new URLSearchParams(current);
      filterKeys.forEach((key) => next.delete(`f_${key}`));
      return next;
    }, { replace: true });
  };

  const exportReport = (format: 'pdf' | 'excel'): void => {
    downloadMutation.mutate({ format, filters });
  };

  return (
    <section className="min-w-0 space-y-5" aria-labelledby="financial-analytics-title">
      <div className="flex flex-col gap-3 border-b border-brand-line pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-brand-muted">Análisis ejecutivo</p>
          <h2 id="financial-analytics-title" className="mt-1 text-xl font-bold text-brand-primaryInk">
            Rendimiento financiero y comercial
          </h2>
        </div>
        {canExport && <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <button
            type="button"
            onClick={() => exportReport('pdf')}
            disabled={downloadMutation.isPending}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-brand-primaryInk px-4 text-sm font-bold text-brand-primaryInk hover:bg-brand-line/40 disabled:opacity-50 sm:w-auto"
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
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand-primaryInk px-4 text-sm font-bold text-white hover:bg-brand-primaryInkHover disabled:opacity-50 sm:w-auto"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            Excel detallado
          </button>
        </div>}
      </div>

      <div className="rounded-lg border border-brand-line bg-white p-4">
        <div className="mb-4 flex items-center gap-2 text-sm font-bold text-brand-primaryInk">
          <Filter className="h-4 w-4" aria-hidden="true" />
          Filtros del análisis y reportes
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <label className="min-w-0 text-xs font-bold text-brand-muted">
            Desde
            <input
              aria-label="Fecha desde"
              type="date"
              value={filters.fechaDesde}
              max={filters.fechaHasta}
              onChange={(event) => setFilter('fechaDesde', event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-brand-line px-3 text-sm font-normal outline-none focus:border-brand-primary"
            />
          </label>
          <label className="min-w-0 text-xs font-bold text-brand-muted">
            Hasta
            <input
              aria-label="Fecha hasta"
              type="date"
              value={filters.fechaHasta}
              min={filters.fechaDesde}
              max={todayIso()}
              onChange={(event) => setFilter('fechaHasta', event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-brand-line px-3 text-sm font-normal outline-none focus:border-brand-primary"
            />
          </label>
          <label className="min-w-0 text-xs font-bold text-brand-muted">
            Agrupar
            <select
              aria-label="Agrupar tendencia"
              value={filters.agruparPor}
              onChange={(event) =>
                setFilter('agruparPor', event.target.value as FinancialReportFilters['agruparPor'])
              }
              className="mt-1 h-10 w-full rounded-lg border border-brand-line px-3 text-sm font-normal outline-none focus:border-brand-primary"
            >
              <option value="dia">Por día</option>
              <option value="semana">Por semana</option>
              <option value="mes">Por mes</option>
            </select>
          </label>
          <label className="min-w-0 text-xs font-bold text-brand-muted">
            Vendedor
            <select
              aria-label="Filtrar por vendedor"
              value={filters.asesorId ?? ''}
              onChange={(event) =>
                setFilter('asesorId', event.target.value ? Number(event.target.value) : undefined)
              }
              className="mt-1 h-10 w-full rounded-lg border border-brand-line px-3 text-sm font-normal outline-none focus:border-brand-primary"
            >
              <option value="">Todos</option>
              {data?.filterOptions.advisors.map((advisor) => (
                <option key={advisor.id} value={advisor.id}>{advisor.nombre}</option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-xs font-bold text-brand-muted">
            Cliente
            <select
              aria-label="Filtrar por cliente"
              value={filters.clientId ?? ''}
              onChange={(event) =>
                setFilter('clientId', event.target.value ? Number(event.target.value) : undefined)
              }
              className="mt-1 h-10 w-full rounded-lg border border-brand-line px-3 text-sm font-normal outline-none focus:border-brand-primary"
            >
              <option value="">Todos</option>
              {data?.filterOptions.clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.nombre}{client.rut ? ` · ${client.rut}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-xs font-bold text-brand-muted">
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
              className="mt-1 h-10 w-full rounded-lg border border-brand-line px-3 text-sm font-normal outline-none focus:border-brand-primary"
            >
              <option value="">Todos</option>
              {quotationStatuses.map((status) => (
                <option key={status} value={status}>{humanize(status)}</option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-xs font-bold text-brand-muted">
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
              className="mt-1 h-10 w-full rounded-lg border border-brand-line px-3 text-sm font-normal outline-none focus:border-brand-primary"
            >
              <option value="">Todos</option>
              {paymentMethods.map((method) => (
                <option key={method} value={method}>{humanize(method)}</option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-xs font-bold text-brand-muted">
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
              className="mt-1 h-10 w-full rounded-lg border border-brand-line px-3 text-sm font-normal outline-none focus:border-brand-primary"
            >
              <option value="">Todos</option>
              <option value="parte">Repuestos</option>
              <option value="estandar">Servicios estándar</option>
              <option value="especifico">Servicios específicos</option>
            </select>
          </label>
          <label className="min-w-0 text-xs font-bold text-brand-muted">
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
              className="mt-1 h-10 w-full rounded-lg border border-brand-line px-3 text-sm font-normal outline-none focus:border-brand-primary"
            >
              <option value="">Todos</option>
              <option value="ingreso">Ingreso</option>
              <option value="egreso">Egreso</option>
            </select>
          </label>
          <label className="min-w-0 text-xs font-bold text-brand-muted">
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
              className="mt-1 h-10 w-full rounded-lg border border-brand-line px-3 text-sm font-normal outline-none focus:border-brand-primary"
            >
              <option value="">Todas</option>
              {movementCategories.map((category) => (
                <option key={category} value={category}>{humanize(category)}</option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 h-10 items-center gap-2 self-end text-sm font-semibold text-brand-ink">
            <input
              type="checkbox"
              checked={filters.comparar}
              onChange={(event) => setFilter('comparar', event.target.checked)}
              className="h-4 w-4 accent-brand-primary"
            />
            Comparar período anterior
          </label>
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-lg border border-brand-line px-3 text-sm font-semibold text-brand-ink hover:bg-brand-pale"
          >
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Restablecer
          </button>
        </div>
      </div>

      {analyticsQuery.isLoading && <AnalyticsSkeleton />}
      {analyticsQuery.isError && (
        <div className="rounded-lg border border-brand-coral/30 bg-brand-coralPale px-4 py-5 text-sm text-brand-coralInk">
          No se pudo cargar el análisis financiero. Reintenta la consulta.
        </div>
      )}

      {data && (
        <>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

          <div className="grid min-w-0 gap-5 xl:grid-cols-[1.4fr_1fr]">
            <section className="min-w-0 rounded-lg border border-brand-line bg-white">
              <div className="border-b border-brand-line px-5 py-4">
                <h3 className="font-bold text-brand-primaryInk">Evolución del período</h3>
                <p className="mt-1 text-xs text-brand-muted">Ventas, cobros y egresos por {filters.agruparPor}.</p>
              </div>
              <div className="max-h-96 overflow-auto p-5">
                {data.trend.length === 0 ? (
                  <EmptyRows label="No hay actividad en este período." />
                ) : (
                  <div className="space-y-4">
                    {data.trend.map((point) => (
                      <div key={point.key} className="grid min-w-0 gap-3 sm:grid-cols-[5.5rem_minmax(0,1fr)]">
                        <div>
                          <p className="text-xs font-bold text-brand-ink">{point.label}</p>
                          <p className={`mt-1 text-xs font-semibold ${
                            point.netCash >= 0 ? 'text-brand-mintInk' : 'text-brand-coralInk'
                          }`}>
                            Neto {formatClp(point.netCash)}
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          <div className="grid min-w-0 grid-cols-[3.5rem_minmax(2rem,1fr)_auto] items-center gap-2">
                            <span className="text-right text-[11px] text-brand-muted">Ventas</span>
                            <span className="h-2 min-w-1 max-w-full rounded-sm bg-brand-primaryInk" style={{ width: `${Math.max(2, (point.grossSales / maxTrendValue) * 100)}%` }} />
                            <span className="whitespace-nowrap text-right text-[11px] font-semibold text-brand-muted">{formatClp(point.grossSales)}</span>
                          </div>
                          <div className="grid min-w-0 grid-cols-[3.5rem_minmax(2rem,1fr)_auto] items-center gap-2">
                            <span className="text-right text-[11px] text-brand-muted">Cobros</span>
                            <span className="h-2 min-w-1 max-w-full rounded-sm bg-brand-mintInk" style={{ width: `${Math.max(2, (point.collected / maxTrendValue) * 100)}%` }} />
                            <span className="whitespace-nowrap text-right text-[11px] font-semibold text-brand-muted">{formatClp(point.collected)}</span>
                          </div>
                          <div className="grid min-w-0 grid-cols-[3.5rem_minmax(2rem,1fr)_auto] items-center gap-2">
                            <span className="text-right text-[11px] text-brand-muted">Egresos</span>
                            <span className="h-2 min-w-1 max-w-full rounded-sm bg-brand-coralInk" style={{ width: `${Math.max(2, (point.expenses / maxTrendValue) * 100)}%` }} />
                            <span className="whitespace-nowrap text-right text-[11px] font-semibold text-brand-muted">{formatClp(point.expenses)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="min-w-0 rounded-lg border border-brand-line bg-white">
              <div className="border-b border-brand-line px-5 py-4">
                <h3 className="font-bold text-brand-primaryInk">Quién vendió más</h3>
                <p className="mt-1 text-xs text-brand-muted">Ranking por venta bruta emitida.</p>
              </div>
              <div className="divide-y divide-brand-line">
                {data.topSellers.length === 0 ? (
                  <EmptyRows label="No hay vendedores para este filtro." />
                ) : data.topSellers.slice(0, 8).map((seller, index) => (
                  <div key={seller.id ?? seller.nombre} className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-5">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                      index === 0 ? 'bg-brand-primary text-white' : 'bg-brand-pale text-brand-muted'
                    }`}>{index + 1}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-brand-ink">{seller.nombre}</p>
                      <p className="text-xs text-brand-muted">{seller.quotationCount} COT · cobrado {formatClp(seller.collected)}</p>
                    </div>
                    <strong className="text-sm text-brand-primaryInk">{formatClp(seller.grossSales)}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="grid min-w-0 gap-5 lg:grid-cols-2 xl:grid-cols-3">
            <section className="min-w-0 rounded-lg border border-brand-line bg-white">
              <div className="border-b border-brand-line px-5 py-4">
                <h3 className="font-bold text-brand-primaryInk">Productos y servicios con mayor salida</h3>
              </div>
              <div className="max-w-full overflow-x-auto overscroll-x-contain">
                {data.topItems.length === 0 ? <EmptyRows label="No hay ítems vendidos." /> : (
                  <table className="w-full min-w-[28rem] text-left text-sm">
                    <thead className="bg-brand-line/40 text-xs uppercase text-brand-muted">
                      <tr><th className="px-4 py-3">Ítem</th><th className="px-3 py-3 text-right">Cantidad</th><th className="px-4 py-3 text-right">Venta</th></tr>
                    </thead>
                    <tbody className="divide-y divide-brand-line">
                      {data.topItems.slice(0, 8).map((item) => (
                        <tr key={`${item.catalogItemId ?? 'libre'}-${item.nombre}`}>
                          <td className="px-4 py-3"><span className="block font-semibold text-brand-ink">{item.nombre}</span><span className="text-xs text-brand-muted">{item.codigo ?? humanize(item.tipo)}</span></td>
                          <td className="px-3 py-3 text-right font-semibold">{item.quantity.toLocaleString('es-CL')}</td>
                          <td className="px-4 py-3 text-right font-bold text-brand-primaryInk">{formatClp(item.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <section className="min-w-0 rounded-lg border border-brand-line bg-white">
              <div className="border-b border-brand-line px-5 py-4">
                <h3 className="font-bold text-brand-primaryInk">Clientes principales</h3>
              </div>
              <div className="divide-y divide-brand-line">
                {data.topClients.length === 0 ? <EmptyRows label="No hay clientes para este filtro." /> : data.topClients.slice(0, 8).map((client) => (
                  <div key={client.id ?? client.nombre} className="px-5 py-3">
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0"><p className="truncate text-sm font-bold text-brand-ink">{client.nombre}</p><p className="text-xs text-brand-muted">{client.rut ?? 'Sin identificación'} · {client.quotationCount} COT</p></div>
                      <strong className="shrink-0 whitespace-nowrap text-sm text-brand-primaryInk">{formatClp(client.grossSales)}</strong>
                    </div>
                    <p className="mt-1 text-xs text-brand-muted">Por cobrar: <span className="font-semibold text-brand-goldInk">{formatClp(client.receivable)}</span></p>
                  </div>
                ))}
              </div>
            </section>

            <section className="min-w-0 rounded-lg border border-brand-line bg-white">
              <div className="border-b border-brand-line px-5 py-4">
                <h3 className="font-bold text-brand-primaryInk">Composición de cobros</h3>
              </div>
              <div className="divide-y divide-brand-line">
                {data.paymentMethods.length === 0 ? <EmptyRows label="No hay pagos confirmados." /> : data.paymentMethods.map((method) => (
                  <div key={method.metodo} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-semibold text-brand-ink">{humanize(method.metodo)}</span>
                      <strong className="text-brand-primaryInk">{formatClp(method.amount)}</strong>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden bg-brand-pale"><div data-testid={`payment-share-${method.metodo}`} className="h-full max-w-full bg-brand-primaryInk" style={{ width: `${Math.min(100, Math.max(0, method.share))}%` }} /></div>
                    <p className="mt-1 text-xs text-brand-muted">{method.count} operaciones · {percent(method.share)}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="grid min-w-0 gap-5 lg:grid-cols-2">
            <section className="rounded-lg border border-brand-line bg-white p-5">
              <div className="flex items-center gap-2"><Users className="h-5 w-5 text-brand-primaryInk" aria-hidden="true" /><h3 className="font-bold text-brand-primaryInk">Estado de cotizaciones</h3></div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {data.quotationStatuses.map((status) => (
                  <div key={status.estado} className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-brand-line py-2 text-sm">
                    <span className="text-brand-muted">{humanize(status.estado)} ({status.count})</span>
                    <strong className="text-brand-ink">{formatClp(status.amount)}</strong>
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-lg border border-brand-line bg-white p-5">
              <div className="flex items-center gap-2"><Download className="h-5 w-5 text-brand-primaryInk" aria-hidden="true" /><h3 className="font-bold text-brand-primaryInk">Egresos e ingresos por categoría</h3></div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {data.movementCategories.length === 0 ? <EmptyRows label="No hay movimientos manuales." /> : data.movementCategories.map((movement) => (
                  <div key={`${movement.tipo}-${movement.categoria}`} className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-brand-line py-2 text-sm">
                    <span className="text-brand-muted">{humanize(movement.categoria)} ({movement.count})</span>
                    <strong className={movement.tipo === 'ingreso' ? 'text-brand-mintInk' : 'text-brand-coralInk'}>{formatClp(movement.amount)}</strong>
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
