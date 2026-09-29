import { ITEM_OPERATIONAL_STATUS } from '@unithor/shared';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardPen,
  Clock,
  LoaderCircle,
  Package,
  PackagePlus,
  Play,
  UserCog,
  Wrench,
  X,
} from 'lucide-react';
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

const STATUS_CONFIG: Record<
  ItemOperationalStatus,
  { label: string; icon: typeof Clock; activeClass: string; inactiveClass: string }
> = {
  pendiente: {
    label: 'Pendiente',
    icon: Clock,
    activeClass: 'bg-slate-100 text-slate-700 border-slate-300 ring-2 ring-slate-300/30 font-bold',
    inactiveClass: 'bg-white text-slate-500 border-brand-line hover:bg-slate-50',
  },
  en_proceso: {
    label: 'En proceso',
    icon: Play,
    activeClass: 'bg-brand-primary text-white border-brand-primary shadow-xs ring-2 ring-brand-primary/25 font-bold',
    inactiveClass: 'bg-white text-brand-primary border-brand-line hover:bg-brand-pale/50',
  },
  completado: {
    label: 'Completado',
    icon: CheckCircle2,
    activeClass: 'bg-brand-mint text-white border-brand-mint shadow-xs ring-2 ring-brand-mint/25 font-bold',
    inactiveClass: 'bg-white text-brand-mintInk border-brand-line hover:bg-brand-mintPale/40',
  },
  omitido: {
    label: 'Omitido',
    icon: X,
    activeClass: 'bg-slate-200 text-slate-600 border-slate-300 font-bold',
    inactiveClass: 'bg-white text-slate-400 border-brand-line hover:bg-slate-50',
  },
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
  const [activeItemId, setActiveItemId] = useState<number | null>(null);
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

  const saveItem = (itemId: number, nextStatus?: ItemOperationalStatus): void => {
    const original = workOrder.items?.find((item) => item.id === itemId);
    if (!original) return;
    const draft = itemDrafts[itemId] ?? {
      estadoOperativo: original.estadoOperativo,
      notasOperativas: original.notasOperativas ?? '',
    };
    const targetStatus = nextStatus ?? draft.estadoOperativo;

    setActiveItemId(itemId);
    executionMutation.mutate(
      {
        id: workOrder.id,
        data: {
          items: [
            {
              id: itemId,
              estadoOperativo: targetStatus,
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
          setActiveItemId(null);
          notifySuccess(`Trabajo actualizado a ${statusLabels[targetStatus]}.`);
        },
        onError: (error) => {
          setActiveItemId(null);
          notifyError(getApiErrorMessage(error, 'No se pudo actualizar el trabajo.'));
        },
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
    <section className="min-w-0 overflow-hidden rounded-2xl border border-brand-line bg-white shadow-xs" aria-labelledby="mechanic-panel-title">
      {/* Cabecera del panel */}
      <div className="flex flex-col gap-4 border-b border-brand-line p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-pale text-brand-primary">
            <UserCog className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h2 id="mechanic-panel-title" className="text-base font-bold text-brand-ink">
              Ejecución y Control de Taller
            </h2>
            <p className="text-xs text-brand-muted">
              Actualice el estado de los trabajos en 1 clic y reporte avances de la orden.
            </p>
          </div>
        </div>

        {isSupervisor && !isClosed ? (
          <label className="flex items-center gap-2 text-xs font-semibold text-brand-muted">
            <span>Mecánico:</span>
            <select
              className="h-10 min-w-48 rounded-xl border border-brand-line bg-white px-3 text-xs font-bold text-brand-ink outline-none transition focus:border-brand-primary"
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
          <div className="rounded-xl border border-brand-line bg-brand-pale/50 px-3.5 py-2 text-xs font-bold text-brand-primaryInk">
            Responsable: {workOrder.assignedMechanic?.nombre ?? 'Sin asignar'}
          </div>
        )}
      </div>

      {mutationError && (
        <div className="flex items-center gap-2 border-b border-brand-coral/30 bg-brand-coralPale px-5 py-3 text-sm text-brand-coralInk" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {getApiErrorMessage(mutationError)}
        </div>
      )}

      {canExecute ? (
        <div className={section === 'all' ? 'grid divide-y divide-brand-line xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:divide-x xl:divide-y-0' : ''}>
          {/* Checklist interactivo sin selects */}
          <div className="min-w-0 p-5 sm:p-6" hidden={section === 'requests'}>
            <div className="flex items-center justify-between pb-4">
              <div>
                <h3 className="text-sm font-bold text-brand-ink">Checklist de servicios y repuestos</h3>
                <p className="mt-0.5 text-xs text-brand-muted">
                  Haga clic directamente en el estado para cambiar el modo de trabajo.
                </p>
              </div>
              <span className="rounded-full bg-brand-pale px-2.5 py-1 text-xs font-bold text-brand-primary">
                {workOrder.items?.filter((i) => i.estadoOperativo === 'completado').length ?? 0}/{workOrder.items?.length ?? 0} listos
              </span>
            </div>

            <div className="space-y-4">
              {workOrder.items?.map((item) => {
                const draft = itemDrafts[item.id] ?? {
                  estadoOperativo: item.estadoOperativo,
                  notasOperativas: item.notasOperativas ?? '',
                };
                const currentStatus = draft.estadoOperativo;
                const isPendingForThis = executionMutation.isPending && activeItemId === item.id;
                const isPart = item.tipoLinea === 'parte';

                return (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-brand-line bg-[#fbfcfd] p-4 transition-all hover:border-brand-primary/30 hover:shadow-xs sm:p-5"
                  >
                    {/* Encabezado del trabajo */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold ${
                              isPart
                                ? 'bg-cyan-50 text-cyan-700 border border-cyan-200'
                                : 'bg-brand-pale text-brand-primary border border-brand-line'
                            }`}
                          >
                            {isPart ? <Package className="h-3 w-3" /> : <Wrench className="h-3 w-3" />}
                            {isPart ? 'Repuesto' : 'Servicio'}
                          </span>
                          <span className="text-xs font-semibold text-brand-muted">
                            {formatClp(item.precioUnitario)}
                          </span>
                        </div>
                        <h4 className="mt-1.5 break-words text-sm font-bold text-brand-ink sm:text-base">
                          {item.descripcion}
                        </h4>
                      </div>

                      {/* Selector de modo accesible / sync */}
                      <label className="sr-only">
                        Estado
                        <select
                          value={draft.estadoOperativo}
                          onChange={(e) => {
                            const newStatus = e.target.value as ItemOperationalStatus;
                            setItemDrafts((c) => ({ ...c, [item.id]: { ...draft, estadoOperativo: newStatus } }));
                            saveItem(item.id, newStatus);
                          }}
                        >
                          {ITEM_OPERATIONAL_STATUS.map((s) => (
                            <option key={s} value={s}>{statusLabels[s]}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {/* Selector de Estado Interactivo (Control Segmentado sin Selects) */}
                    <div className="mt-3.5">
                      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-muted">
                        Modo de trabajo:
                      </p>
                      <div
                        className="grid grid-cols-3 gap-2"
                        role="group"
                        aria-label={`Cambiar modo de trabajo para ${item.descripcion}`}
                      >
                        {(['pendiente', 'en_proceso', 'completado'] as const).map((statusOption) => {
                          const isOptionActive = currentStatus === statusOption;
                          const cfg = STATUS_CONFIG[statusOption];
                          const StatusIcon = cfg.icon;

                          // Regression guard: mechanics cannot downgrade item status
                          const ITEM_ORDER = ['pendiente', 'en_proceso', 'completado'] as const;
                          const currentRank = ITEM_ORDER.indexOf(currentStatus as typeof ITEM_ORDER[number]);
                          const targetRank = ITEM_ORDER.indexOf(statusOption);
                          const wouldRegress = currentRank > targetRank && currentRank !== -1 && targetRank !== -1;
                          const isLockedForRole = wouldRegress && !isSupervisor;

                          return (
                            <button
                              key={statusOption}
                              type="button"
                              onClick={() => {
                                if (isLockedForRole) return;
                                setItemDrafts((c) => ({
                                  ...c,
                                  [item.id]: { ...draft, estadoOperativo: statusOption },
                                }));
                                saveItem(item.id, statusOption);
                              }}
                              disabled={isPendingForThis || isLockedForRole}
                              title={isLockedForRole ? 'Solo el jefe de taller o administrador puede revertir el estado' : undefined}
                              className={`flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-bold transition-all sm:gap-2 sm:text-sm ${
                                isOptionActive ? cfg.activeClass : isLockedForRole ? 'cursor-not-allowed border-brand-line/60 bg-slate-50 text-slate-300' : cfg.inactiveClass
                              }`}
                            >
                              {isPendingForThis && isOptionActive ? (
                                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                              ) : (
                                <StatusIcon className="h-4 w-4" aria-hidden="true" />
                              )}
                              <span>{cfg.label}</span>
                            </button>
                          );
                        })}

                      </div>
                    </div>

                    {/* Nota técnica con botón de guardado ágil */}
                    <div className="mt-3.5 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <div className="relative flex-1">
                        <input
                          className="h-9 w-full rounded-xl border border-brand-line bg-white px-3 text-xs text-brand-ink outline-none transition focus:border-brand-primary sm:text-sm"
                          value={draft.notasOperativas}
                          onChange={(event) =>
                            setItemDrafts((current) => ({
                              ...current,
                              [item.id]: { ...draft, notasOperativas: event.target.value },
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              saveItem(item.id);
                            }
                          }}
                          placeholder="Nota técnica, hallazgo o detalle del trabajo..."
                        />
                      </div>
                      {draft.notasOperativas !== (item.notasOperativas ?? '') && (
                        <button
                          type="button"
                          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand-primary px-3 text-xs font-bold text-white shadow-xs transition hover:bg-brand-primaryHover"
                          onClick={() => saveItem(item.id)}
                          disabled={isPendingForThis}
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Guardar nota</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {workOrder.items?.length === 0 && (
                <p className="py-6 text-center text-sm text-brand-muted">No hay trabajos cargados todavía.</p>
              )}
            </div>

            {/* Reportar avance */}
            <div className="mt-8 rounded-2xl border border-brand-line bg-[#fbfcfd] p-5">
              <h3 className="text-sm font-bold text-brand-ink">Reportar avance</h3>
              <p className="mt-0.5 text-xs text-brand-muted">
                Registre el avance porcentual acumulado de la orden de trabajo.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-[8rem_1fr]">
                <label className="grid gap-1 text-xs font-semibold text-brand-muted">
                  Avance %
                  <input
                    type="number"
                    min="0"
                    max="100"
                    className="h-10 rounded-xl border border-brand-line bg-white px-3 text-sm font-bold text-brand-ink outline-none focus:border-brand-primary"
                    value={progress}
                    onChange={(event) => setProgress(event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-brand-muted">
                  Comentario
                  <input
                    className="h-10 rounded-xl border border-brand-line bg-white px-3 text-sm text-brand-ink outline-none focus:border-brand-primary"
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="Resumen del trabajo realizado"
                  />
                </label>
              </div>
              <label className="mt-3 grid gap-1 text-xs font-semibold text-brand-muted">
                Bloqueos o novedades
                <textarea
                  className="min-h-20 resize-none rounded-xl border border-brand-line bg-white p-3 text-sm text-brand-ink outline-none focus:border-brand-primary"
                  value={blockers}
                  onChange={(event) => setBlockers(event.target.value)}
                  placeholder="Inconvenientes técnicos, falta de repuestos..."
                />
              </label>
              <button
                type="button"
                className="primary-button mt-4 inline-flex h-10 items-center gap-2 rounded-xl px-5 text-xs font-bold text-white shadow-xs hover:shadow transition-all disabled:opacity-50"
                onClick={submitProgress}
                disabled={executionMutation.isPending || !validProgress}
              >
                <ClipboardPen className="h-4 w-4" aria-hidden="true" />
                Registrar avance
              </button>
            </div>
          </div>

          {/* Solicitudes de repuestos / aumentos */}
          <div className="min-w-0 p-5 sm:p-6" hidden={section === 'execution'}>
            <div className="rounded-2xl border border-brand-line bg-[#fbfcfd] p-5">
              <h3 className="text-sm font-bold text-brand-ink">Solicitar al jefe de taller</h3>
              <p className="mt-0.5 text-xs text-brand-muted">
                Petición de insumos o actualización de presupuesto.
              </p>
              <div className="mt-4 grid grid-cols-2 rounded-xl bg-brand-pale/70 p-1">
                <button
                  type="button"
                  className={`h-9 rounded-lg text-xs font-bold transition ${
                    requestType === 'repuesto'
                      ? 'bg-white text-brand-primary shadow-xs'
                      : 'text-brand-muted hover:text-brand-ink'
                  }`}
                  onClick={() => setRequestType('repuesto')}
                >
                  Nuevo repuesto
                </button>
                <button
                  type="button"
                  className={`h-9 rounded-lg text-xs font-bold transition ${
                    requestType === 'aumento_precio'
                      ? 'bg-white text-brand-primary shadow-xs'
                      : 'text-brand-muted hover:text-brand-ink'
                  }`}
                  onClick={() => setRequestType('aumento_precio')}
                >
                  Sugerir aumento
                </button>
              </div>

              {requestType === 'repuesto' ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_7rem]">
                  <label className="grid min-w-0 gap-1 text-xs font-semibold text-brand-muted sm:col-span-2">
                    Buscar repuesto
                    <input
                      className="h-10 w-full min-w-0 rounded-xl border border-brand-line bg-white px-3 text-sm text-brand-ink outline-none focus:border-brand-primary"
                      value={partSearch}
                      placeholder="Nombre o código del repuesto..."
                      onChange={(event) => {
                        setPartSearch(event.target.value);
                        setCatalogItemId('');
                      }}
                    />
                  </label>
                  {partsQuery.isError && (
                    <p className="text-sm text-brand-coralInk sm:col-span-2" role="alert">
                      No se pudo cargar los repuestos.{' '}
                      <button type="button" className="underline" onClick={() => void partsQuery.refetch()}>
                        Reintentar
                      </button>
                    </p>
                  )}
                  {partsQuery.isFetching && (
                    <p className="text-xs text-brand-muted sm:col-span-2" role="status">
                      Buscando repuestos...
                    </p>
                  )}
                  <label className="grid min-w-0 gap-1 text-xs font-semibold text-brand-muted">
                    Repuesto
                    <select
                      className="h-10 w-full min-w-0 rounded-xl border border-brand-line bg-white px-3 text-sm text-brand-ink outline-none focus:border-brand-primary"
                      value={catalogItemId}
                      onChange={(event) => setCatalogItemId(event.target.value)}
                    >
                      <option value="">Seleccionar repuesto</option>
                      {partsQuery.data?.items?.map((part) => (
                        <option key={part.id} value={part.id}>
                          {part.codigo ? `${part.codigo} · ` : ''}{part.nombre} ({part.stock})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-brand-muted">
                    Cantidad
                    <input
                      type="number"
                      min="1"
                      className="h-10 rounded-xl border border-brand-line bg-white px-3 text-sm font-bold text-brand-ink outline-none focus:border-brand-primary"
                      value={quantity}
                      onChange={(event) => setQuantity(event.target.value)}
                    />
                  </label>
                </div>
              ) : (
                <div className="mt-4 grid gap-3">
                  <label className="grid min-w-0 gap-1 text-xs font-semibold text-brand-muted">
                    Servicio
                    <select
                      className="h-10 w-full min-w-0 rounded-xl border border-brand-line bg-white px-3 text-sm text-brand-ink outline-none focus:border-brand-primary"
                      value={workOrderItemId}
                      onChange={(event) => {
                        setWorkOrderItemId(event.target.value);
                        setSuggestedPrice('');
                      }}
                    >
                      <option value="">Seleccionar trabajo</option>
                      {workOrder.items
                        ?.filter((item) => item.tipoLinea !== 'parte')
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.descripcion} · actual {formatClp(item.precioUnitario)}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-brand-muted">
                    Precio sugerido
                    <CurrencyInput
                      value={suggestedPrice}
                      onChange={setSuggestedPrice}
                      className="h-10 rounded-xl border border-brand-line bg-white px-3 text-sm font-bold text-brand-ink outline-none focus:border-brand-primary"
                      aria-label="Precio sugerido"
                    />
                  </label>
                </div>
              )}

              <label className="mt-3 grid gap-1 text-xs font-semibold text-brand-muted">
                Justificación
                <textarea
                  className="min-h-24 resize-none rounded-xl border border-brand-line bg-white p-3 text-sm text-brand-ink outline-none focus:border-brand-primary"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Explique la necesidad o complejidad encontrada..."
                />
              </label>
              {requestType === 'aumento_precio' &&
                selectedService &&
                suggestedPrice !== '' &&
                Number(suggestedPrice) <= Number(selectedService.precioUnitario) && (
                  <p className="mt-2 text-sm text-brand-coralInk" role="alert">
                    El precio sugerido debe superar el actual: {formatClp(selectedService.precioUnitario)}.
                  </p>
                )}
              <button
                type="button"
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-brand-primary px-4 text-xs font-bold text-white shadow-xs hover:bg-brand-primaryHover transition disabled:opacity-50"
                onClick={submitRequest}
                disabled={requestMutation.isPending || !validRequest}
              >
                <PackagePlus className="h-4 w-4" aria-hidden="true" />
                Enviar solicitud
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-brand-muted">
          {isClosed
            ? 'Orden cerrada. El seguimiento está disponible solo para consulta.'
            : 'El seguimiento corresponde al mecánico asignado y al jefe de taller.'}
        </p>
      )}

      {/* Lista de Solicitudes Registradas */}
      <div className="border-t border-brand-line p-5 sm:p-6" hidden={section === 'execution'}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-brand-ink">Historial de Solicitudes</h3>
          {pendingRequests.length > 0 && (
            <span className="rounded-full bg-brand-goldPale px-2.5 py-0.5 text-xs font-bold text-brand-goldInk">
              {pendingRequests.length} pendiente(s)
            </span>
          )}
        </div>
        <div className="mt-3 divide-y divide-brand-line rounded-2xl border border-brand-line bg-[#fbfcfd]">
          {(workOrder.requests ?? []).map((request) => (
            <div key={request.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-brand-ink">
                    {request.tipo === 'repuesto'
                      ? request.catalogItem?.nombre ?? 'Repuesto'
                      : request.workOrderItem?.descripcion ?? 'Aumento de precio'}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${requestStatusStyles[request.estado]}`}>
                    {request.estado}
                  </span>
                </div>
                <p className="mt-1 text-xs text-brand-muted">{request.motivo}</p>
                <p className="mt-1 text-[11px] text-brand-muted">
                  Solicita {request.requester?.nombre ?? 'Usuario'} · {formatDateTime(request.createdAt)}
                  {request.tipo === 'repuesto'
                    ? ` · Cantidad ${request.cantidad ?? 0}`
                    : ` · Sugerido ${formatClp(request.precioSugerido ?? 0)}`}
                </p>
              </div>
              {isSupervisor && !isClosed && request.estado === 'pendiente' && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="inline-flex h-9 items-center gap-1 rounded-xl bg-brand-mint px-3 text-xs font-bold text-white hover:bg-brand-mint/90 transition shadow-xs disabled:opacity-50"
                    onClick={() => review(request.id, 'aprobar')}
                    disabled={reviewMutation.isPending}
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Aprobar
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-9 items-center gap-1 rounded-xl border border-brand-coral/40 bg-white px-3 text-xs font-bold text-brand-coralInk hover:bg-brand-coralPale transition disabled:opacity-50"
                    onClick={() => review(request.id, 'rechazar')}
                    disabled={reviewMutation.isPending}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                    Rechazar
                  </button>
                </div>
              )}
            </div>
          ))}
          {(workOrder.requests?.length ?? 0) === 0 && (
            <p className="py-6 text-center text-sm text-brand-muted">No hay solicitudes registradas.</p>
          )}
        </div>
      </div>

      {/* Bitácora de reportes de avance */}
      <div className="border-t border-brand-line p-5 sm:p-6" hidden={section === 'requests'}>
        <h3 className="text-sm font-bold text-brand-ink">Bitácora de avances reportados</h3>
        <div className="mt-3 space-y-2.5">
          {workOrder.progressReports?.map((report) => (
            <div
              key={report.id}
              className="grid gap-2 rounded-xl border border-brand-line bg-[#fbfcfd] p-3.5 sm:grid-cols-[5rem_1fr_auto] sm:items-center"
            >
              <strong className="text-base font-black text-brand-primary">{report.porcentaje}%</strong>
              <div>
                <p className="text-xs font-semibold text-brand-ink sm:text-sm">{report.comentario}</p>
                {report.bloqueos && (
                  <p className="mt-0.5 text-xs text-brand-goldInk">Bloqueo: {report.bloqueos}</p>
                )}
              </div>
              <span className="text-xs text-brand-muted">
                {report.mechanic?.nombre ?? 'Usuario'} · {formatDateTime(report.createdAt)}
              </span>
            </div>
          ))}
          {(workOrder.progressReports?.length ?? 0) === 0 && (
            <p className="py-5 text-center text-sm text-brand-muted">Aún no se han reportado avances.</p>
          )}
        </div>
      </div>
    </section>
  );
};

export default WorkOrderMechanicPanel;
