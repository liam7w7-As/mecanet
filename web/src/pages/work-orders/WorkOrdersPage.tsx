import { WORK_ORDER_STATUS, isValidWorkOrderTransition } from '@unithor/shared';
import {
  AlertCircle,
  Car,
  ClipboardList,
  Download,
  Eye,
  ListChecks,
  LoaderCircle,
  PackageCheck,
  Plus,
  Search,
  Timer,
  UserRound,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { AnimateIcon, AnimatedCard, Stagger, StaggerItem } from '../../components/animate-ui';
import Pagination from '../../components/common/Pagination';
import PdfPreviewModal from '../../components/common/PdfPreviewModal';
import CancelStatusModal from '../../components/work-orders/CancelStatusModal';
import WorkOrderStatusBadge, { WORK_ORDER_STATUS_LABELS } from '../../components/work-orders/WorkOrderStatusBadge';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import {
  useChangeWorkOrderStatusMutation,
  useWorkOrder,
  useWorkOrders,
} from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDate, formatDateTime } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import {
  PROGRESS_TIER_STYLES,
  TASK_DOT_STYLES,
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

const TASK_STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  completado: 'Completada',
  omitido: 'Omitida',
};

const getEstimatedTotal = (workOrder: WorkOrder): number | null =>
  workOrder.items
    ? workOrder.items.reduce((total, item) => total + Number(item.subtotal), 0)
    : null;

const WorkOrdersSkeleton = () => (
  <>
    {Array.from({ length: 6 }, (_, index) => (
      <div key={index} className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="h-5 w-32 animate-pulse rounded bg-slate-100" />
          <div className="h-6 w-24 animate-pulse rounded-full bg-slate-100" />
        </div>
        <div className="mt-3 h-4 w-40 animate-pulse rounded bg-slate-100" />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
        </div>
        <div className="mt-3 h-16 animate-pulse rounded-lg bg-slate-100" />
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
  previewPending,
  onChangeStatus,
  onPreview,
}: {
  workOrder: WorkOrder;
  now: number;
  canManage: boolean;
  statusPending: boolean;
  previewPending: boolean;
  onChangeStatus: (workOrder: WorkOrder, nuevoEstado: WorkOrderStatus) => void;
  onPreview: () => void;
}) => {
  const progress = getWorkOrderProgress(workOrder);
  const tier = PROGRESS_TIER_STYLES[progress.tier];
  const elapsed = getElapsedInfo(workOrder, now);
  const estimatedTotal = getEstimatedTotal(workOrder);
  const validTransitions = WORK_ORDER_STATUS.filter((candidate) =>
    candidate !== 'entregada' &&
    isValidWorkOrderTransition(workOrder.estado, candidate),
  );
  const previewTasks = (workOrder.items ?? []).slice(0, 3);
  const remainingTasks = Math.max(0, (workOrder.items ?? []).length - previewTasks.length);

  return (
    <AnimatedCard className={`flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md ring-1 ring-inset ${tier.ring}`}>
      <div className={`h-1.5 w-full ${tier.bar}`} aria-hidden="true" />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <Link to={`/work-orders/${workOrder.id}`} className="font-mono text-lg font-bold text-brand-blue hover:underline">
              {workOrder.codigo}
            </Link>
            <p className="mt-0.5 text-xs text-slate-500">Ingreso {formatDate(workOrder.fechaIngreso)}</p>
          </div>
          <WorkOrderStatusBadge status={workOrder.estado} />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white" title={workOrder.fechaEntrega ? `Entrega prometida: ${formatDateTime(workOrder.fechaEntrega)}` : 'Sin fecha de entrega prometida'}>
            {elapsed.running && <span className="relative flex h-2 w-2" aria-hidden="true"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" /></span>}
            <Timer className="h-3 w-3" aria-hidden="true" />
            {elapsed.text}
          </span>
          {elapsed.overdue && (
            <span className="rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white" title={`Entrega prometida: ${formatDateTime(workOrder.fechaEntrega)}`}>
              Vencida
            </span>
          )}
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${tier.chip}`}>
            {progress.total === 0 ? tier.label : `${tier.label} · ${progress.percent}%`}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-slate-50 p-2.5">
            <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <UserRound className="h-3 w-3" aria-hidden="true" /> Cliente
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-800">{workOrder.client?.nombre ?? 'Sin cliente'}</p>
            <p className="text-xs text-slate-500">{workOrder.client?.rut ?? 'Sin identificación'}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-2.5">
            <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <Car className="h-3 w-3" aria-hidden="true" /> Vehículo
            </p>
            <p className="mt-1 font-mono text-sm font-bold text-slate-800">{workOrder.vehicle?.patente ?? 'Sin vehículo'}</p>
            <p className="truncate text-xs text-slate-500">{[workOrder.vehicle?.marca, workOrder.vehicle?.modelo].filter(Boolean).join(' ') || 'Sin datos'}</p>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-slate-100 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-500">
              <ListChecks className="h-3 w-3" aria-hidden="true" /> Tareas {progress.completed}/{progress.total}
            </p>
            {progress.inProgress > 0 && <span className="text-[11px] font-semibold text-amber-700">{progress.inProgress} en proceso</span>}
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-label={`Avance de ${workOrder.codigo}`}>
            <div className={`h-full rounded-full ${tier.bar}`} style={{ width: `${progress.percent}%` }} />
          </div>
          {previewTasks.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {previewTasks.map((item) => (
                <li key={item.id} className="flex items-center gap-2 text-xs">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${TASK_DOT_STYLES[item.estadoOperativo] ?? 'bg-slate-300'}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-slate-700">{item.descripcion}</span>
                  <span className="shrink-0 font-semibold text-slate-500">{TASK_STATUS_LABELS[item.estadoOperativo] ?? item.estadoOperativo}</span>
                </li>
              ))}
              {remainingTasks > 0 && <li className="text-[11px] font-semibold text-slate-400">+{remainingTasks} tareas más</li>}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-slate-400">Diagnóstico inicial, sin tareas cargadas.</p>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-500">Total estimado</p>
            <p className="text-base font-bold text-brand-blue">{estimatedTotal === null ? 'Ver detalle' : formatClp(estimatedTotal)}</p>
          </div>
          <div className="flex items-center gap-1">
            <Link to={`/work-orders/${workOrder.id}`} className="group flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-blue-50 hover:text-brand-blue" aria-label={`Ver ${workOrder.codigo}`} title="Ver detalle">
              <AnimateIcon variant="hover-lift" animateOnHover>
                <Eye className="h-4 w-4" aria-hidden="true" />
              </AnimateIcon>
            </Link>
            {canManage && (
              <select
                aria-label={`Cambiar estado de ${workOrder.codigo}`}
                className="h-9 max-w-32 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-600"
                value=""
                onChange={(event) => onChangeStatus(workOrder, event.target.value as WorkOrderStatus)}
                disabled={statusPending || validTransitions.length === 0}
              >
                <option value="">{workOrder.estado === 'finalizada' ? 'Entrega en detalle' : validTransitions.length === 0 ? 'Estado terminal' : 'Estado'}</option>
                {validTransitions.map((candidate) => <option key={candidate} value={candidate}>{WORK_ORDER_STATUS_LABELS[candidate]}</option>)}
              </select>
            )}
            {canManage && workOrder.estado === 'finalizada' && (
              <Link to={`/work-orders/${workOrder.id}`} className="group flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100" aria-label={`Registrar entrega de ${workOrder.codigo}`} title="Registrar entrega">
                <PackageCheck className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
            <button type="button" className="group flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50" onClick={onPreview} disabled={previewPending} aria-label={`Vista previa PDF de ${workOrder.codigo}`} title="Vista previa / Descargar PDF (mismo diseño)">
              {previewPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <AnimateIcon variant="bounce" animateOnHover>
                  <Download className="h-4 w-4" aria-hidden="true" />
                </AnimateIcon>
              )}
            </button>
          </div>
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
    <div className="space-y-5">
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
                    previewPending={previewQuery.isPending && previewWorkOrderId === workOrder.id}
                    onChangeStatus={changeStatus}
                    onPreview={() => setPreviewWorkOrderId(workOrder.id)}
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
