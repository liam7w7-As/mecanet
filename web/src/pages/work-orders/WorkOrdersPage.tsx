import {
  AlertCircle,
  ClipboardList,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Stagger, StaggerItem } from '../../components/animate-ui';
import ListExportButtons from '../../components/common/ListExportButtons';
import Pagination from '../../components/common/Pagination';
import PdfPreviewModal from '../../components/common/PdfPreviewModal';
import CancelStatusModal from '../../components/work-orders/CancelStatusModal';
import MechanicOverview from '../../components/work-orders/MechanicOverview';
import RevertStatusModal from '../../components/work-orders/RevertStatusModal';
import WorkOrderCard from '../../components/work-orders/WorkOrderCard';
import WorkOrderDeliveryModal from '../../components/work-orders/WorkOrderDeliveryModal';
import WorkOrderFilters from '../../components/work-orders/WorkOrderFilters';
import WorkOrderQuickDetailModal from '../../components/work-orders/WorkOrderQuickDetailModal';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import {
  useChangeWorkOrderStatusMutation,
  useWorkOrder,
  useWorkOrders,
} from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import { hasUserPermission } from '../../lib/permissions';
import { useNow } from '../../lib/work-order-progress';
import { useAuthStore } from '../../stores/auth.store';
import { notifyError } from '../../stores/toast.store';

import type { WorkOrderCardExpansion } from '../../components/work-orders/WorkOrderCard';
import type { WorkOrderDateFilter as DateFilter, WorkOrderStatusFilter as StatusFilter } from '../../components/work-orders/WorkOrderFilters';
import type { WorkOrder } from '../../types/entities';
import type { WorkOrderStatus } from '@unithor/shared';

const getDateRange = (period: DateFilter, month: string, date: string, now: number) => {
  if (period === 'all' || (period === 'month' && !month)) return {};
  if (period === 'date') return date ? { fechaDesde: date, fechaHasta: date } : {};
  if (period === 'month') {
    const [year, monthNumber] = month.split('-').map(Number);
    return {
      fechaDesde: `${month}-01`,
      fechaHasta: new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10),
    };
  }
  const end = new Date(now);
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - (period === '3_days' ? 2 : 14));
  return {
    fechaDesde: start.toISOString().slice(0, 10),
    fechaHasta: end.toISOString().slice(0, 10),
  };
};

const WorkOrdersSkeleton = () => (
  <>
    {Array.from({ length: 6 }, (_, index) => (
      <div key={index} className="overflow-hidden rounded-xl border border-brand-line bg-white">
        <div className="h-1 w-full animate-pulse bg-brand-pale" />
        <div className="space-y-2.5 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="h-4 w-28 animate-pulse rounded bg-brand-pale" />
            <div className="h-4 w-16 animate-pulse rounded-full bg-brand-pale" />
          </div>
          <div className="h-5 w-24 animate-pulse rounded bg-brand-pale" />
          <div className="h-3 w-32 animate-pulse rounded bg-brand-pale" />
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded bg-brand-pale">
            {Array.from({ length: 3 }, (_, cell) => (
              <div key={cell} className="bg-white py-1.5 pl-3">
                <div className="h-2 w-10 rounded bg-brand-pale" />
                <div className="mt-1 h-3.5 w-12 rounded bg-brand-pale" />
              </div>
            ))}
          </div>
          <div className="h-1.5 w-full animate-pulse rounded-full bg-brand-pale" />
        </div>
      </div>
    ))}
  </>
);

interface PendingCancellation {
  id: number;
  codigo: string;
}

interface PendingRevert {
  id: number;
  codigo: string;
  fromStatus: WorkOrderStatus;
  toStatus: WorkOrderStatus;
}

// Status progression order for regression detection
const STATUS_ORDER: WorkOrderStatus[] = [
  'en_progreso',
  'esperando_repuesto',
  'finalizada',
  'entregada',
];

const isStatusRegression = (from: WorkOrderStatus, to: WorkOrderStatus): boolean => {
  const fi = STATUS_ORDER.indexOf(from);
  const ti = STATUS_ORDER.indexOf(to);
  return fi > ti && fi !== -1 && ti !== -1;
};

export const WorkOrdersPage = ({ personalOverview = false }: { personalOverview?: boolean }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [cardExpansion, setCardExpansion] = useState<WorkOrderCardExpansion>(null);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [period, setPeriod] = useState<DateFilter>('all');
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState('');
  const [page, setPage] = useState(1);
  const [pendingCancellation, setPendingCancellation] = useState<PendingCancellation | null>(null);
  const [pendingRevert, setPendingRevert] = useState<PendingRevert | null>(null);
  const [detailWorkOrderId, setDetailWorkOrderId] = useState<number | null>(null);
  const [detailView, setDetailView] = useState<'summary' | 'execution' | 'prices'>('summary');
  useEffect(() => {
    const requested = Number(searchParams.get('manage'));
    if (!Number.isInteger(requested) || requested <= 0) return;
    setDetailWorkOrderId(requested);
    setDetailView(searchParams.get('manageView') === 'prices' ? 'prices' : 'execution');
    const next = new URLSearchParams(searchParams);
    next.delete('manage');
    next.delete('manageView');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const [previewWorkOrderId, setPreviewWorkOrderId] = useState<number | null>(null);
  const [deliveryWorkOrderId, setDeliveryWorkOrderId] = useState<number | null>(null);
  const debouncedSearch = useDebouncedValue(search, 350);
  const user = useAuthStore((state) => state.user);
  const isAdmin = Boolean(user && ['desarrollador', 'admin'].includes(user.role));
  const now = useNow();
  const { fechaDesde, fechaHasta } = getDateRange(period, selectedMonth, selectedDate, now);
  const filters = {
    page,
    pageSize: 12,
    search: debouncedSearch || undefined,
    estado: status === 'all' ? undefined : status,
    fechaDesde,
    fechaHasta,
  } satisfies Parameters<typeof useWorkOrders>[0];
  const workOrdersQuery = useWorkOrders(filters);
  const statusMutation = useChangeWorkOrderStatusMutation();
  // Detalle completo para la vista previa: el diseño necesita
  // inspección, fotos y facturación además de los ítems de la lista.
  const previewQuery = useWorkOrder(previewWorkOrderId ?? 0);
  const deliveryQuery = useWorkOrder(deliveryWorkOrderId ?? 0);
  const canCreate = Boolean(user && hasUserPermission(user, 'taller', 'create'));
  const canUpdate = Boolean(user && hasUserPermission(user, 'taller', 'update'));
  const canManage = Boolean(canUpdate && user?.role !== 'mecanico');

  useEffect(() => { setPage(1); setCardExpansion(null); }, [debouncedSearch, status, fechaDesde, fechaHasta]);
  useEffect(() => setCardExpansion(null), [page]);

  const changeStatus = (workOrder: WorkOrder, nuevoEstado: WorkOrderStatus): void => {
    statusMutation.reset();
    if (nuevoEstado === 'cancelada') {
      setPendingCancellation({ id: workOrder.id, codigo: workOrder.codigo });
      return;
    }

    // Backward transitions require admin role + mandatory justification
    if (isStatusRegression(workOrder.estado, nuevoEstado)) {
      if (!isAdmin) {
        notifyError('Solo un administrador puede devolver la orden a un estado anterior.');
        return;
      }
      setPendingRevert({
        id: workOrder.id,
        codigo: workOrder.codigo,
        fromStatus: workOrder.estado,
        toStatus: nuevoEstado,
      });
      return;
    }

    statusMutation.mutate({ id: workOrder.id, data: { nuevoEstado } });
  };

  return (
    <div className="workshop-board min-w-0 space-y-5">
      <header className="workshop-board-heading flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          {personalOverview && <p className="workshop-role-caption">Mi taller · {user?.nombre}</p>}
          <h1 className="text-2xl font-semibold text-brand-primaryInk sm:text-3xl" aria-label={user?.role === 'mecanico' ? 'Mis órdenes asignadas' : 'Taller y Órdenes de trabajo'}>
            <span className="workshop-heading-desktop">{user?.role === 'mecanico' ? 'Mis órdenes asignadas' : 'Taller y Órdenes de trabajo'}</span>
            <span className="workshop-heading-mobile">{user?.role === 'mecanico' ? 'Mis órdenes' : 'Taller'}</span>
          </h1>
        </div>
        <ListExportButtons
          target="work-orders"
          filters={filters}
          disabled={workOrdersQuery.isPending || workOrdersQuery.isError}
          className="self-end"
        />
      </header>

      {personalOverview && <MechanicOverview />}

      <section className="workshop-list" aria-label="Listado de órdenes de trabajo">
        <WorkOrderFilters
          search={search}
          onSearch={setSearch}
          status={status}
          onStatus={setStatus}
          period={period}
          onPeriod={(next) => { setPage(1); if (next !== 'date') setSelectedDate(''); setPeriod(next); }}
          selectedMonth={selectedMonth}
          onMonth={(month) => { setPage(1); setSelectedMonth(month); }}
          selectedDate={selectedDate}
          onDate={(date) => { setPage(1); setSelectedDate(date); setPeriod(date ? 'date' : 'all'); }}
          canCreate={canCreate}
        />

        {(workOrdersQuery.isError || statusMutation.isError || previewQuery.isError || deliveryQuery.isError) && (
          <div className="flex items-center gap-2 border-b border-brand-coral/30 bg-brand-coralPale px-4 py-3 text-sm text-brand-coralInk" role="alert">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {getApiErrorMessage(workOrdersQuery.error ?? statusMutation.error ?? previewQuery.error ?? deliveryQuery.error, 'No fue posible completar la operación.')}
          </div>
        )}

        <div className="workshop-canvas">
          {workOrdersQuery.isPending ? (
            <div className="workshop-card-grid">
              <WorkOrdersSkeleton />
            </div>
          ) : (workOrdersQuery.data?.items.length ?? 0) === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center px-4 text-center">
              <ClipboardList className="h-10 w-10 text-brand-line" aria-hidden="true" />
              <p className="mt-3 font-semibold text-brand-ink">No se encontraron órdenes de trabajo</p>
              <p className="mt-1 text-sm text-brand-muted">{user?.role === 'mecanico' ? 'Revisa los filtros. Aquí aparecerán las OT que te asignen como responsable o por servicio.' : 'Cambie los filtros o registre el primer ingreso del taller.'}</p>
            </div>
          ) : (
            <Stagger className="workshop-card-grid" stagger={0.05}>
              {workOrdersQuery.data?.items.map((workOrder) => (
                <StaggerItem key={workOrder.id}>
                  <WorkOrderCard
                    workOrder={workOrder}
                    now={now}
                    expansion={cardExpansion}
                    onExpand={setCardExpansion}
                    showFinancials={user?.role !== 'mecanico'}
                    canManage={canManage}
                    statusPending={statusMutation.isPending}
                    onChangeStatus={changeStatus}
                    onDeliver={() => setDeliveryWorkOrderId(workOrder.id)}
                    onOpenDetail={() => { setDetailView('summary'); setDetailWorkOrderId(workOrder.id); }}
                    onOpenExecution={user && (['desarrollador', 'admin', 'jefe'].includes(user.role) || (user.role === 'mecanico' && (workOrder.assignedMechanicId === user.id || workOrder.items?.some((item) => item.assignedUserId === user.id))))
                      ? () => { setDetailView('execution'); setDetailWorkOrderId(workOrder.id); }
                      : undefined}
                    onPreviewPdf={() => setPreviewWorkOrderId(workOrder.id)}
                  />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>

        <Pagination page={page} totalPages={workOrdersQuery.data?.totalPages ?? 0} total={workOrdersQuery.data?.total ?? 0} onPageChange={setPage} />
      </section>

      {pendingCancellation && (
        <CancelStatusModal
          codigo={pendingCancellation.codigo}
          isPending={statusMutation.isPending}
          errorMessage={statusMutation.isError ? getApiErrorMessage(statusMutation.error) : null}
          onClose={() => setPendingCancellation(null)}
          onConfirm={(motivo) => statusMutation.mutate(
            { id: pendingCancellation.id, data: { nuevoEstado: 'cancelada', motivo } },
            { onSuccess: () => setPendingCancellation(null) },
          )}
        />
      )}

      {pendingRevert && (
        <RevertStatusModal
          codigo={pendingRevert.codigo}
          fromStatus={pendingRevert.fromStatus}
          toStatus={pendingRevert.toStatus}
          isPending={statusMutation.isPending}
          errorMessage={statusMutation.isError ? getApiErrorMessage(statusMutation.error) : null}
          onClose={() => { setPendingRevert(null); statusMutation.reset(); }}
          onConfirm={(motivo) => statusMutation.mutate(
            { id: pendingRevert.id, data: { nuevoEstado: pendingRevert.toStatus, motivo } },
            { onSuccess: () => setPendingRevert(null) },
          )}
        />
      )}

      {detailWorkOrderId !== null && (
        <WorkOrderQuickDetailModal
          initialView={detailView}
          workOrderId={detailWorkOrderId}
          onClose={() => setDetailWorkOrderId(null)}
          onPreviewPdf={(workOrder) => {
            setDetailWorkOrderId(null);
            setPreviewWorkOrderId(workOrder.id);
          }}
        />
      )}

      {previewWorkOrderId !== null && previewQuery.data && (
        <PdfPreviewModal
          type="work-order"
          workOrder={previewQuery.data}
          onClose={() => setPreviewWorkOrderId(null)}
        />
      )}

      {deliveryWorkOrderId !== null && deliveryQuery.data && (
        <WorkOrderDeliveryModal
          workOrder={deliveryQuery.data}
          onClose={() => setDeliveryWorkOrderId(null)}
        />
      )}
    </div>
  );
};

export default WorkOrdersPage;
