import { WORK_ORDER_STATUS, isValidWorkOrderTransition } from '@unithor/shared';
import {
  AlertCircle,
  ClipboardList,
  Download,
  Eye,
  ListChecks,
  Plus,
  ReceiptText,
  Search,
  UserCog,
  UserRound,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { AnimateIcon, AnimatedCard, Stagger, StaggerItem } from '../../components/animate-ui';
import Pagination from '../../components/common/Pagination';
import PdfPreviewModal from '../../components/common/PdfPreviewModal';
import CancelStatusModal from '../../components/work-orders/CancelStatusModal';
import WorkOrderQuickDetailModal from '../../components/work-orders/WorkOrderQuickDetailModal';
import WorkOrderStatusBadge, { WORK_ORDER_STATUS_LABELS } from '../../components/work-orders/WorkOrderStatusBadge';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import {
  useChangeWorkOrderStatusMutation,
  useWorkOrder,
  useWorkOrders,
} from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDate } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import {
  PROGRESS_TIER_STYLES,
  getElapsedInfo,
  getWorkOrderProgress,
  useNow,
} from '../../lib/work-order-progress';
import { useAuthStore } from '../../stores/auth.store';

import type { WorkOrder } from '../../types/entities';
import type { WorkOrderStatus } from '@unithor/shared';

type StatusFilter = WorkOrderStatus | 'all';

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'borrador', label: 'Borrador' },
  { value: 'en_progreso', label: 'En progreso' },
  { value: 'esperando_repuesto', label: 'Esperando repuesto' },
  { value: 'finalizada', label: 'Finalizadas' },
  { value: 'entregada', label: 'Entregadas' },
];

const getEstimatedTotal = (workOrder: WorkOrder): number | null =>
  workOrder.items
    ? workOrder.items.reduce((total, item) => total + Number(item.subtotal), 0)
    : null;

const WorkOrdersSkeleton = () => (
  <>
    {Array.from({ length: 6 }, (_, index) => (
      <div key={index} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="h-1 w-full animate-pulse bg-slate-100" />
        <div className="space-y-2.5 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="h-4 w-28 animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-16 animate-pulse rounded-full bg-slate-100" />
          </div>
          <div className="h-5 w-24 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-32 animate-pulse rounded bg-slate-100" />
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded bg-slate-100">
            {Array.from({ length: 3 }, (_, cell) => (
              <div key={cell} className="bg-white py-1.5 pl-3">
                <div className="h-2 w-10 rounded bg-slate-100" />
                <div className="mt-1 h-3.5 w-12 rounded bg-slate-100" />
              </div>
            ))}
          </div>
          <div className="h-1.5 w-full animate-pulse rounded-full bg-slate-100" />
        </div>
      </div>
    ))}
  </>
);

interface PendingCancellation {
  id: number;
  codigo: string;
}

const WorkOrderCard = ({
  workOrder,
  now,
  canManage,
  statusPending,
  onChangeStatus,
  onOpenDetail,
  onPreviewPdf,
}: {
  workOrder: WorkOrder;
  now: number;
  canManage: boolean;
  statusPending: boolean;
  onChangeStatus: (workOrder: WorkOrder, nuevoEstado: WorkOrderStatus) => void;
  onOpenDetail: () => void;
  onPreviewPdf: () => void;
}) => {
  const progress = getWorkOrderProgress(workOrder);
  const tier = PROGRESS_TIER_STYLES[progress.tier];
  const elapsed = getElapsedInfo(workOrder, now);
  const estimatedTotal = getEstimatedTotal(workOrder);
  const validTransitions = WORK_ORDER_STATUS.filter((candidate) =>
    candidate !== 'entregada' &&
    isValidWorkOrderTransition(workOrder.estado, candidate),
  );
  const vehicleLabel = [workOrder.vehicle?.marca, workOrder.vehicle?.modelo].filter(Boolean).join(' ');
  const quotation = workOrder.quotation ?? null;
  const paymentPercent = quotation && quotation.total > 0
    ? Math.min(100, Math.round((quotation.pagado / quotation.total) * 100))
    : 0;

  const stats = [
    {
      key: 'tiempo',
      label: 'En taller',
      value: elapsed.running
        ? elapsed.text.replace('En taller ', '')
        : elapsed.text.replace('Duración total: ', ''),
      tone: elapsed.overdue ? 'text-red-600' : 'text-slate-800',
    },
    {
      key: 'avance',
      label: 'Avance',
      value: progress.total === 0 ? '—' : `${progress.percent}%`,
      tone: progress.percent === 100 ? 'text-emerald-600' : 'text-brand-blue',
    },
    {
      key: 'total',
      label: 'Total est.',
      value: estimatedTotal === null ? '—' : formatClp(estimatedTotal),
      tone: 'text-brand-blue',
    },
  ];

  return (
    <AnimatedCard
      className={`group flex h-full flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-within:shadow-md ring-1 ring-inset ${tier.ring}`}
    >
      <div className={`h-1 w-full ${tier.bar}`} aria-hidden="true" />

      <div className="flex flex-1 flex-col">
        <div className="bg-gradient-to-br from-white via-slate-50 to-slate-100/80 px-3.5 pb-3 pt-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <button
                type="button"
                onClick={onOpenDetail}
                className="truncate font-mono text-sm font-black text-brand-blue underline-offset-4 hover:underline focus:outline-none focus-visible:underline"
                aria-label={`Ver detalle de ${workOrder.codigo}`}
              >
                {workOrder.codigo}
              </button>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">
                Ingreso {formatDate(workOrder.fechaIngreso)}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {elapsed.overdue && (
                <span className="rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">Vencida</span>
              )}
              <WorkOrderStatusBadge status={workOrder.estado} />
            </div>
          </div>

          <div className="mt-3 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-mono text-2xl font-black leading-none tracking-wide text-slate-950">
                {workOrder.vehicle?.patente ?? 'SIN PATENTE'}
              </p>
              <p className="mt-1 truncate text-xs font-medium text-slate-500">
                {vehicleLabel || 'Vehículo sin datos'}
              </p>
            </div>
            {workOrder.coberturaGarantia && (
              <span className="shrink-0 rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-black uppercase text-violet-800 ring-1 ring-violet-200">
                Garantía
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-3 border-y border-slate-100 px-3.5 py-2">
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-slate-600" title={workOrder.client?.nombre ?? undefined}>
            <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
            <span className="truncate font-semibold text-slate-700">{workOrder.client?.nombre ?? 'Sin cliente'}</span>
          </p>
          <p className="flex min-w-0 items-center gap-1.5 text-xs" title={workOrder.assignedMechanic?.nombre ?? undefined}>
            <UserCog
              className={`h-3.5 w-3.5 shrink-0 ${workOrder.assignedMechanic ? 'text-emerald-600' : 'text-amber-500'}`}
              aria-hidden="true"
            />
            <span className={`truncate ${workOrder.assignedMechanic ? 'font-semibold text-slate-700' : 'text-slate-400'}`}>
              {workOrder.assignedMechanic?.nombre ?? 'Sin mecánico'}
            </span>
          </p>
        </div>

        <div className="grid grid-cols-3 gap-px bg-slate-100">
          {stats.map((stat) => (
            <div key={stat.key} className="bg-white px-3.5 py-1.5">
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{stat.label}</p>
              <p className={`truncate text-sm font-bold leading-tight ${stat.tone}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="px-3.5 pb-2.5 pt-2">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
              <ListChecks className="h-3 w-3" aria-hidden="true" />
              Tareas {progress.completed}/{progress.total}
            </p>
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${tier.chip}`}>
              {progress.total === 0 ? tier.label : tier.label}
            </span>
          </div>
          <div
            className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
            aria-label={`Avance de ${workOrder.codigo}`}
          >
            <div className={`h-full rounded-full ${tier.bar}`} style={{ width: `${progress.percent}%` }} />
          </div>
        </div>

        <div className="border-t border-slate-100 px-3.5 py-2.5">
          {quotation ? (
            <div className="rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-blue/10 text-brand-blue">
                    <ReceiptText className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs font-black text-brand-blue">{quotation.codigo}</p>
                    <p className="text-[10px] font-semibold text-slate-500">
                      Pagado {formatClp(quotation.pagado)} de {formatClp(quotation.total)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-xs font-black ${quotation.saldoPendiente <= 0 ? 'text-emerald-600' : 'text-amber-700'}`}>
                    {quotation.saldoPendiente <= 0 ? 'Pagada' : formatClp(quotation.saldoPendiente)}
                  </p>
                  <p className="text-[10px] text-slate-400">saldo</p>
                </div>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full ${quotation.saldoPendiente <= 0 ? 'bg-emerald-500' : 'bg-brand-yellow'}`}
                  style={{ width: `${paymentPercent}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
              Sin cotización vinculada
            </div>
          )}
        </div>

        <div className="mt-auto flex items-center gap-1.5 border-t border-slate-100 px-3.5 py-2.5">
          <button
            type="button"
            onClick={onOpenDetail}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-blue px-3 text-xs font-bold text-white transition-colors hover:bg-brand-dark"
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            Ver detalle
          </button>
          <button
            type="button"
            onClick={onPreviewPdf}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-brand-blue transition-colors hover:bg-slate-50"
            aria-label={`Previsualizar PDF de ${workOrder.codigo}`}
            title="PDF"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
          </button>
          {canManage && (
            <select
              aria-label={`Cambiar estado de ${workOrder.codigo}`}
              className="h-9 max-w-28 rounded-lg border border-slate-300 bg-white px-1.5 text-[11px] font-bold text-slate-600"
              value=""
              onChange={(event) => onChangeStatus(workOrder, event.target.value as WorkOrderStatus)}
              disabled={statusPending || validTransitions.length === 0}
            >
              <option value="">
                {workOrder.estado === 'finalizada' ? 'Entrega' : validTransitions.length === 0 ? 'Terminal' : 'Estado'}
              </option>
              {validTransitions.map((candidate) => (
                <option key={candidate} value={candidate}>{WORK_ORDER_STATUS_LABELS[candidate]}</option>
              ))}
            </select>
          )}
        </div>
      </div>
    </AnimatedCard>
  );
};

export const WorkOrdersPage = () => {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [pendingCancellation, setPendingCancellation] = useState<PendingCancellation | null>(null);
  const [detailWorkOrderId, setDetailWorkOrderId] = useState<number | null>(null);
  const [previewWorkOrderId, setPreviewWorkOrderId] = useState<number | null>(null);
  const debouncedSearch = useDebouncedValue(search, 350);
  const user = useAuthStore((state) => state.user);
  const now = useNow();
  const workOrdersQuery = useWorkOrders({
    page,
    pageSize: 12,
    search: debouncedSearch || undefined,
    estado: status === 'all' ? undefined : status,
  });
  const statusMutation = useChangeWorkOrderStatusMutation();
  // Detalle completo para la vista previa: el diseño necesita
  // inspección, fotos y facturación además de los ítems de la lista.
  const previewQuery = useWorkOrder(previewWorkOrderId ?? 0);
  const canCreate = Boolean(user && hasUserPermission(user, 'taller', 'create'));
  const canUpdate = Boolean(user && hasUserPermission(user, 'taller', 'update'));
  const canManage = Boolean(canUpdate && user?.role !== 'mecanico');

  useEffect(() => setPage(1), [debouncedSearch, status]);

  const changeStatus = (workOrder: WorkOrder, nuevoEstado: WorkOrderStatus): void => {
    statusMutation.reset();
    if (nuevoEstado === 'cancelada') {
      setPendingCancellation({ id: workOrder.id, codigo: workOrder.codigo });
      return;
    }

    statusMutation.mutate({ id: workOrder.id, data: { nuevoEstado } });
  };

  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Operación de taller</p>
          <h1 className="mt-1 text-2xl font-bold text-brand-blue sm:text-3xl">{user?.role === 'mecanico' ? 'Mis órdenes asignadas' : 'Taller - Órdenes de Trabajo'}</h1>
        </div>
        {canCreate && (
          <Link to="/work-orders/new" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-yellow px-4 text-sm font-bold text-brand-dark shadow-sm transition-all hover:bg-yellow-400 hover:shadow-md">
            <AnimateIcon variant="spin" animateOnHover>
              <Plus className="h-4 w-4" aria-hidden="true" />
            </AnimateIcon>
            Nueva Orden de Trabajo
          </Link>
        )}
      </header>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" aria-label="Listado de órdenes de trabajo">
        <div className="border-b border-slate-200 p-4">
          <div className="relative max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm outline-none transition-shadow focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15" placeholder="Buscar código OT, patente o cliente" aria-label="Buscar órdenes de trabajo" />
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filtrar por estado">
            {STATUS_FILTERS.map((filter) => {
              const isSelected = status === filter.value;
              return (
                <button
                  key={filter.value}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  className={`relative min-h-9 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors ${
                    isSelected ? 'text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                  onClick={() => setStatus(filter.value)}
                >
                  {isSelected && (
                    <motion.span
                      layoutId="workOrdersStatusPill"
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

        {(workOrdersQuery.isError || statusMutation.isError || previewQuery.isError) && (
          <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {getApiErrorMessage(workOrdersQuery.error ?? statusMutation.error ?? previewQuery.error, 'No fue posible completar la operación.')}
          </div>
        )}

        <div className="bg-slate-50/60 p-4">
          {workOrdersQuery.isPending ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <WorkOrdersSkeleton />
            </div>
          ) : (workOrdersQuery.data?.items.length ?? 0) === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center px-4 text-center">
              <ClipboardList className="h-10 w-10 text-slate-300" aria-hidden="true" />
              <p className="mt-3 font-semibold text-slate-700">No se encontraron órdenes de trabajo</p>
              <p className="mt-1 text-sm text-slate-500">Cambie los filtros o registre el primer ingreso del taller.</p>
            </div>
          ) : (
            <Stagger className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" stagger={0.05}>
              {workOrdersQuery.data?.items.map((workOrder) => (
                <StaggerItem key={workOrder.id}>
                  <WorkOrderCard
                    workOrder={workOrder}
                    now={now}
                    canManage={canManage}
                    statusPending={statusMutation.isPending}
                    onChangeStatus={changeStatus}
                    onOpenDetail={() => setDetailWorkOrderId(workOrder.id)}
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

      {detailWorkOrderId !== null && (
        <WorkOrderQuickDetailModal
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
    </div>
  );
};

export default WorkOrdersPage;
