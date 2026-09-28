import {
  AlertCircle,
  ArrowRight,
  Coins,
  FilePlus2,
  FileText,
  PackageX,
  ReceiptText,
  UserPlus,
  Wrench,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Stagger, StaggerItem } from '../../components/animate-ui';
import StockAdjustmentModal from '../../components/catalog/StockAdjustmentModal';
import ClientFormModal from '../../components/clients/ClientFormModal';
import QuickVehicleSearch from '../../components/common/QuickVehicleSearch';
import OperationalInbox from '../../components/dashboard/OperationalInbox';
import WorkOrderStatusBadge from '../../components/work-orders/WorkOrderStatusBadge';
import { useDashboardSummary } from '../../hooks/useDashboard';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDate } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../stores/auth.store';

import type { DashboardSummary } from '@unithor/shared';
import type { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  testId: string;
}

const KpiCard = ({ title, value, detail, icon: Icon, testId }: KpiCardProps) => (
  <>
    {/* El icono va a 50px como en la referencia y hereda el color de la tarjeta.
        Lucide renderiza `<svg>`, así que la regla `.stat img` no lo alcanza y
        el tamaño sale de las utilidades sin pelearse con el diseño. */}
    <Icon className="mb-4 h-[50px] w-[50px] shrink-0" strokeWidth={1.4} aria-hidden="true" />
    <p className="stat-label text-center">{title}</p>
    <p className="stat-value text-center" data-testid={testId}>{value}</p>
    <p className="stat-detail text-center text-brand-muted">{detail}</p>
  </>
);

const DashboardSkeleton = () => (
  <div className="space-y-5" aria-label="Cargando resumen del dashboard">
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: 6 }, (_, index) => <div key={index} className="stat stat-auto animate-pulse"><div className="h-[50px] w-[50px] rounded-lg bg-white/60" /><div className="stat-label mt-4 h-4 w-28 rounded bg-white/60" /><div className="mt-2 h-6 w-20 rounded bg-white/60" /></div>)}
    </div>
    <div className="grid gap-5 xl:grid-cols-[3fr_2fr]"><div className="h-80 animate-pulse rounded-lg border border-brand-line bg-white" /><div className="h-80 animate-pulse rounded-lg border border-brand-line bg-white" /></div>
  </div>
);

const formatCurrentDate = (): string => {
  const formatted = new Intl.DateTimeFormat('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
};

export const DashboardPage = () => {
  const user = useAuthStore((state) => state.user);
  const dashboardQuery = useDashboardSummary();
  const navigate = useNavigate();
  const [showClientForm, setShowClientForm] = useState(false);
  const [stockItem, setStockItem] = useState<DashboardSummary['lowStockItems'][number] | null>(null);
  const firstName = user?.nombre.trim().split(/\s+/)[0] ?? 'usuario';
  const canCreateWorkOrder = Boolean(user && hasUserPermission(user, 'taller', 'create'));
  const canCreateQuotation = Boolean(user && hasUserPermission(user, 'comercial', 'create'));
  const canCreateClient = Boolean(user && (hasUserPermission(user, 'comercial', 'create') || hasUserPermission(user, 'taller', 'create')));
  const canAdjustStock = Boolean(user && hasUserPermission(user, 'almacen', 'create'));
  const summary = dashboardQuery.data;

  return (
    <div className="min-w-0 space-y-6">
      <header className="page-banner">
        <div className="min-w-0">
          <p className="text-sm text-brand-muted">Panel operativo</p>
          <h1 className="mt-1">Bienvenido de vuelta, {firstName}</h1>
        </div>
        <p className="relative z-[1] ml-auto hidden self-end pb-1 text-sm text-brand-muted sm:block">{formatCurrentDate()}</p>
      </header>

      <section className="view-panel mb-6" aria-labelledby="quick-actions-title">
        <div className="view-panel-title">
          <h2 id="quick-actions-title" className="text-sm font-semibold uppercase text-brand-muted">Acciones rápidas</h2>
        </div>
        <div className="view-panel-body flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          {canCreateWorkOrder && (
            <Link to="/work-orders/new" className="primary-button">
              <Wrench className="h-4 w-4" aria-hidden="true" />
              Ingresar vehículo / Nueva OT
            </Link>
          )}
          {canCreateQuotation && (
            <Link to="/quotations/new" className="primary-button">
              <FilePlus2 className="h-4 w-4" aria-hidden="true" />
              Nueva cotización
            </Link>
          )}
          {canCreateClient && (
            <button type="button" className="secondary-button inline-flex items-center gap-2 text-sm font-medium text-brand-ink transition-colors hover:border-brand-primary hover:text-brand-primaryInk" onClick={() => setShowClientForm(true)}>
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Dar de alta cliente
            </button>
          )}
          <div className="min-w-[240px] flex-1">
            <QuickVehicleSearch
              placeholder="Consultar patente, RUT o cliente"
              onSelectVehicle={(vehicle) => navigate(`/vehicles?search=${encodeURIComponent(vehicle.patente)}`)}
              onSelectClient={(client) => navigate(`/clients?search=${encodeURIComponent(client.rut ?? client.nombre)}`)}
            />
          </div>
        </div>
      </section>

      {dashboardQuery.isError && <div className="flex items-center justify-between gap-4 border border-brand-coral/30 bg-brand-coralPale p-4 text-sm text-brand-coralInk" role="alert"><span className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{getApiErrorMessage(dashboardQuery.error, 'No fue posible cargar el resumen operativo')}</span><button type="button" className="shrink-0 font-semibold underline" onClick={() => void dashboardQuery.refetch()}>Reintentar</button></div>}

      {dashboardQuery.isPending ? <DashboardSkeleton /> : summary && (
        <>
          {/* Seis tarjetas en la grilla de 6 columnas de la referencia, una por
              tinte. La sexta es "COT sin OT", que ya existed en los datos y
              operaba en un encabezado de sección. */}
          <Stagger className="stats mb-6" aria-label="Indicadores principales">
            <StaggerItem className="stat stat-auto"><KpiCard title="OTs en taller" value={String(summary.metrics.activeWorkOrders)} detail="En progreso o esperando repuesto" icon={Wrench} testId="active-work-orders" /></StaggerItem>
            <StaggerItem className="stat stat-auto gold"><KpiCard title="Esperando repuestos" value={String(summary.metrics.waitingForParts)} detail="Vehículos detenidos por piezas" icon={PackageX} testId="waiting-for-parts" /></StaggerItem>
            <StaggerItem className="stat stat-auto green"><KpiCard title="Recaudación del mes" value={formatClp(summary.metrics.monthlyRevenue)} detail="Pagos registrados desde el día 1" icon={Coins} testId="monthly-revenue" /></StaggerItem>
            <StaggerItem className="stat stat-auto sky"><KpiCard title="Saldos por cobrar" value={formatClp(summary.metrics.pendingBalance)} detail={`${summary.metrics.pendingQuotations} cotización(es) pendientes`} icon={ReceiptText} testId="pending-balance" /></StaggerItem>
            <StaggerItem className={cn('stat stat-auto', summary.lowStockCount > 0 ? 'coral' : 'green')}><KpiCard title="Alerta de stock" value={String(summary.lowStockCount)} detail="Repuestos entre 0 y 5 unidades" icon={PackageX} testId="low-stock-count" /></StaggerItem>
            <StaggerItem className="stat stat-auto blue"><KpiCard title="COT sin OT" value={String(summary.metrics.quotationsWithoutWorkOrder)} detail="Pendientes de convertir a orden" icon={FileText} testId="quotations-without-work-order" /></StaggerItem>
          </Stagger>

          <OperationalInbox inbox={summary.operationalInbox} />

          {/* Proporcion 2:1 como en la referencia (`.revenue` span 8 y
              `.products` span 4). Con el 3:2 anterior la tabla de seis columnas
              no entraba y la columna "Detalle" quedaba cortada. */}
          <section className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="view-panel">
              <div className="view-panel-title flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-brand-ink">Últimos trabajos en taller</h2>
                  <p className="mt-0.5 text-sm text-brand-muted">Órdenes creadas o actualizadas recientemente</p>
                </div>
                <Link to="/work-orders" className="group inline-flex items-center gap-1.5 text-sm font-semibold text-brand-primaryInk hover:underline">
                  Ver todas
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </div>
              {summary.recentWorkOrders.length === 0 ? <p className="empty-row">Aún no hay órdenes de trabajo registradas.</p> : (
                <div className="data-scroll">
                  <table className="data-table">
                    <thead>
                      <tr><th>Orden</th><th>Patente</th><th>Cliente</th><th>Estado</th><th>Ingreso</th><th className="text-right">Detalle</th></tr>
                    </thead>
                    <tbody>
                      {summary.recentWorkOrders.map((workOrder) => (
                        <tr key={workOrder.id}>
                          {/* Sin `.order-id`: fija la columna en 98px y "OT-2026-0003"
                              se partía a la mitad. El nowrap del diseño deja que la
                              columna mida su contenido. */}
                          <td className="nowrap font-semibold text-brand-ink">{workOrder.codigo}</td>
                          <td className="nowrap font-mono font-semibold text-brand-ink">{workOrder.vehicle?.patente ?? 'Sin vehículo'}</td>
                          <td className="max-w-44"><span className="block truncate text-brand-ink">{workOrder.client?.nombre ?? 'Sin cliente'}</span></td>
                          <td><WorkOrderStatusBadge status={workOrder.estado} /></td>
                          <td className="whitespace-nowrap text-brand-muted">{formatDate(workOrder.fechaIngreso)}</td>
                          <td className="text-right">
                            <Link to={`/work-orders/${workOrder.id}`} className="table-action" aria-label={`Ver ${workOrder.codigo}`}>Ver</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="view-panel" aria-label="Alertas operativas">
              <section className="view-panel-body">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-brand-ink">Inventario crítico</h2>
                  <span className={cn('status-chip round', summary.lowStockCount > 0 ? 'red' : 'green')}>{summary.lowStockCount} alerta(s)</span>
                </div>
                <div className="mt-3 divide-y divide-brand-line">
                  {summary.lowStockItems.length === 0 ? <p className="py-5 text-sm text-brand-muted">No hay repuestos con stock crítico.</p> : summary.lowStockItems.map((item) => <div key={item.id} className="flex items-center gap-3 py-3 transition-colors hover:bg-brand-pale/60"><span className={cn('square-icon', item.stock === 0 ? 'coral' : 'gold')}><span className="text-sm font-semibold">{item.stock}</span></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-brand-ink">{item.nombre}</span><span className="block truncate font-mono text-xs text-brand-muted">{item.codigo ?? 'Sin código'}</span></span>{canAdjustStock && <button type="button" className="table-action" onClick={() => setStockItem(item)}>Ajustar</button>}</div>)}
                </div>
                <Link to="/catalog" className="group mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-primaryInk hover:underline">
                  Revisar inventario
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </section>

              <section className="view-panel-body border-t border-brand-line">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-brand-ink">COT sin OT</h2>
                  <span className="status-chip round gold">{summary.metrics.quotationsWithoutWorkOrder} pendiente(s)</span>
                </div>
                <div className="mt-3 divide-y divide-brand-line">
                  {summary.unlinkedQuotations.length === 0 ? <p className="py-5 text-sm text-brand-muted">No hay cotizaciones pendientes de vincular.</p> : summary.unlinkedQuotations.map((quotation) => <Link key={quotation.id} to={`/quotations/${quotation.id}`} className="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-brand-pale/60"><span className="min-w-0"><span className="nowrap block text-sm font-semibold text-brand-ink">{quotation.codigo}</span><span className="block truncate text-xs text-brand-muted">{quotation.client?.nombre ?? 'Sin cliente asignado'}</span></span><span className="whitespace-nowrap text-sm font-semibold text-brand-ink">{formatClp(quotation.total)}</span></Link>)}
                </div>
              </section>
            </div>
          </section>
        </>
      )}

      {showClientForm && <ClientFormModal onClose={() => setShowClientForm(false)} />}
      {stockItem && <StockAdjustmentModal item={stockItem} onClose={() => setStockItem(null)} />}
    </div>
  );
};

export default DashboardPage;
