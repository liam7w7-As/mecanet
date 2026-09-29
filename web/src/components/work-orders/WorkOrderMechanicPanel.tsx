import { ITEM_OPERATIONAL_STATUS } from '@unithor/shared';
import { AlertCircle, Check, ClipboardPen, PackagePlus, UserCog, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  useAssignWorkOrderMechanicMutation,
  useCatalogItems,
  useCreateWorkOrderRequestMutation,
  useMechanics,
  useReviewWorkOrderRequestMutation,
  useUpdateWorkOrderExecutionMutation,
} from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDateTime } from '../../lib/formatters';
import { useAuthStore } from '../../stores/auth.store';
import { notifyError, notifySuccess } from '../../stores/toast.store';
import CurrencyInput from '../common/CurrencyInput';

import type { WorkOrder } from '../../types/entities';
import type { ItemOperationalStatus } from '@unithor/shared';

const statusLabels: Record<ItemOperationalStatus, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  completado: 'Completado',
  omitido: 'Omitido',
};

const requestStatusStyles = {
  pendiente: 'bg-brand-goldPale text-brand-goldInk',
  aprobada: 'bg-brand-mintPale text-brand-mintInk',
  entregada: 'bg-brand-pale text-brand-primaryInk',
  rechazada: 'bg-brand-coralPale text-brand-coralInk',
  cancelada: 'bg-brand-pale text-brand-muted',
} as const;

interface Props {
  workOrder: WorkOrder;
  section?: 'all' | 'execution' | 'requests';
}

export const WorkOrderMechanicPanel = ({ workOrder, section = 'all' }: Props) => {
  const user = useAuthStore((state) => state.user);
  const isSupervisor = Boolean(
    user && ['desarrollador', 'admin', 'jefe'].includes(user.role),
  );
  const isClosed = workOrder.estado === 'entregada' || workOrder.estado === 'cancelada';
  const canExecute = !isClosed && Boolean(
    user && (isSupervisor || (user.role === 'mecanico' && workOrder.assignedMechanicId === user.id)),
  );
  const mechanicsQuery = useMechanics(isSupervisor);
  const assignMutation = useAssignWorkOrderMechanicMutation();
  const executionMutation = useUpdateWorkOrderExecutionMutation();
  const requestMutation = useCreateWorkOrderRequestMutation();
  const reviewMutation = useReviewWorkOrderRequestMutation();
  const [partSearch, setPartSearch] = useState('');
  const partsQuery = useCatalogItems(partSearch, 'parte');
  const [itemDrafts, setItemDrafts] = useState<
    Record<number, { estadoOperativo: ItemOperationalStatus; notasOperativas: string }>
  >({});
  const [progress, setProgress] = useState('');
  const [comment, setComment] = useState('');
  const [blockers, setBlockers] = useState('');
  const [requestType, setRequestType] = useState<'repuesto' | 'aumento_precio'>('repuesto');
  const [catalogItemId, setCatalogItemId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [workOrderItemId, setWorkOrderItemId] = useState('');
  const [suggestedPrice, setSuggestedPrice] = useState('');
  const [reason, setReason] = useState('');
  const selectedService = workOrder.items?.find((item) => item.id === Number(workOrderItemId));
  const validProgress = progress !== '' && Number.isInteger(Number(progress)) && Number(progress) >= 0 && Number(progress) <= 100 && comment.trim().length >= 2;
  const validRequest = reason.trim().length >= 2 && (requestType === 'repuesto'
    ? Boolean(catalogItemId) && Number.isInteger(Number(quantity)) && Number(quantity) > 0 && Number(quantity) <= 9999
    : Boolean(selectedService) && Number(suggestedPrice) > Number(selectedService?.precioUnitario ?? 0));
  const pendingRequests = useMemo(
    () => (workOrder.requests ?? []).filter((request) => request.estado === 'pendiente'),
    [workOrder.requests],
  );

  const handleAssignment = (value: string): void => {
    assignMutation.mutate(
      { id: workOrder.id, data: { mechanicId: value ? Number(value) : null } },
      {
        onSuccess: () => notifySuccess('Asignación de mecánico actualizada.'),
        onError: (error) => notifyError(getApiErrorMessage(error, 'No se pudo asignar el mecánico.')),
      },
    );
  };

  const saveItem = (itemId: number): void => {
    const original = workOrder.items?.find((item) => item.id === itemId);
    if (!original) return;
    const draft = itemDrafts[itemId] ?? {
      estadoOperativo: original.estadoOperativo,
      notasOperativas: original.notasOperativas ?? '',
    };
    executionMutation.mutate(
      {
        id: workOrder.id,
        data: {
          items: [
            {
              id: itemId,
              estadoOperativo: draft.estadoOperativo,
              notasOperativas: draft.notasOperativas || null,
            },
          ],
        },
      },
      {
        onSuccess: () => {
          setItemDrafts((current) => {
            const next = { ...current };
            delete next[itemId];
            return next;
          });
          notifySuccess('Trabajo actualizado.');
        },
        onError: (error) => notifyError(getApiErrorMessage(error, 'No se pudo actualizar el trabajo.')),
      },
    );
  };

  const submitProgress = (): void => {
    if (!canExecute || !validProgress) return;
    executionMutation.mutate(
      {
        id: workOrder.id,
        data: {
          reporte: {
            porcentaje: Number(progress),
            comentario: comment,
            bloqueos: blockers || null,
          },
        },
      },
      {
        onSuccess: () => {
          setProgress('');
          setComment('');
          setBlockers('');
          notifySuccess('Avance registrado en la bitácora.');
        },
        onError: (error) => notifyError(getApiErrorMessage(error, 'No se pudo registrar el avance.')),
      },
    );
  };

  const submitRequest = (): void => {
    if (!canExecute || !validRequest) return;
    const data =
      requestType === 'repuesto'
        ? {
            tipo: 'repuesto' as const,
            catalogItemId: Number(catalogItemId),
            cantidad: Number(quantity),
            motivo: reason,
          }
        : {
            tipo: 'aumento_precio' as const,
            workOrderItemId: Number(workOrderItemId),
            precioSugerido: Number(suggestedPrice),
            motivo: reason,
          };
    requestMutation.mutate(
      { id: workOrder.id, data },
      {
        onSuccess: () => {
          setReason('');
          setCatalogItemId('');
          setWorkOrderItemId('');
          setSuggestedPrice('');
          setQuantity('1');
          setPartSearch('');
          notifySuccess('Solicitud enviada al jefe de taller.');
        },
        onError: (error) => notifyError(getApiErrorMessage(error, 'No se pudo crear la solicitud.')),
      },
    );
  };

  const review = (requestId: number, decision: 'aprobar' | 'rechazar'): void => {
    reviewMutation.mutate(
      { id: workOrder.id, requestId, data: { decision } },
      {
        onSuccess: () => notifySuccess(`Solicitud ${decision === 'aprobar' ? 'aprobada' : 'rechazada'}.`),
        onError: (error) => notifyError(getApiErrorMessage(error, 'No se pudo revisar la solicitud.')),
      },
    );
  };

  const mutationError =
    assignMutation.error ?? executionMutation.error ?? requestMutation.error ?? reviewMutation.error;

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-brand-line bg-white" aria-labelledby="mechanic-panel-title">
      <div className="flex flex-col gap-4 border-b border-brand-line px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-3">
          <UserCog className="mt-0.5 h-5 w-5 text-brand-primaryInk" aria-hidden="true" />
          <div>
            <h2 id="mechanic-panel-title" className="font-bold text-brand-primaryInk">Ejecución del taller</h2>
          </div>
        </div>
        {isSupervisor && !isClosed ? (
          <label className="grid gap-1 text-xs font-semibold text-brand-muted">
            Mecánico responsable
            <select
              className="h-10 w-full min-w-0 rounded-lg border border-brand-line bg-white px-3 text-sm text-brand-ink sm:w-64"
              value={workOrder.assignedMechanicId ?? ''}
              onChange={(event) => handleAssignment(event.target.value)}
              disabled={assignMutation.isPending || mechanicsQuery.isPending}
            >
              <option value="">Sin asignar</option>
              {mechanicsQuery.data?.map((mechanic) => (
                <option key={mechanic.id} value={mechanic.id}>{mechanic.nombre}</option>
              ))}
            </select>
          </label>
        ) : (
          <div className="rounded-lg bg-brand-line/40 px-4 py-2 text-sm font-semibold text-brand-primaryInk">
            Responsable: {workOrder.assignedMechanic?.nombre ?? 'Sin asignar'}
          </div>
        )}
      </div>

      {mutationError && (
        <div className="flex items-center gap-2 border-b border-brand-coral/30 bg-brand-coralPale px-5 py-3 text-sm text-brand-coralInk" role="alert">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          {getApiErrorMessage(mutationError)}
        </div>
      )}

      {canExecute ? (
        <div className={section === 'all' ? 'grid divide-y divide-brand-line xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] xl:divide-x xl:divide-y-0' : ''}>
          <div className="min-w-0 p-5" hidden={section === 'requests'}>
            <h3 className="font-semibold text-brand-ink">Checklist de servicios y repuestos</h3>
            <div className="mt-4 space-y-3">
              {workOrder.items?.map((item) => {
                const draft = itemDrafts[item.id] ?? {
                  estadoOperativo: item.estadoOperativo,
                  notasOperativas: item.notasOperativas ?? '',
                };
                return (
                  <div key={item.id} className="grid min-w-0 gap-3 border-b border-brand-line pb-3 sm:grid-cols-2">
                    <div className="min-w-0 sm:col-span-2"><p className="break-words font-semibold text-brand-ink">{item.descripcion}</p><p className="mt-1 text-xs text-brand-muted">{item.tipoLinea === 'parte' ? 'Repuesto' : 'Servicio'} · {formatClp(item.precioUnitario)}</p></div>
                    <label className="grid gap-1 text-xs font-semibold text-brand-muted">Estado<select className="h-9 rounded-lg border border-brand-line px-2 text-sm text-brand-ink" value={draft.estadoOperativo} onChange={(event) => setItemDrafts((current) => ({ ...current, [item.id]: { ...draft, estadoOperativo: event.target.value as ItemOperationalStatus } }))}>{ITEM_OPERATIONAL_STATUS.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
                    <label className="grid gap-1 text-xs font-semibold text-brand-muted">Nota técnica<input className="h-9 rounded-lg border border-brand-line px-3 text-sm text-brand-ink" value={draft.notasOperativas} onChange={(event) => setItemDrafts((current) => ({ ...current, [item.id]: { ...draft, notasOperativas: event.target.value } }))} placeholder="Trabajo realizado, hallazgo..." /></label>
                    <button type="button" className="h-9 justify-self-start rounded-lg bg-brand-primaryInk px-3 text-sm font-semibold text-white hover:bg-brand-primaryInkHover disabled:opacity-50" onClick={() => saveItem(item.id)} disabled={executionMutation.isPending || (draft.estadoOperativo === item.estadoOperativo && draft.notasOperativas === (item.notasOperativas ?? ''))}>Guardar trabajo</button>
                  </div>
                );
              })}
              {workOrder.items?.length === 0 && <p className="text-sm text-brand-muted">No hay trabajos cargados todavía.</p>}
            </div>

            <div className="mt-6 border-t border-brand-line pt-5">
              <h3 className="font-semibold text-brand-ink">Reportar avance</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-[8rem_1fr]">
                <label className="grid gap-1 text-xs font-semibold text-brand-muted">Avance %<input type="number" min="0" max="100" className="h-10 rounded-lg border border-brand-line px-3 text-sm" value={progress} onChange={(event) => setProgress(event.target.value)} /></label>
                <label className="grid gap-1 text-xs font-semibold text-brand-muted">Comentario<input className="h-10 rounded-lg border border-brand-line px-3 text-sm" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Resumen del trabajo realizado" /></label>
              </div>
              <label className="mt-3 grid gap-1 text-xs font-semibold text-brand-muted">Bloqueos o novedades<textarea className="min-h-20 rounded-lg border border-brand-line p-3 text-sm" value={blockers} onChange={(event) => setBlockers(event.target.value)} placeholder="Opcional" /></label>
              <button type="button" className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primaryInk px-4 text-sm font-bold text-white hover:bg-brand-primaryInkHover disabled:opacity-50" onClick={submitProgress} disabled={executionMutation.isPending || !validProgress}><ClipboardPen className="h-4 w-4" aria-hidden="true" />Registrar avance</button>
            </div>
          </div>

          <div className="min-w-0 p-5" hidden={section === 'execution'}>
            <h3 className="font-semibold text-brand-ink">Solicitar al jefe de taller</h3>
            <div className="mt-3 grid grid-cols-2 rounded-lg bg-brand-pale p-1">
              <button type="button" className={`h-9 rounded-md text-sm font-semibold ${requestType === 'repuesto' ? 'bg-white text-brand-primaryInk shadow-sm' : 'text-brand-muted'}`} onClick={() => setRequestType('repuesto')}>Nuevo repuesto</button>
              <button type="button" className={`h-9 rounded-md text-sm font-semibold ${requestType === 'aumento_precio' ? 'bg-white text-brand-primaryInk shadow-sm' : 'text-brand-muted'}`} onClick={() => setRequestType('aumento_precio')}>Sugerir aumento</button>
            </div>
            {requestType === 'repuesto' ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_7rem]">
                <label className="grid min-w-0 gap-1 text-xs font-semibold text-brand-muted sm:col-span-2">Buscar repuesto
                  <input className="h-10 w-full min-w-0 rounded-lg border border-brand-line px-3 text-sm" value={partSearch} placeholder="Nombre o código"
                    onChange={(event) => { setPartSearch(event.target.value); setCatalogItemId(''); }} />
                </label>
                {partsQuery.isError && <p className="text-sm text-brand-coralInk sm:col-span-2" role="alert">No se pudo cargar los repuestos. <button type="button" className="underline" onClick={() => void partsQuery.refetch()}>Reintentar</button></p>}
                {partsQuery.isFetching && <p className="text-xs text-brand-muted sm:col-span-2" role="status">Buscando repuestos...</p>}
                <label className="grid min-w-0 gap-1 text-xs font-semibold text-brand-muted">Repuesto<select className="h-10 w-full min-w-0 rounded-lg border border-brand-line px-3 text-sm" value={catalogItemId} onChange={(event) => setCatalogItemId(event.target.value)}><option value="">Seleccionar repuesto</option>{partsQuery.data?.items?.map((part) => <option key={part.id} value={part.id}>{part.codigo ? `${part.codigo} · ` : ''}{part.nombre} ({part.stock})</option>)}</select></label>
                <label className="grid gap-1 text-xs font-semibold text-brand-muted">Cantidad<input type="number" min="1" className="h-10 rounded-lg border border-brand-line px-3 text-sm" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
              </div>
            ) : (
              <div className="mt-3 grid gap-3">
                <label className="grid min-w-0 gap-1 text-xs font-semibold text-brand-muted">Servicio<select className="h-10 w-full min-w-0 rounded-lg border border-brand-line px-3 text-sm" value={workOrderItemId} onChange={(event) => { setWorkOrderItemId(event.target.value); setSuggestedPrice(''); }}><option value="">Seleccionar trabajo</option>{workOrder.items?.filter((item) => item.tipoLinea !== 'parte').map((item) => <option key={item.id} value={item.id}>{item.descripcion} · actual {formatClp(item.precioUnitario)}</option>)}</select></label>
                 <label className="grid gap-1 text-xs font-semibold text-brand-muted">Precio sugerido<CurrencyInput value={suggestedPrice} onChange={setSuggestedPrice} className="h-10 rounded-lg border border-brand-line px-3 text-sm" aria-label="Precio sugerido" /></label>
              </div>
            )}
            <label className="mt-3 grid gap-1 text-xs font-semibold text-brand-muted">Justificación<textarea className="min-h-24 rounded-lg border border-brand-line p-3 text-sm" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explique la necesidad o complejidad encontrada" /></label>
            {requestType === 'aumento_precio' && selectedService && suggestedPrice !== '' && Number(suggestedPrice) <= Number(selectedService.precioUnitario) && <p className="mt-2 text-sm text-brand-coralInk" role="alert">El precio sugerido debe superar el actual: {formatClp(selectedService.precioUnitario)}.</p>}
            <button type="button" className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg border border-brand-primaryInk px-4 text-sm font-semibold text-brand-primaryInk hover:bg-brand-line/40 disabled:opacity-50" onClick={submitRequest} disabled={requestMutation.isPending || !validRequest}><PackagePlus className="h-4 w-4" aria-hidden="true" />Enviar solicitud</button>
          </div>
        </div>
      ) : (
        <p className="px-5 py-5 text-sm text-brand-muted">{isClosed ? 'Orden cerrada. El seguimiento está disponible solo para consulta.' : 'El seguimiento corresponde al mecánico asignado y al jefe de taller.'}</p>
      )}

      <div className="border-t border-brand-line px-5 py-5" hidden={section === 'execution'}>
        <div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-brand-ink">Solicitudes</h3>{pendingRequests.length > 0 && <span className="rounded-md bg-brand-goldPale px-2 py-1 text-xs font-bold text-brand-goldInk">{pendingRequests.length} pendiente(s)</span>}</div>
        <div className="mt-3 divide-y divide-brand-line border-y border-brand-line">
          {(workOrder.requests ?? []).map((request) => (
            <div key={request.id} className="grid gap-3 py-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-brand-ink">{request.tipo === 'repuesto' ? request.catalogItem?.nombre ?? 'Repuesto' : request.workOrderItem?.descripcion ?? 'Aumento de precio'}</span><span className={`rounded-md px-2 py-1 text-xs font-bold ${requestStatusStyles[request.estado]}`}>{request.estado}</span></div><p className="mt-1 text-sm text-brand-muted">{request.motivo}</p><p className="mt-1 text-xs text-brand-muted">Solicita {request.requester?.nombre ?? 'Usuario'} · {formatDateTime(request.createdAt)}{request.tipo === 'repuesto' ? ` · Cantidad ${request.cantidad ?? 0}` : ` · Sugerido ${formatClp(request.precioSugerido ?? 0)}`}</p></div>
              {isSupervisor && !isClosed && request.estado === 'pendiente' && <div className="flex gap-2"><button type="button" className="inline-flex h-9 items-center gap-1 rounded-lg bg-brand-mintInk px-3 text-sm font-semibold text-white hover:bg-brand-mintInk disabled:opacity-50" onClick={() => review(request.id, 'aprobar')} disabled={reviewMutation.isPending}><Check className="h-4 w-4" aria-hidden="true" />Aprobar</button><button type="button" className="inline-flex h-9 items-center gap-1 rounded-lg border border-brand-coral/40 px-3 text-sm font-semibold text-brand-coralInk hover:bg-brand-coralPale disabled:opacity-50" onClick={() => review(request.id, 'rechazar')} disabled={reviewMutation.isPending}><X className="h-4 w-4" aria-hidden="true" />Rechazar</button></div>}
            </div>
          ))}
          {(workOrder.requests?.length ?? 0) === 0 && <p className="py-5 text-sm text-brand-muted">No hay solicitudes registradas.</p>}
        </div>
      </div>

      <div className="border-t border-brand-line px-5 py-5" hidden={section === 'requests'}>
        <h3 className="font-semibold text-brand-ink">Reportes de avance</h3>
        <div className="mt-3 space-y-3">
          {workOrder.progressReports?.map((report) => <div key={report.id} className="grid gap-2 border-b border-brand-line pb-3 sm:grid-cols-[5rem_1fr_auto]"><strong className="text-brand-primaryInk">{report.porcentaje}%</strong><div><p className="text-sm font-medium text-brand-ink">{report.comentario}</p>{report.bloqueos && <p className="mt-1 text-xs text-brand-goldInk">Bloqueo: {report.bloqueos}</p>}</div><span className="text-xs text-brand-muted">{report.mechanic?.nombre ?? 'Usuario'} · {formatDateTime(report.createdAt)}</span></div>)}
          {(workOrder.progressReports?.length ?? 0) === 0 && <p className="text-sm text-brand-muted">Aún no se han reportado avances.</p>}
        </div>
      </div>
    </section>
  );
};

export default WorkOrderMechanicPanel;
