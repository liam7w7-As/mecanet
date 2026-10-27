import { type WorkOrderPriceSuggestionScope } from '@unithor/shared';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  LoaderCircle,
  MessageSquarePlus,
  Paperclip,
  Pause,
  Play,
  Plus,
  Send,
  ShieldCheck,
  Timer,
  UserCog,
  Wrench,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';

import {
  useAdjustItemHoursMutation,
  useAssignWorkOrderItemMutation,
  useCompleteItemTimerMutation,
  useCreateObservationMutation,
  useCreatePriceSuggestionMutation,
  usePauseItemTimerMutation,
  usePriceSuggestions,
  useReviewPriceSuggestionMutation,
  useStartItemTimerMutation,
  useSubmitWorksheetProgressMutation,
  useUpdateItemEstimateMutation,
  useValidateItemHoursMutation,
  useWorkOrderWorksheet,
} from '../../hooks/useWorkOrderLabor';
import { useMechanics } from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatDateTime } from '../../lib/formatters';
import { useAuthStore } from '../../stores/auth.store';
import { notifyError, notifySuccess } from '../../stores/toast.store';

import type { WorkOrderWorksheetItem } from '../../types/entities';
import type { ItemOperationalStatus } from '@unithor/shared';

const STATUS_LABELS: Record<ItemOperationalStatus, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  completado: 'Completado',
  omitido: 'Omitido',
};

const STATUS_STYLES: Record<ItemOperationalStatus, string> = {
  pendiente: 'bg-slate-100 text-slate-700 border-slate-200',
  en_proceso: 'bg-brand-primary text-white border-brand-primary',
  completado: 'bg-brand-mintPale text-brand-mintInk border-brand-mint',
  omitido: 'bg-slate-200 text-slate-600 border-slate-300',
};

const STATUS_ICONS: Record<ItemOperationalStatus, typeof Clock> = {
  pendiente: Clock,
  en_proceso: Play,
  completado: CheckCircle2,
  omitido: AlertTriangle,
};

const SCOPES: Array<{ value: WorkOrderPriceSuggestionScope; label: string }> = [
  { value: 'ot', label: 'Solo esta OT' },
  { value: 'catalogo', label: 'Solo catálogo' },
  { value: 'ambos', label: 'OT y catálogo' },
];

const formatHours = (value: number | null): string =>
  value === null ? 'Sin definir' : `${value.toFixed(2)} h`;

const formatMinutes = (minutes: number): string => {
  const safe = Math.max(0, minutes);
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return hours > 0 ? `${hours} h ${rest} min` : `${rest} min`;
};

const isSupervisorRole = (role: string | undefined): boolean =>
  Boolean(role && ['desarrollador', 'admin', 'jefe'].includes(role));

const isAdminRole = (role: string | undefined): boolean =>
  Boolean(role && ['desarrollador', 'admin'].includes(role));

interface ItemCardProps {
  item: WorkOrderWorksheetItem;
  workOrderId: number;
  canWork: boolean;
  canManage: boolean;
  onObservation: (itemId: number) => void;
}

const ItemCard = ({ item, workOrderId, canWork, canManage, onObservation }: ItemCardProps) => {
  const startMutation = useStartItemTimerMutation();
  const pauseMutation = usePauseItemTimerMutation();
  const completeMutation = useCompleteItemTimerMutation();
  const assignMutation = useAssignWorkOrderItemMutation();
  const estimateMutation = useUpdateItemEstimateMutation();
  const adjustMutation = useAdjustItemHoursMutation();
  const validateMutation = useValidateItemHoursMutation();
  const mechanicsQuery = useMechanics(canManage);
  const [showManage, setShowManage] = useState(false);
  const [assignee, setAssignee] = useState('');
  const [estimate, setEstimate] = useState(
    item.horasHombreEstimadas === null ? '' : String(item.horasHombreEstimadas),
  );
  const [adjustMinutes, setAdjustMinutes] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [validationNote, setValidationNote] = useState('');

  const active = item.activeSession;
  const isBusy =
    startMutation.isPending ||
    pauseMutation.isPending ||
    completeMutation.isPending ||
    assignMutation.isPending ||
    estimateMutation.isPending ||
    adjustMutation.isPending ||
    validateMutation.isPending;
  const StatusIcon = STATUS_ICONS[item.estadoOperativo];

  const handleStart = (): void => {
    startMutation.mutate(
      { id: workOrderId, itemId: item.id },
      {
        onSuccess: (worksheet) => {
          if (worksheet.pausedOtherItems > 0) {
            notifySuccess('Se pausó el trabajo anterior para iniciar este.');
          } else {
            notifySuccess('Cronómetro iniciado.');
          }
        },
        onError: (error) => notifyError(getApiErrorMessage(error, 'No se pudo iniciar el cronómetro.')),
      },
    );
  };

  const handlePause = (): void => {
    pauseMutation.mutate(
      { id: workOrderId, itemId: item.id },
      {
        onSuccess: () => notifySuccess('Cronómetro pausado.'),
        onError: (error) => notifyError(getApiErrorMessage(error, 'No se pudo pausar el cronómetro.')),
      },
    );
  };

  const handleComplete = (): void => {
    completeMutation.mutate(
      { id: workOrderId, itemId: item.id },
      {
        onSuccess: () => notifySuccess('Trabajo completado. Horas reales calculadas.'),
        onError: (error) => notifyError(getApiErrorMessage(error, 'No se pudo completar el trabajo.')),
      },
    );
  };

  return (
    <article
      className={`rounded-xl border bg-white p-4 shadow-sm transition-colors ${
        active?.mine ? 'border-brand-primary ring-2 ring-brand-primary/15' : 'border-brand-line'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[item.estadoOperativo]}`}
            >
              <StatusIcon className="h-3 w-3" aria-hidden="true" />
              {STATUS_LABELS[item.estadoOperativo]}
            </span>
            {item.excedeEstimado && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                Excede lo estimado
              </span>
            )}
            {item.estadoOperativo === 'completado' &&
              (item.laborValidatedAt ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-mintPale px-2 py-0.5 text-xs font-semibold text-brand-mintInk">
                  <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                  Horas validadas
                </span>
              ) : (
                <span className="rounded-full bg-brand-goldPale px-2 py-0.5 text-xs font-semibold text-brand-goldInk">
                  Horas por validar
                </span>
              ))}
          </div>
          <h3 className="mt-2 text-base font-bold text-brand-ink">{item.descripcion}</h3>
          <p className="mt-1 text-xs text-brand-muted">
            {item.cantidad} {item.unidadMedida} · Estimado por unidad:{' '}
            {formatHours(item.horasHombreEstimadas)} · Estimado total:{' '}
            {formatHours(item.horasEstimadasTotales)}
          </p>
          <p className="mt-1 text-xs text-brand-muted">
            Responsable: {item.assignedUser?.nombre ?? 'Sin asignar'} · Horas reales:{' '}
            <strong className="text-brand-ink">{formatHours(item.horasHombreReales)}</strong>
          </p>
          {item.notasOperativas && (
            <p className="mt-2 rounded-lg bg-brand-pale/60 px-3 py-2 text-xs text-brand-ink">
              {item.notasOperativas}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          {active ? (
            <div className="flex items-center gap-2 rounded-lg bg-brand-primary/5 px-3 py-2 text-xs font-semibold text-brand-primaryInk">
              <Timer className="h-4 w-4 animate-pulse" aria-hidden="true" />
              {active.mine ? 'Tu cronómetro' : active.userName ?? 'En curso'}:{' '}
              {formatMinutes(active.elapsedMinutes)}
            </div>
          ) : (
            <p className="text-xs text-brand-muted">
              Tiempo acumulado: {formatMinutes(item.totalMinutes)}
            </p>
          )}

          {canWork && (
            <div className="flex flex-wrap justify-end gap-2">
              {!active && item.estadoOperativo !== 'completado' && (
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-primary px-3 text-xs font-semibold text-white hover:bg-brand-primaryInk disabled:opacity-50"
                  onClick={handleStart}
                  disabled={isBusy}
                >
                  {startMutation.isPending ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Play className="h-4 w-4" aria-hidden="true" />
                  )}
                  Iniciar
                </button>
              )}
              {active && (
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-line bg-white px-3 text-xs font-semibold text-brand-ink hover:bg-brand-pale disabled:opacity-50"
                  onClick={handlePause}
                  disabled={isBusy || !active.mine}
                >
                  <Pause className="h-4 w-4" aria-hidden="true" />
                  Pausar
                </button>
              )}
              {item.estadoOperativo !== 'completado' && (
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-mint px-3 text-xs font-semibold text-brand-ink hover:opacity-90 disabled:opacity-50"
                  onClick={handleComplete}
                  disabled={isBusy}
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Completar
                </button>
              )}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-brand-line bg-white px-2.5 text-xs font-semibold text-brand-muted hover:bg-brand-pale"
              onClick={() => onObservation(item.id)}
            >
              <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
              Observar ({item.observationsCount})
            </button>
            {canManage && (
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-brand-line bg-white px-2.5 text-xs font-semibold text-brand-primaryInk hover:bg-brand-pale"
                onClick={() => setShowManage((current) => !current)}
              >
                <UserCog className="h-3.5 w-3.5" aria-hidden="true" />
                Gestionar
              </button>
            )}
          </div>
        </div>
      </div>

      {canManage && showManage && (
        <div className="mt-4 grid gap-4 rounded-lg border border-brand-line bg-brand-pale/30 p-3 lg:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-brand-muted" htmlFor={`assignee-${item.id}`}>
              Asignar responsable
            </label>
            <div className="mt-1 flex gap-2">
              <select
                id={`assignee-${item.id}`}
                className="h-9 min-w-0 flex-1 rounded-lg border border-brand-line bg-white px-2 text-sm"
                value={assignee || (item.assignedUser ? String(item.assignedUser.id) : '')}
                onChange={(event) => setAssignee(event.target.value)}
              >
                <option value="">Sin asignar</option>
                {(mechanicsQuery.data ?? []).map((mechanic) => (
                  <option key={mechanic.id} value={mechanic.id}>
                    {mechanic.nombre}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1 rounded-lg bg-brand-primaryInk px-3 text-xs font-semibold text-white disabled:opacity-50"
                disabled={isBusy}
                onClick={() =>
                  assignMutation.mutate(
                    {
                      id: workOrderId,
                      itemId: item.id,
                      data: { assignedUserId: assignee ? Number(assignee) : null },
                    },
                    {
                      onSuccess: () => notifySuccess('Responsable actualizado.'),
                      onError: (error) =>
                        notifyError(getApiErrorMessage(error, 'No se pudo asignar el trabajo.')),
                    },
                  )
                }
              >
                Asignar
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-brand-muted" htmlFor={`estimate-${item.id}`}>
              Horas estimadas por unidad
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id={`estimate-${item.id}`}
                type="number"
                min="0"
                step="0.25"
                className="h-9 w-28 rounded-lg border border-brand-line bg-white px-2 text-sm"
                value={estimate}
                onChange={(event) => setEstimate(event.target.value)}
                placeholder="0.5"
              />
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1 rounded-lg bg-brand-primaryInk px-3 text-xs font-semibold text-white disabled:opacity-50"
                disabled={isBusy}
                onClick={() =>
                  estimateMutation.mutate(
                    {
                      id: workOrderId,
                      itemId: item.id,
                      data: {
                        horasHombreEstimadas: estimate === '' ? null : Number(estimate),
                      },
                    },
                    {
                      onSuccess: () => notifySuccess('Tiempo estimado actualizado.'),
                      onError: (error) =>
                        notifyError(getApiErrorMessage(error, 'No se pudo actualizar la estimación.')),
                    },
                  )
                }
              >
                Guardar
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-brand-muted" htmlFor={`adjust-${item.id}`}>
              Ajustar horas reales (minutos)
            </label>
            <div className="mt-1 flex flex-wrap gap-2">
              <input
                id={`adjust-${item.id}`}
                type="number"
                step="1"
                className="h-9 w-24 rounded-lg border border-brand-line bg-white px-2 text-sm"
                value={adjustMinutes}
                onChange={(event) => setAdjustMinutes(event.target.value)}
                placeholder="+30"
              />
              <input
                type="text"
                className="h-9 min-w-0 flex-1 rounded-lg border border-brand-line bg-white px-2 text-sm"
                value={adjustReason}
                onChange={(event) => setAdjustReason(event.target.value)}
                placeholder="Motivo del ajuste"
              />
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1 rounded-lg bg-brand-primaryInk px-3 text-xs font-semibold text-white disabled:opacity-50"
                disabled={isBusy || adjustMinutes === '' || adjustReason.trim().length < 2}
                onClick={() =>
                  adjustMutation.mutate(
                    {
                      id: workOrderId,
                      itemId: item.id,
                      data: { minutos: Number(adjustMinutes), motivo: adjustReason },
                    },
                    {
                      onSuccess: () => {
                        setAdjustMinutes('');
                        setAdjustReason('');
                        notifySuccess('Horas ajustadas y auditadas.');
                      },
                      onError: (error) =>
                        notifyError(getApiErrorMessage(error, 'No se pudieron ajustar las horas.')),
                    },
                  )
                }
              >
                Ajustar
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-brand-muted" htmlFor={`validate-${item.id}`}>
              Validar horas reales
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id={`validate-${item.id}`}
                type="text"
                className="h-9 min-w-0 flex-1 rounded-lg border border-brand-line bg-white px-2 text-sm"
                value={validationNote}
                onChange={(event) => setValidationNote(event.target.value)}
                placeholder="Comentario opcional"
              />
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1 rounded-lg bg-brand-mint px-3 text-xs font-semibold text-brand-ink disabled:opacity-50"
                disabled={isBusy || item.horasHombreReales === null}
                onClick={() =>
                  validateMutation.mutate(
                    {
                      id: workOrderId,
                      itemId: item.id,
                      comentario: validationNote || null,
                    },
                    {
                      onSuccess: () => {
                        setValidationNote('');
                        notifySuccess('Horas validadas.');
                      },
                      onError: (error) =>
                        notifyError(getApiErrorMessage(error, 'No se pudieron validar las horas.')),
                    },
                  )
                }
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Validar
              </button>
            </div>
            {item.laborValidationNote && (
              <p className="mt-1 text-xs text-brand-muted">Validación: {item.laborValidationNote}</p>
            )}
          </div>
        </div>
      )}
    </article>
  );
};

export const WorkOrderWorksheetPage = () => {
  const { id } = useParams<{ id: string }>();
  const workOrderId = Number(id);
  const user = useAuthStore((state) => state.user);
  const role = user?.role;
  const isMechanic = role === 'mecanico';
  const canManage = isSupervisorRole(role);
  const canApprovePrices = isAdminRole(role);

  const worksheetQuery = useWorkOrderWorksheet(workOrderId, Boolean(user));
  const worksheet = worksheetQuery.data;
  const progressMutation = useSubmitWorksheetProgressMutation();
  const observationMutation = useCreateObservationMutation();
  const createSuggestionMutation = useCreatePriceSuggestionMutation();
  const reviewSuggestionMutation = useReviewPriceSuggestionMutation();
  const suggestionsQuery = usePriceSuggestions(workOrderId, canManage);

  const [observationText, setObservationText] = useState('');
  const [observationItemId, setObservationItemId] = useState('');
  const [observationReportId, setObservationReportId] = useState('');
  const [observationFiles, setObservationFiles] = useState<File[]>([]);
  const [progressPercent, setProgressPercent] = useState('');
  const [progressComment, setProgressComment] = useState('');
  const [progressBlockers, setProgressBlockers] = useState('');
  const [suggestionItemId, setSuggestionItemId] = useState('');
  const [suggestionPrice, setSuggestionPrice] = useState('');
  const [suggestionScope, setSuggestionScope] =
    useState<WorkOrderPriceSuggestionScope>('ot');
  const [suggestionReason, setSuggestionReason] = useState('');

  const allItems = useMemo(
    () => [...(worksheet?.servicios ?? []), ...(worksheet?.repuestos ?? [])],
    [worksheet],
  );

  if (!user) return null;
  if (!isMechanic && !isSupervisorRole(role)) {
    return <Navigate to="/forbidden" replace />;
  }
  if (!Number.isInteger(workOrderId) || workOrderId <= 0) {
    return <Navigate to="/work-orders" replace />;
  }

  if (worksheetQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-brand-muted">
        <LoaderCircle className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
        Cargando ficha de trabajo...
      </div>
    );
  }

  if (worksheetQuery.isError || !worksheet) {
    return (
      <div className="space-y-4">
        <Link
          to={isMechanic ? '/work-orders/mine' : '/work-orders'}
          className="inline-flex items-center gap-1 text-sm font-semibold text-brand-primaryInk"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver
        </Link>
        <div className="rounded-xl border border-brand-coral/30 bg-brand-coralPale p-5 text-sm text-brand-coralInk">
          {getApiErrorMessage(worksheetQuery.error, 'No se pudo cargar la ficha de trabajo.')}
        </div>
      </div>
    );
  }

  const { workOrder, totals, servicios, repuestos, observations, progressReports } = worksheet;
  const canWorkOnItem = (item: WorkOrderWorksheetItem): boolean => {
    if (!isMechanic) return true;
    return item.assignedUser ? item.assignedUser.id === user.id : true;
  };

  const submitObservation = (): void => {
    if (!observationText.trim() && observationFiles.length === 0) {
      notifyError('Agrega un texto o al menos un archivo.');
      return;
    }
    observationMutation.mutate(
      {
        id: workOrderId,
        data: {
          texto: observationText.trim() || null,
          workOrderItemId: observationItemId ? Number(observationItemId) : null,
          progressReportId: observationReportId ? Number(observationReportId) : null,
        },
        files: observationFiles,
      },
      {
        onSuccess: () => {
          setObservationText('');
          setObservationItemId('');
          setObservationReportId('');
          setObservationFiles([]);
          notifySuccess('Observación registrada.');
        },
        onError: (error) =>
          notifyError(getApiErrorMessage(error, 'No se pudo registrar la observación.')),
      },
    );
  };

  const submitProgress = (): void => {
    const percentage = Number(progressPercent);
    if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100) {
      notifyError('El porcentaje debe ser un número entre 0 y 100.');
      return;
    }
    if (progressComment.trim().length < 2) {
      notifyError('Describe el avance registrado.');
      return;
    }
    progressMutation.mutate(
      {
        id: workOrderId,
        porcentaje: percentage,
        comentario: progressComment.trim(),
        bloqueos: progressBlockers.trim() || null,
      },
      {
        onSuccess: () => {
          setProgressPercent('');
          setProgressComment('');
          setProgressBlockers('');
          notifySuccess('Avance registrado.');
        },
        onError: (error) => notifyError(getApiErrorMessage(error, 'No se pudo registrar el avance.')),
      },
    );
  };

  const submitSuggestion = (): void => {
    if (!canManage || !suggestionItemId) {
      notifyError('Selecciona el servicio a revisar.');
      return;
    }
    if (suggestionReason.trim().length < 2) {
      notifyError('Indica el motivo de la sugerencia.');
      return;
    }
    createSuggestionMutation.mutate(
      {
        id: workOrderId,
        data: {
          workOrderItemId: Number(suggestionItemId),
          precioSugerido: Number(suggestionPrice),
          alcance: suggestionScope,
          motivo: suggestionReason.trim(),
        },
      },
      {
        onSuccess: () => {
          setSuggestionItemId('');
          setSuggestionPrice('');
          setSuggestionReason('');
          notifySuccess('Sugerencia enviada a administración.');
        },
        onError: (error) =>
          notifyError(getApiErrorMessage(error, 'No se pudo enviar la sugerencia.')),
      },
    );
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 rounded-xl border border-brand-line bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Link
            to={isMechanic ? '/work-orders/mine' : `/work-orders/${workOrder.id}`}
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-brand-line bg-white text-brand-muted hover:bg-brand-pale"
            aria-label="Volver"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">
              Ficha de trabajo
            </p>
            <h1 className="font-mono text-2xl font-bold text-brand-primaryInk">{workOrder.codigo}</h1>
            <p className="mt-1 text-sm text-brand-muted">
              {workOrder.vehiculo.patente ?? 'Sin patente'} ·{' '}
              {[workOrder.vehiculo.marca, workOrder.vehiculo.modelo].filter(Boolean).join(' ') ||
                'Sin datos técnicos'}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
          <div className="rounded-lg bg-brand-pale/60 px-3 py-2">
            <p className="text-lg font-bold text-brand-ink">{totals.items}</p>
            <p className="text-xs text-brand-muted">Trabajos</p>
          </div>
          <div className="rounded-lg bg-brand-mintPale px-3 py-2">
            <p className="text-lg font-bold text-brand-mintInk">{totals.completados}</p>
            <p className="text-xs text-brand-muted">Completados</p>
          </div>
          <div className="rounded-lg bg-brand-pale/60 px-3 py-2">
            <p className="text-lg font-bold text-brand-ink">{formatHours(totals.horasEstimadas)}</p>
            <p className="text-xs text-brand-muted">Estimadas</p>
          </div>
          <div className="rounded-lg bg-brand-goldPale px-3 py-2">
            <p className="text-lg font-bold text-brand-goldInk">{formatHours(totals.horasReales)}</p>
            <p className="text-xs text-brand-muted">Reales</p>
          </div>
        </div>
      </header>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-brand-primaryInk" aria-hidden="true" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-brand-ink">Servicios</h2>
        </div>
        {servicios.length === 0 ? (
          <p className="rounded-xl border border-dashed border-brand-line bg-white p-5 text-sm text-brand-muted">
            La orden no tiene servicios registrados.
          </p>
        ) : (
          <div className="space-y-3">
            {servicios.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                workOrderId={workOrderId}
                canWork={canWorkOnItem(item)}
                canManage={canManage}
                onObservation={(itemId) => {
                  setObservationItemId(String(itemId));
                  document.getElementById('observaciones')?.scrollIntoView({ behavior: 'smooth' });
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-brand-primaryInk" aria-hidden="true" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-brand-ink">
            Repuestos (sin precios)
          </h2>
        </div>
        {repuestos.length === 0 ? (
          <p className="rounded-xl border border-dashed border-brand-line bg-white p-5 text-sm text-brand-muted">
            No hay repuestos asociados.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-brand-line bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-brand-pale/60 text-xs uppercase tracking-wide text-brand-muted">
                <tr>
                  <th className="px-4 py-3">Repuesto</th>
                  <th className="px-4 py-3">Cantidad</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Responsable</th>
                </tr>
              </thead>
              <tbody>
                {repuestos.map((item) => (
                  <tr key={item.id} className="border-t border-brand-line">
                    <td className="px-4 py-3 font-medium text-brand-ink">{item.descripcion}</td>
                    <td className="px-4 py-3 text-brand-muted">
                      {item.cantidad} {item.unidadMedida}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[item.estadoOperativo]}`}
                      >
                        {STATUS_LABELS[item.estadoOperativo]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-brand-muted">
                      {item.assignedUser?.nombre ?? 'Sin asignar'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section id="observaciones" className="rounded-xl border border-brand-line bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <MessageSquarePlus className="h-4 w-4 text-brand-primaryInk" aria-hidden="true" />
            <h2 className="text-sm font-bold uppercase tracking-wide text-brand-ink">
              Observaciones
            </h2>
          </div>

          <div className="mt-4 space-y-3">
            <textarea
              className="min-h-24 w-full rounded-lg border border-brand-line bg-white p-3 text-sm"
              placeholder="Describe el hallazgo, el trabajo realizado o lo que falta..."
              value={observationText}
              onChange={(event) => setObservationText(event.target.value)}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                className="h-9 rounded-lg border border-brand-line bg-white px-2 text-sm"
                value={observationItemId}
                onChange={(event) => setObservationItemId(event.target.value)}
              >
                <option value="">Sin trabajo asociado</option>
                {allItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.descripcion}
                  </option>
                ))}
              </select>
              <select
                className="h-9 rounded-lg border border-brand-line bg-white px-2 text-sm"
                value={observationReportId}
                onChange={(event) => setObservationReportId(event.target.value)}
              >
                <option value="">Sin reporte de avance</option>
                {progressReports.map((report) => (
                  <option key={report.id} value={report.id}>
                    Avance {report.porcentaje}% · {formatDateTime(report.createdAt)}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-brand-line bg-brand-pale/30 px-3 py-2 text-sm text-brand-muted">
              <Paperclip className="h-4 w-4" aria-hidden="true" />
              <span>
                {observationFiles.length === 0
                  ? 'Adjuntar fotos o documento (máx. 5)'
                  : `${observationFiles.length} archivo(s) seleccionado(s)`}
              </span>
              <input
                type="file"
                className="sr-only"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                multiple
                onChange={(event) =>
                  setObservationFiles(Array.from(event.target.files ?? []).slice(0, 5))
                }
              />
            </label>
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primaryInk px-4 text-sm font-semibold text-white hover:bg-brand-primaryInkHover disabled:opacity-50"
              onClick={submitObservation}
              disabled={observationMutation.isPending}
            >
              {observationMutation.isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )}
              Registrar observación
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {observations.length === 0 && (
              <p className="text-sm text-brand-muted">Aún no hay observaciones registradas.</p>
            )}
            {observations.map((observation) => (
              <article key={observation.id} className="rounded-lg border border-brand-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-brand-muted">
                  <span className="font-semibold text-brand-ink">
                    {observation.authorName ?? 'Usuario'}
                  </span>
                  <span>{formatDateTime(observation.createdAt)}</span>
                </div>
                {observation.itemDescripcion && (
                  <p className="mt-1 text-xs font-medium text-brand-primaryInk">
                    {observation.itemDescripcion}
                  </p>
                )}
                {observation.texto && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-brand-ink">
                    {observation.texto}
                  </p>
                )}
                {observation.files.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {observation.files.map((file) => (
                      <li key={file.id}>
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-brand-line px-2 py-1 text-xs font-semibold text-brand-primaryInk hover:bg-brand-pale"
                        >
                          <FileText className="h-3 w-3" aria-hidden="true" />
                          {file.nombreOriginal}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-brand-line bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-brand-primaryInk" aria-hidden="true" />
            <h2 className="text-sm font-bold uppercase tracking-wide text-brand-ink">
              Reporte de avance
            </h2>
          </div>
          <div className="mt-4 space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                type="number"
                min="0"
                max="100"
                className="h-9 rounded-lg border border-brand-line bg-white px-2 text-sm"
                placeholder="% avance"
                value={progressPercent}
                onChange={(event) => setProgressPercent(event.target.value)}
              />
              <input
                type="text"
                className="h-9 rounded-lg border border-brand-line bg-white px-2 text-sm sm:col-span-2"
                placeholder="Comentario del avance"
                value={progressComment}
                onChange={(event) => setProgressComment(event.target.value)}
              />
            </div>
            <input
              type="text"
              className="h-9 w-full rounded-lg border border-brand-line bg-white px-2 text-sm"
              placeholder="Bloqueos o pendientes (opcional)"
              value={progressBlockers}
              onChange={(event) => setProgressBlockers(event.target.value)}
            />
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primaryInk disabled:opacity-50"
              onClick={submitProgress}
              disabled={progressMutation.isPending}
            >
              {progressMutation.isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
              Registrar avance
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {progressReports.length === 0 && (
              <p className="text-sm text-brand-muted">Sin reportes de avance.</p>
            )}
            {progressReports.map((report) => (
              <article key={report.id} className="rounded-lg border border-brand-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full bg-brand-pale px-2 py-0.5 text-xs font-bold text-brand-primaryInk">
                    {report.porcentaje}%
                  </span>
                  <span className="text-xs text-brand-muted">
                    {formatDateTime(report.createdAt)} · {report.mechanic?.nombre ?? 'Taller'}
                  </span>
                </div>
                <p className="mt-2 text-sm text-brand-ink">{report.comentario}</p>
                {report.bloqueos && (
                  <p className="mt-1 text-xs text-brand-coralInk">Bloqueos: {report.bloqueos}</p>
                )}
                {report.horasCerradas !== null && (
                  <p className="mt-1 text-xs text-brand-muted">
                    Horas reales acumuladas: {formatHours(report.horasCerradas)}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>

      {canManage && (
        <section className="rounded-xl border border-brand-line bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-brand-primaryInk" aria-hidden="true" />
            <h2 className="text-sm font-bold uppercase tracking-wide text-brand-ink">
              Sugerencias de precio (jefe de taller)
            </h2>
          </div>
          <p className="mt-1 text-xs text-brand-muted">
            La aprobación final corresponde a administración. El mecánico no ve esta sección.
          </p>

          <div className="mt-4 grid gap-2 lg:grid-cols-5">
            <select
              className="h-9 rounded-lg border border-brand-line bg-white px-2 text-sm lg:col-span-2"
              value={suggestionItemId}
              onChange={(event) => {
                setSuggestionItemId(event.target.value);
                const selected = servicios.find(
                  (item) => item.id === Number(event.target.value),
                );
                if (selected) setSuggestionPrice('');
              }}
            >
              <option value="">Servicio a revisar</option>
              {servicios.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.descripcion} · real {formatHours(item.horasHombreReales)}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              className="h-9 rounded-lg border border-brand-line bg-white px-2 text-sm"
              placeholder="Precio sugerido"
              value={suggestionPrice}
              onChange={(event) => setSuggestionPrice(event.target.value)}
            />
            <select
              className="h-9 rounded-lg border border-brand-line bg-white px-2 text-sm"
              value={suggestionScope}
              onChange={(event) =>
                setSuggestionScope(event.target.value as WorkOrderPriceSuggestionScope)
              }
            >
              {SCOPES.map((scope) => (
                <option key={scope.value} value={scope.value}>
                  {scope.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-brand-primaryInk px-3 text-xs font-semibold text-white disabled:opacity-50"
              onClick={submitSuggestion}
              disabled={
                createSuggestionMutation.isPending ||
                !suggestionItemId ||
                suggestionPrice === '' ||
                suggestionReason.trim().length < 2
              }
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Sugerir
            </button>
          </div>
          <input
            type="text"
            className="mt-2 h-9 w-full rounded-lg border border-brand-line bg-white px-2 text-sm"
            placeholder="Motivo de la sugerencia (horas reales vs. estimadas, complejidad, etc.)"
            value={suggestionReason}
            onChange={(event) => setSuggestionReason(event.target.value)}
          />

          <div className="mt-4 space-y-2">
            {(suggestionsQuery.data ?? []).length === 0 && (
              <p className="text-sm text-brand-muted">Sin sugerencias registradas.</p>
            )}
            {(suggestionsQuery.data ?? []).map((suggestion) => (
              <article
                key={suggestion.id}
                className="flex flex-col gap-2 rounded-lg border border-brand-line p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-brand-ink">
                    {suggestion.itemDescripcion ?? 'Servicio'} ·{' '}
                    {`$${suggestion.precioSugerido.toLocaleString('es-CL')}`}
                  </p>
                  <p className="text-xs text-brand-muted">
                    Alcance: {SCOPES.find((scope) => scope.value === suggestion.alcance)?.label} ·
                    Estado: {suggestion.estado} · {suggestion.createdByName ?? 'Taller'}
                  </p>
                  <p className="mt-1 text-xs text-brand-muted">{suggestion.motivo}</p>
                </div>
                {canApprovePrices && suggestion.estado === 'pendiente' && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="inline-flex h-8 items-center rounded-lg bg-brand-mint px-3 text-xs font-semibold text-brand-ink disabled:opacity-50"
                      disabled={reviewSuggestionMutation.isPending}
                      onClick={() =>
                        reviewSuggestionMutation.mutate(
                          {
                            id: workOrderId,
                            suggestionId: suggestion.id,
                            data: { decision: 'aprobar' },
                          },
                          {
                            onSuccess: () => notifySuccess('Sugerencia aprobada y aplicada.'),
                            onError: (error) =>
                              notifyError(getApiErrorMessage(error, 'No se pudo aprobar.')),
                          },
                        )
                      }
                    >
                      Aprobar
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-8 items-center rounded-lg border border-brand-line px-3 text-xs font-semibold text-brand-coralInk disabled:opacity-50"
                      disabled={reviewSuggestionMutation.isPending}
                      onClick={() =>
                        reviewSuggestionMutation.mutate(
                          {
                            id: workOrderId,
                            suggestionId: suggestion.id,
                            data: { decision: 'rechazar' },
                          },
                          {
                            onSuccess: () => notifySuccess('Sugerencia rechazada.'),
                            onError: (error) =>
                              notifyError(getApiErrorMessage(error, 'No se pudo rechazar.')),
                          },
                        )
                      }
                    >
                      Rechazar
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default WorkOrderWorksheetPage;
