import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock,
  LoaderCircle,
  PlayCircle,
  Timer,
  Wrench,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { PageLoader } from '../../components/common/LoadingIndicator';
import WorkOrderStatusBadge from '../../components/work-orders/WorkOrderStatusBadge';
import { useMyLaborWorkOrders } from '../../hooks/useWorkOrderLabor';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatDate } from '../../lib/formatters';

import type { MyLaborOrder } from '../../types/entities';

const formatHours = (value: number): string => `${value.toFixed(2)} h`;

const OrderCard = ({ order }: { order: MyLaborOrder }) => {
  const total = order.items;
  const percent = total > 0 ? Math.round((order.completados / total) * 100) : 0;

  return (
    <Link
      to={`/work-orders/${order.id}/ficha`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-brand-line bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-primary"
    >
      <div className="h-1 w-full bg-brand-primaryInk/80" aria-hidden="true" />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-lg font-black text-brand-primaryInk">{order.codigo}</p>
            <p className="mt-1 text-xs font-semibold text-brand-muted">
              Ingreso {formatDate(order.fechaIngreso)}
            </p>
          </div>
          <WorkOrderStatusBadge status={order.estado} />
        </div>

        <div>
          <p className="font-mono text-2xl font-black leading-tight tracking-widest text-slate-900">
            {order.patente ?? 'SIN PATENTE'}
          </p>
          <p className="mt-0.5 truncate text-xs font-medium text-brand-muted">
            {[order.marca, order.modelo].filter(Boolean).join(' ') || 'Vehículo sin datos'}
          </p>
        </div>

        {order.activeItemId !== null && order.activeItemDescripcion && (
          <div className="flex items-center gap-2 rounded-lg bg-brand-primary/5 px-3 py-2 text-xs font-semibold text-brand-primaryInk">
            <Timer className="h-4 w-4 shrink-0 animate-pulse" aria-hidden="true" />
            <span className="min-w-0 truncate">
              En curso: {order.activeItemDescripcion}
            </span>
          </div>
        )}

        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-brand-pale">
          <div className="bg-white px-3 py-2">
            <p className="text-[9px] font-bold uppercase tracking-wide text-brand-muted">Trabajos</p>
            <p className="text-sm font-bold text-brand-ink">{order.completados}/{total}</p>
          </div>
          <div className="bg-white px-3 py-2">
            <p className="text-[9px] font-bold uppercase tracking-wide text-brand-muted">Estimadas</p>
            <p className="text-sm font-bold text-brand-ink">{formatHours(order.horasEstimadas)}</p>
          </div>
          <div className="bg-white px-3 py-2">
            <p className="text-[9px] font-bold uppercase tracking-wide text-brand-muted">Reales</p>
            <p className="text-sm font-bold text-brand-goldInk">{formatHours(order.horasReales)}</p>
          </div>
        </div>

        <div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand-pale">
            <div
              className="h-full rounded-full bg-brand-mintInk"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs font-bold text-brand-primaryInk">
          <span className="inline-flex items-center gap-1">
            <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
            Abrir ficha de trabajo
          </span>
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </div>
      </div>
    </Link>
  );
};

export const MyWorkOrdersPage = () => {
  const query = useMyLaborWorkOrders();

  if (query.isPending) {
    return <PageLoader label="Cargando tus órdenes asignadas..." />;
  }

  if (query.isError) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-brand-coral/30 bg-brand-coralPale p-5 text-sm text-brand-coralInk" role="alert">
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {getApiErrorMessage(query.error, 'No se pudieron cargar tus órdenes de trabajo.')}
      </div>
    );
  }

  const orders = query.data ?? [];
  const activeOrders = orders.filter((order) => order.activeItemId !== null);
  const pendingOrders = orders.filter((order) => order.activeItemId === null);
  const totalHoras = orders.reduce((sum, order) => sum + order.horasReales, 0);

  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-brand-muted">Ficha de taller</p>
          <h1 className="mt-1 text-2xl font-bold text-brand-primaryInk sm:text-3xl">Mis órdenes asignadas</h1>
          <p className="mt-1 text-sm text-brand-muted">
            Tienes {orders.length} orden(es) activas · {formatHours(totalHoras)} registradas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-mintPale px-3 py-1.5 text-brand-mintInk">
            <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />
            {activeOrders.length} en curso
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-pale px-3 py-1.5 text-brand-primaryInk">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {pendingOrders.length} sin cronómetro activo
          </span>
        </div>
      </header>

      {orders.length === 0 ? (
        <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-brand-line bg-white px-4 text-center">
          <ClipboardList className="h-10 w-10 text-brand-line" aria-hidden="true" />
          <p className="mt-3 font-semibold text-brand-ink">No tienes órdenes asignadas</p>
          <p className="mt-1 text-sm text-brand-muted">
            Cuando el jefe de taller te asigne un trabajo aparecerá aquí.
          </p>
        </div>
      ) : (
        <>
          {activeOrders.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-brand-ink">
                <Timer className="h-4 w-4 text-brand-primaryInk" aria-hidden="true" />
                Con trabajo en curso
              </h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {activeOrders.map((order) => (
                  <OrderCard key={order.id} order={order} />
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-brand-ink">
              <CheckCircle2 className="h-4 w-4 text-brand-primaryInk" aria-hidden="true" />
              {activeOrders.length > 0 ? 'Otras órdenes' : 'Órdenes asignadas'}
            </h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {pendingOrders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          </section>
        </>
      )}

      {query.isFetching && (
        <p className="flex items-center gap-2 text-xs font-semibold text-brand-muted" role="status">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Actualizando...
        </p>
      )}
    </div>
  );
};

export default MyWorkOrdersPage;
