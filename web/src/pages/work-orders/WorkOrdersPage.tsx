import { WORK_ORDER_STATUS, isValidWorkOrderTransition } from '@unithor/shared';
import {
  AlertCircle,
  ClipboardList,
  Download,
  Eye,
  LoaderCircle,
  Plus,
  Search,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import Pagination from '../../components/common/Pagination';
import CancelStatusModal from '../../components/work-orders/CancelStatusModal';
import WorkOrderStatusBadge, { WORK_ORDER_STATUS_LABELS } from '../../components/work-orders/WorkOrderStatusBadge';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import {
  useChangeWorkOrderStatusMutation,
  useDownloadWorkOrderPdf,
  useWorkOrders,
} from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDate } from '../../lib/formatters';
import { hasRolePermission } from '../../lib/permissions';
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
      <tr key={index} className="border-b border-slate-100">
        {Array.from({ length: 7 }, (_, cellIndex) => (
          <td key={cellIndex} className="px-4 py-4"><div className="h-4 animate-pulse rounded bg-slate-100" /></td>
        ))}
      </tr>
    ))}
  </>
);

interface PendingCancellation {
  id: number;
  codigo: string;
}

export const WorkOrdersPage = () => {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [pendingCancellation, setPendingCancellation] = useState<PendingCancellation | null>(null);
  const debouncedSearch = useDebouncedValue(search, 350);
  const user = useAuthStore((state) => state.user);
  const workOrdersQuery = useWorkOrders({
    page,
    pageSize: 20,
    search: debouncedSearch || undefined,
    estado: status === 'all' ? undefined : status,
  });
  const statusMutation = useChangeWorkOrderStatusMutation();
  const pdfMutation = useDownloadWorkOrderPdf();
  const canCreate = Boolean(user && hasRolePermission(user.role, 'taller', 'create'));
  const canUpdate = Boolean(user && hasRolePermission(user.role, 'taller', 'update'));

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
          <h1 className="mt-1 text-2xl font-bold text-brand-blue sm:text-3xl">Taller - Órdenes de Trabajo</h1>
        </div>
        {canCreate && (
          <Link to="/work-orders/new" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-yellow px-4 text-sm font-bold text-brand-dark hover:bg-yellow-400">
            <Plus className="h-4 w-4" aria-hidden="true" /> Nueva Orden de Trabajo
          </Link>
        )}
      </header>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white" aria-label="Listado de órdenes de trabajo">
        <div className="border-b border-slate-200 p-4">
          <div className="relative max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15" placeholder="Buscar código OT, patente o cliente" aria-label="Buscar órdenes de trabajo" />
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filtrar por estado">
            {STATUS_FILTERS.map((filter) => (
              <button key={filter.value} type="button" role="tab" aria-selected={status === filter.value} className={`min-h-9 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition ${status === filter.value ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`} onClick={() => setStatus(filter.value)}>{filter.label}</button>
            ))}
          </div>
        </div>

        {(workOrdersQuery.isError || statusMutation.isError || pdfMutation.isError) && (
          <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {getApiErrorMessage(workOrdersQuery.error ?? statusMutation.error ?? pdfMutation.error, 'No fue posible completar la operación.')}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3 font-semibold">Código OT</th><th className="px-4 py-3 font-semibold">Patente / Vehículo</th><th className="px-4 py-3 font-semibold">Cliente</th><th className="px-4 py-3 font-semibold">Estado</th><th className="px-4 py-3 font-semibold">Fecha ingreso</th><th className="px-4 py-3 text-right font-semibold">Total estimado</th><th className="px-4 py-3 text-right font-semibold">Acciones</th></tr></thead>
            <tbody>
              {workOrdersQuery.isPending ? <WorkOrdersSkeleton /> : workOrdersQuery.data?.items.map((workOrder) => {
                const estimatedTotal = getEstimatedTotal(workOrder);
                const validTransitions = WORK_ORDER_STATUS.filter((candidate) =>
                  isValidWorkOrderTransition(workOrder.estado, candidate),
                );
                return (
                  <tr key={workOrder.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                    <td className="px-4 py-3"><Link to={`/work-orders/${workOrder.id}`} className="font-mono font-bold text-brand-blue hover:underline">{workOrder.codigo}</Link></td>
                    <td className="px-4 py-3"><span className="font-mono font-bold text-slate-900">{workOrder.vehicle?.patente ?? 'Sin vehículo'}</span><span className="block text-xs text-slate-500">{[workOrder.vehicle?.marca, workOrder.vehicle?.modelo].filter(Boolean).join(' ') || 'Sin datos del vehículo'}</span></td>
                    <td className="max-w-56 px-4 py-3"><span className="block truncate font-semibold text-slate-800">{workOrder.client?.nombre ?? 'Sin cliente'}</span><span className="block text-xs text-slate-500">{workOrder.client?.rut ?? 'Sin identificación'}</span></td>
                    <td className="px-4 py-3"><WorkOrderStatusBadge status={workOrder.estado} /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(workOrder.fechaIngreso)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-800">{estimatedTotal === null ? 'Ver detalle' : formatClp(estimatedTotal)}</td>
                    <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">
                      <Link to={`/work-orders/${workOrder.id}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-blue-50 hover:text-brand-blue" aria-label={`Ver ${workOrder.codigo}`} title="Ver detalle"><Eye className="h-4 w-4" aria-hidden="true" /></Link>
                      {canUpdate && (
                        <select
                          aria-label={`Cambiar estado de ${workOrder.codigo}`}
                          className="h-9 max-w-36 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-600"
                          value=""
                          onChange={(event) => changeStatus(workOrder, event.target.value as WorkOrderStatus)}
                          disabled={statusMutation.isPending || validTransitions.length === 0}
                        >
                          <option value="">{validTransitions.length === 0 ? 'Estado terminal' : 'Cambiar estado'}</option>
                          {validTransitions
                            .map((candidate) => <option key={candidate} value={candidate}>{WORK_ORDER_STATUS_LABELS[candidate]}</option>)}
                        </select>
                      )}
                      <button type="button" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50" onClick={() => pdfMutation.downloadPdf(workOrder.id, workOrder.codigo)} disabled={pdfMutation.isPending} aria-label={`Descargar PDF de ${workOrder.codigo}`} title="Descargar PDF">{pdfMutation.isPending && pdfMutation.variables?.id === workOrder.id ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}</button>
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!workOrdersQuery.isPending && workOrdersQuery.data?.items.length === 0 && (
          <div className="flex min-h-56 flex-col items-center justify-center px-4 text-center">
            <ClipboardList className="h-10 w-10 text-slate-300" aria-hidden="true" />
            <p className="mt-3 font-semibold text-slate-700">No se encontraron órdenes de trabajo</p>
            <p className="mt-1 text-sm text-slate-500">Cambie los filtros o registre el primer ingreso del taller.</p>
          </div>
        )}

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
    </div>
  );
};

export default WorkOrdersPage;
