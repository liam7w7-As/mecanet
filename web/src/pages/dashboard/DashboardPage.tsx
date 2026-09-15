import {
  AlertCircle,
  ArrowRight,
  Coins,
  FilePlus2,
  PackageX,
  ReceiptText,
  UserPlus,
  Wrench,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import StockAdjustmentModal from '../../components/catalog/StockAdjustmentModal';
import ClientFormModal from '../../components/clients/ClientFormModal';
import QuickVehicleSearch from '../../components/common/QuickVehicleSearch';
import WorkOrderStatusBadge from '../../components/work-orders/WorkOrderStatusBadge';
import { useDashboardSummary } from '../../hooks/useDashboard';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDate } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';

import type { DashboardSummary } from '@unithor/shared';
import type { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  iconClassName: string;
  testId: string;
}

const KpiCard = ({ title, value, detail, icon: Icon, iconClassName, testId }: KpiCardProps) => (
  <article className="min-h-36 border border-slate-200 bg-white p-4">
    <div className="flex items-start justify-between gap-3">
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconClassName}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
    </div>
    <p className="mt-4 text-2xl font-bold text-brand-blue" data-testid={testId}>{value}</p>
    <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
  </article>
);

const DashboardSkeleton = () => (
  <div className="space-y-5" aria-label="Cargando resumen del dashboard">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {Array.from({ length: 5 }, (_, index) => <div key={index} className="h-36 animate-pulse border border-slate-200 bg-white p-4"><div className="h-4 w-28 rounded bg-slate-100" /><div className="mt-8 h-7 w-20 rounded bg-slate-100" /><div className="mt-3 h-3 w-36 rounded bg-slate-100" /></div>)}
    </div>
    <div className="grid gap-5 xl:grid-cols-[3fr_2fr]"><div className="h-80 animate-pulse border border-slate-200 bg-white" /><div className="h-80 animate-pulse border border-slate-200 bg-white" /></div>
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
  const canAdjustStock = Boolean(user && (hasUserPermission(user, 'taller', 'update') || hasUserPermission(user, 'admin', 'update')));
  const summary = dashboardQuery.data;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Panel operativo</p>
          <h1 className="mt-1 text-2xl font-bold text-brand-blue sm:text-3xl">Bienvenido de vuelta, {firstName}</h1>
        </div>
        <p className="text-sm font-medium text-slate-500">{formatCurrentDate()}</p>
      </header>

      <section className="border-y border-slate-200 bg-white px-4 py-4" aria-labelledby="quick-actions-title">
        <h2 id="quick-actions-title" className="mb-3 text-sm font-semibold uppercase text-slate-500">Acciones rápidas</h2>
        <div className="grid gap-3 lg:grid-cols-[auto_auto_auto_minmax(260px,1fr)]">
          {canCreateWorkOrder && <Link to="/work-orders/new" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-dark"><Wrench className="h-4 w-4" aria-hidden="true" />Ingresar vehículo / Nueva OT</Link>}
          {canCreateQuotation && <Link to="/quotations/new" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-yellow px-4 text-sm font-bold text-brand-dark hover:bg-yellow-400"><FilePlus2 className="h-4 w-4" aria-hidden="true" />Nueva cotización</Link>}
          {canCreateClient && <button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-brand-blue hover:bg-slate-50" onClick={() => setShowClientForm(true)}><UserPlus className="h-4 w-4" aria-hidden="true" />Dar de alta cliente</button>}
          <QuickVehicleSearch
            placeholder="Consultar patente, RUT o cliente"
            onSelectVehicle={(vehicle) => navigate(`/vehicles?search=${encodeURIComponent(vehicle.patente)}`)}
            onSelectClient={(client) => navigate(`/clients?search=${encodeURIComponent(client.rut ?? client.nombre)}`)}
          />
        </div>
      </section>

      {dashboardQuery.isError && <div className="flex items-center justify-between gap-4 border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert"><span className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{getApiErrorMessage(dashboardQuery.error, 'No fue posible cargar el resumen operativo')}</span><button type="button" className="shrink-0 font-semibold underline" onClick={() => void dashboardQuery.refetch()}>Reintentar</button></div>}

      {dashboardQuery.isPending ? <DashboardSkeleton /> : summary && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Indicadores principales">
            <KpiCard title="OTs en taller" value={String(summary.metrics.activeWorkOrders)} detail="En progreso o esperando repuesto" icon={Wrench} iconClassName="bg-blue-100 text-brand-blue" testId="active-work-orders" />
            <KpiCard title="Esperando repuestos" value={String(summary.metrics.waitingForParts)} detail="Vehículos detenidos por piezas" icon={PackageX} iconClassName="bg-amber-100 text-amber-800" testId="waiting-for-parts" />
            <KpiCard title="Recaudación del mes" value={formatClp(summary.metrics.monthlyRevenue)} detail="Pagos registrados desde el día 1" icon={Coins} iconClassName="bg-yellow-100 text-yellow-800" testId="monthly-revenue" />
            <KpiCard title="Saldos por cobrar" value={formatClp(summary.metrics.pendingBalance)} detail={`${summary.metrics.pendingQuotations} cotización(es) pendientes`} icon={ReceiptText} iconClassName="bg-red-100 text-red-700" testId="pending-balance" />
            <KpiCard title="Alerta de stock" value={String(summary.lowStockCount)} detail="Repuestos entre 0 y 5 unidades" icon={PackageX} iconClassName={summary.lowStockCount > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'} testId="low-stock-count" />
          </section>

          <section className="grid gap-5 xl:grid-cols-[3fr_2fr]">
            <div className="overflow-hidden border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-5">
                <div><h2 className="font-semibold text-brand-blue">Últimos trabajos en taller</h2><p className="mt-0.5 text-xs text-slate-500">Órdenes creadas o actualizadas recientemente</p></div>
                <Link to="/work-orders" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-blue hover:underline">Ver todas <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              </div>
              {summary.recentWorkOrders.length === 0 ? <p className="px-5 py-12 text-center text-sm text-slate-500">Aún no hay órdenes de trabajo registradas.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[660px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3 font-semibold">Orden</th><th className="px-4 py-3 font-semibold">Patente</th><th className="px-4 py-3 font-semibold">Cliente</th><th className="px-4 py-3 font-semibold">Estado</th><th className="px-4 py-3 font-semibold">Ingreso</th><th className="px-4 py-3 text-right font-semibold">Detalle</th></tr></thead>
                    <tbody>{summary.recentWorkOrders.map((workOrder) => <tr key={workOrder.id} className="border-t border-slate-100 hover:bg-slate-50/70"><td className="px-4 py-3 font-mono font-bold text-brand-blue">{workOrder.codigo}</td><td className="px-4 py-3 font-mono font-semibold text-slate-700">{workOrder.vehicle?.patente ?? 'Sin vehículo'}</td><td className="max-w-44 px-4 py-3"><span className="block truncate text-slate-700">{workOrder.client?.nombre ?? 'Sin cliente'}</span></td><td className="px-4 py-3"><WorkOrderStatusBadge status={workOrder.estado} /></td><td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDate(workOrder.fechaIngreso)}</td><td className="px-4 py-3 text-right"><Link to={`/work-orders/${workOrder.id}`} className="inline-flex h-8 items-center rounded-lg px-2 text-sm font-semibold text-brand-blue hover:bg-blue-50" aria-label={`Ver ${workOrder.codigo}`}>Ver</Link></td></tr>)}</tbody>
                  </table>
                </div>
              )}
            </div>

            <aside className="border border-slate-200 bg-white" aria-label="Alertas operativas">
              <section className="p-4 sm:p-5">
                <div className="flex items-center justify-between"><h2 className="font-semibold text-brand-blue">Inventario crítico</h2><span className={`rounded px-2 py-1 text-xs font-bold ${summary.lowStockCount > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{summary.lowStockCount} alerta(s)</span></div>
                <div className="mt-3 divide-y divide-slate-100">
                  {summary.lowStockItems.length === 0 ? <p className="py-5 text-sm text-slate-500">No hay repuestos con stock crítico.</p> : summary.lowStockItems.map((item) => <div key={item.id} className="flex items-center gap-3 py-3"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${item.stock === 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{item.stock}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{item.nombre}</span><span className="block truncate font-mono text-xs text-slate-500">{item.codigo ?? 'Sin código'}</span></span>{canAdjustStock && <button type="button" className="h-8 rounded-lg px-2 text-xs font-semibold text-brand-blue hover:bg-blue-50" onClick={() => setStockItem(item)}>Ajustar</button>}</div>)}
                </div>
                <Link to="/catalog" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-blue hover:underline">Revisar inventario <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              </section>

              <section className="border-t border-slate-200 p-4 sm:p-5">
                <div className="flex items-center justify-between"><h2 className="font-semibold text-brand-blue">COT sin OT</h2><span className="rounded bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">{summary.metrics.quotationsWithoutWorkOrder} pendiente(s)</span></div>
                <div className="mt-3 divide-y divide-slate-100">
                  {summary.unlinkedQuotations.length === 0 ? <p className="py-5 text-sm text-slate-500">No hay cotizaciones pendientes de vincular.</p> : summary.unlinkedQuotations.map((quotation) => <Link key={quotation.id} to={`/quotations/${quotation.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-slate-50"><span className="min-w-0"><span className="block font-mono text-sm font-bold text-brand-blue">{quotation.codigo}</span><span className="block truncate text-xs text-slate-500">{quotation.client?.nombre ?? 'Sin cliente asignado'}</span></span><span className="whitespace-nowrap text-sm font-semibold text-slate-700">{formatClp(quotation.total)}</span></Link>)}
                </div>
              </section>
            </aside>
          </section>
        </>
      )}

      {showClientForm && <ClientFormModal onClose={() => setShowClientForm(false)} />}
      {stockItem && <StockAdjustmentModal item={stockItem} onClose={() => setStockItem(null)} />}
    </div>
  );
};

export default DashboardPage;
