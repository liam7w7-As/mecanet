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
import BrandLogo from '../../components/common/BrandLogo';
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
    <span className="dashboard-kpi-icon"><Icon strokeWidth={1.7} aria-hidden="true" /></span>
    <p className="dashboard-kpi-label">{title}</p>
    <p className="dashboard-kpi-value" data-testid={testId}>{value}</p>
    <p className="dashboard-kpi-detail">{detail}</p>
  </>
);

const DashboardSkeleton = () => (
  <div className="space-y-5" aria-label="Cargando resumen del dashboard">
    <div className="dashboard-metrics">
      {Array.from({ length: 6 }, (_, index) => <div key={index} className="dashboard-kpi animate-pulse"><div className="dashboard-kpi-icon bg-slate-100" /><div className="h-3 w-20 rounded bg-slate-100" /><div className="mt-2 h-7 w-24 rounded bg-slate-100" /><div className="mt-2 h-3 w-28 rounded bg-slate-100" /></div>)}
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
  const quickActionCount = Number(canCreateWorkOrder) + Number(canCreateQuotation) + Number(canCreateClient);
  const summary = dashboardQuery.data;

  return (
    <div className="workspace-page workspace-dashboard min-w-0 space-y-6">
      <header className="page-banner">
        <div className="dashboard-heading">
          <h1>Bienvenido de vuelta, {firstName}</h1>
          <BrandLogo className="dashboard-heading-logo" />
        </div>
        <p className="dashboard-date">{formatCurrentDate()}</p>
      </header>

      <section className="dashboard-shortcuts view-panel" aria-labelledby="quick-actions-title">
        <div className="view-panel-title">
          <h2 id="quick-actions-title" className="text-sm font-semibold uppercase text-brand-muted">Acciones rápidas</h2>
        </div>
        <div className="view-panel-body dashboard-quick-actions" data-action-count={quickActionCount}>
          {canCreateWorkOrder && (
            <Link to="/work-orders/new" className="primary-button" aria-label="Ingresar vehículo / Nueva OT">
              <Wrench className="h-4 w-4" aria-hidden="true" />
              Nueva OT
            </Link>
          )}
          {canCreateQuotation && (
            <Link to="/quotations/new" className="primary-button" aria-label="Nueva cotización">
              <FilePlus2 className="h-4 w-4" aria-hidden="true" />
              Cotización
            </Link>
          )}
          {canCreateClient && (
            <button type="button" className="secondary-button inline-flex items-center gap-2 text-sm font-medium text-brand-ink transition-colors hover:border-brand-primary hover:text-brand-primaryInk" aria-label="Dar de alta cliente" onClick={() => setShowClientForm(true)}>
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Cliente
            </button>
          )}
          <div className="dashboard-quick-search">
            <QuickVehicleSearch
              presentation="dashboard"
              placeholder="Patente, RUT o cliente"
              onSelectVehicle={(vehicle) => navigate(`/vehicles?search=${encodeURIComponent(vehicle.patente)}`)}
              onSelectClient={(client) => navigate(`/clients?search=${encodeURIComponent(client.rut ?? client.nombre)}`)}
            />
          </div>
        </div>
      </section>

      {dashboardQuery.isError && <div className="flex items-center justify-between gap-4 border border-brand-coral/30 bg-brand-coralPale p-4 text-sm text-brand-coralInk" role="alert"><span className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{getApiErrorMessage(dashboardQuery.error, 'No fue posible cargar el resumen operativo')}</span><button type="button" className="shrink-0 font-semibold underline" onClick={() => void dashboardQuery.refetch()}>Reintentar</button></div>}

      {dashboardQuery.isPending ? <DashboardSkeleton /> : summary && (
        <>
          <Stagger className="dashboard-metrics" aria-label="Indicadores principales">
            <StaggerItem className="dashboard-kpi"><KpiCard title="OTs en taller" value={String(summary.metrics.activeWorkOrders)} detail="Iniciadas o esperando repuesto" icon={Wrench} testId="active-work-orders" /></StaggerItem>
            <StaggerItem className="dashboard-kpi dashboard-kpi-amber"><KpiCard title="Esperando repuestos" value={String(summary.metrics.waitingForParts)} detail="Vehículos detenidos por piezas" icon={PackageX} testId="waiting-for-parts" /></StaggerItem>
            <StaggerItem className="dashboard-kpi dashboard-kpi-green"><KpiCard title="Recaudación del mes" value={formatClp(summary.metrics.monthlyRevenue)} detail="Pagos registrados desde el día 1" icon={Coins} testId="monthly-revenue" /></StaggerItem>
            <StaggerItem className="dashboard-kpi"><KpiCard title="Saldos por cobrar" value={formatClp(summary.metrics.pendingBalance)} detail={`${summary.metrics.pendingQuotations} cotización(es) pendientes`} icon={ReceiptText} testId="pending-balance" /></StaggerItem>
            <StaggerItem className={cn('dashboard-kpi', summary.lowStockCount > 0 ? 'dashboard-kpi-coral' : 'dashboard-kpi-green')}><KpiCard title="Alerta de stock" value={String(summary.lowStockCount)} detail="Repuestos entre 0 y 5 unidades" icon={PackageX} testId="low-stock-count" /></StaggerItem>
            <StaggerItem className="dashboard-kpi"><KpiCard title="COT sin OT" value={String(summary.metrics.quotationsWithoutWorkOrder)} detail="Pendientes de convertir a orden" icon={FileText} testId="quotations-without-work-order" /></StaggerItem>
          </Stagger>

          <OperationalInbox inbox={summary.operationalInbox} />

          <section className="dashboard-content-grid">
            <div className="view-panel dashboard-recent-work">
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
                <div className="data-scroll dashboard-table-wrap">
                  <table role="table" className="workspace-table data-table dashboard-recent-table">
                    <thead role="rowgroup">
                      <tr role="row"><th role="columnheader">Orden</th><th role="columnheader">Patente</th><th role="columnheader">Cliente</th><th role="columnheader">Estado</th><th role="columnheader">Ingreso</th><th role="columnheader" className="text-right">Detalle</th></tr>
                    </thead>
                    <tbody role="rowgroup">
                      {summary.recentWorkOrders.map((workOrder) => (
                        <tr role="row" key={workOrder.id}>
                          <td role="cell" data-label="Orden" className="nowrap font-semibold text-brand-ink">{workOrder.codigo}</td>
                          <td role="cell" data-label="Patente" className="nowrap text-brand-ink">{workOrder.vehicle?.patente ?? 'Sin vehículo'}</td>
                          <td role="cell" data-label="Cliente" className="max-w-44"><span className="block truncate text-brand-ink">{workOrder.client?.nombre ?? 'Sin cliente'}</span></td>
                          <td role="cell" data-label="Estado"><WorkOrderStatusBadge status={workOrder.estado} /></td>
                          <td role="cell" data-label="Ingreso" className="whitespace-nowrap text-brand-muted">{formatDate(workOrder.fechaIngreso)}</td>
                          <td role="cell" data-label="Detalle" className="text-right">
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
