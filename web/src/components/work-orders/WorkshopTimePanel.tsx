import { createWorkshopTimeRequestSchema } from '@unithor/shared';
import { Clock3 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
  useCreateWorkshopTimeRequestMutation,
  useReviewWorkshopTimeRequestMutation,
  useWorkshopTime,
  useWorkshopTimeEligibleItems,
} from '../../hooks/useWorkshopTime';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatDate, formatDateTime } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { formatWorkshopMinutes as minutesLabel } from '../../lib/workshop-time-format';
import { useAuthStore } from '../../stores/auth.store';

import type {
  CreateWorkshopTimeRequestInput,
  WorkshopTimeEntry,
  WorkshopTimeActivityStatus,
  WorkshopTimeRequestRecord,
} from '@unithor/shared';
import type { FormEvent } from 'react';

export interface WorkshopTimePanelProps {
  /** Limits service selectors and history rows; totals still describe the whole worker day. */
  workOrderId?: number;
  /** YYYY-MM-DD. Defaults to the browser's current calendar day. */
  initialDate?: string;
  initialOvertime?: boolean;
  /** Lets a containing dialog protect drafts and in-flight submissions. */
  onState?: (dirty: boolean, pending: boolean) => void;
}

const localDate = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const localInput = (value: string): string => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
};
const statusLabels = {
  pendiente: 'Pendiente de validación',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
} as const;

function ReviewRequest({
  request,
  enabled,
  onState,
}: {
  request: WorkshopTimeRequestRecord;
  enabled: boolean;
  onState: (id: number, dirty: boolean, pending: boolean) => void;
}) {
  const mutation = useReviewWorkshopTimeRequestMutation();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    onState(request.id, Boolean(note.trim()), mutation.isPending);
  }, [onState, request.id, note, mutation.isPending]);
  useEffect(() => () => onState(request.id, false, false), [onState, request.id]);
  const review = (approve: boolean): void => {
    setError(null);
    mutation.mutate(
      { id: request.id, data: { approve, note } },
      {
        onSuccess: () => setNote(''),
        onError: (cause) =>
          setError(`${getApiErrorMessage(cause)} El motivo se conserva para reintentar.`),
      },
    );
  };
  return (
    <div className="workshop-labor-detail-body">
      <label>
        Motivo de revisión #{request.id}
        <textarea
          maxLength={2000}
          value={note}
          disabled={mutation.isPending || !enabled}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <div className="workshop-labor-actions">
        <button
          type="button"
          disabled={!enabled || !note.trim() || mutation.isPending}
          onClick={() => review(true)}
        >
          Aprobar solicitud #{request.id}
        </button>
        <button
          type="button"
          disabled={!enabled || !note.trim() || mutation.isPending}
          onClick={() => review(false)}
        >
          Rechazar solicitud #{request.id}
        </button>
      </div>
      {error && (
        <p className="workshop-labor-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default function WorkshopTimePanel({
  workOrderId,
  initialDate,
  initialOvertime = false,
  onState,
}: WorkshopTimePanelProps = {}) {
  const user = useAuthStore((state) => state.user);
  const supervisor = Boolean(user && ['admin', 'desarrollador', 'jefe'].includes(user.role));
  const allowed = Boolean(
    user && (supervisor || user.role === 'mecanico') && hasUserPermission(user, 'taller', 'read'),
  );
  const editable = Boolean(allowed && user && hasUserPermission(user, 'taller', 'update'));
  const [date, setDate] = useState(initialDate ?? localDate);
  const [filterWorker, setFilterWorker] = useState('');
  const [manualWorker, setManualWorker] = useState('');
  const [activityStatus, setActivityStatus] = useState<WorkshopTimeActivityStatus>('en_proceso');
  const [itemId, setItemId] = useState('');
  const [startedAt, setStartedAt] = useState('');
  const [endedAt, setEndedAt] = useState('');
  const [note, setNote] = useState('');
  const [source, setSource] = useState<WorkshopTimeEntry | null>(null);
  const defaultOvertime = initialOvertime && supervisor;
  const [overtime, setOvertime] = useState(defaultOvertime);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const [reviewStates, setReviewStates] = useState<
    Record<number, { dirty: boolean; pending: boolean }>
  >({});
  const onReviewState = useCallback((id: number, dirty: boolean, pending: boolean): void => {
    setReviewStates((current) => {
      if (!dirty && !pending && !current[id]) return current;
      if (current[id]?.dirty === dirty && current[id]?.pending === pending) return current;
      const next = { ...current };
      if (!dirty && !pending) delete next[id];
      else next[id] = { dirty, pending };
      return next;
    });
  }, []);
  const journal = useWorkshopTime(
    date,
    supervisor && filterWorker ? Number(filterWorker) : undefined,
    allowed,
  );
  const eligible = useWorkshopTimeEligibleItems(
    supervisor && manualWorker ? Number(manualWorker) : undefined,
    editable && (!supervisor || Boolean(manualWorker)),
    startedAt.slice(0, 10) || date,
  );
  const create = useCreateWorkshopTimeRequestMutation();
  const items = (eligible.data ?? []).filter(
    (item) => workOrderId === undefined || item.workOrderId === workOrderId,
  );
  const entries = (journal.data?.entries ?? []).filter(
    (entry) => workOrderId === undefined || entry.workOrderId === workOrderId,
  );
  const requests = (journal.data?.requests ?? []).filter(
    (request) => workOrderId === undefined || request.workOrderId === workOrderId,
  );
  const dirty =
    allowed &&
    (Boolean(source || itemId || startedAt || endedAt || note || activityStatus !== 'en_proceso' || (supervisor && overtime !== defaultOvertime)) ||
      Object.values(reviewStates).some((state) => state.dirty));
  const pending = create.isPending || Object.values(reviewStates).some((state) => state.pending);
  useEffect(() => {
    onState?.(dirty, pending);
  }, [onState, dirty, pending]);
  useEffect(() => () => onState?.(false, false), [onState]);

  if (!allowed) return null;

  const beginCorrection = (entry: WorkshopTimeEntry): void => {
    if (entry.reportedDate) return;
    setSource(entry);
    setStartedAt(localInput(entry.startedAt));
    setEndedAt(entry.endedAt ? localInput(entry.endedAt) : '');
    setNote('');
    setFeedback(null);
  };
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const start = new Date(startedAt);
    const end = new Date(endedAt);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      setFeedback({ error: true, text: 'Indica inicio y fin válidos. Tus datos se conservan.' });
      return;
    }
    const selected = items.find((item) => (item.dpStageId ? `${item.itemId}:${item.dpStageId}` : String(item.itemId)) === itemId);
    if (!source && (!selected || selected.blocked || (supervisor && !manualWorker))) {
      setFeedback({
        error: true,
        text: 'Selecciona un trabajador y un servicio asignado vigente. Tus datos se conservan.',
      });
      return;
    }
    const data: CreateWorkshopTimeRequestInput = source
      ? {
          sourceSessionId: source.id,
          startedAt: start.toISOString(),
          endedAt: end.toISOString(),
          note,
        }
      : {
          workOrderId: selected!.workOrderId,
          itemId: selected!.itemId,
          ...(selected!.dpStageId ? { dpStageId: selected!.dpStageId } : {}),
          ...(supervisor ? { userId: Number(manualWorker) } : {}),
          overtime: supervisor && overtime,
          activityStatus,
          startedAt: start.toISOString(),
          endedAt: end.toISOString(),
          note,
        };
    const parsed = createWorkshopTimeRequestSchema.safeParse(data);
    if (!parsed.success) {
      setFeedback({ error: true, text: parsed.error.issues[0]?.message ?? 'Revisa el intervalo.' });
      return;
    }
    setFeedback(null);
    create.mutate(parsed.data, {
      onSuccess: (request) => {
        setNote('');
        setStartedAt('');
        setEndedAt('');
        setItemId('');
        setSource(null);
        setActivityStatus('en_proceso');
        setOvertime(defaultOvertime);
        setDate(startedAt.slice(0, 10));
        if (supervisor) setFilterWorker(String(request.userId));
        setFeedback({
          error: false,
          text:
            request.status === 'aprobada'
              ? 'Horas registradas y aceptadas para el trabajador.'
              : 'Solicitud guardada. Pendiente de validación del jefe; aún no suma horas.',
        });
      },
      onError: (cause) =>
        setFeedback({
          error: true,
          text: `${getApiErrorMessage(cause)} Tus datos se conservan para reintentar.`,
        }),
    });
  };
  const totals = journal.data?.totals;

  return (
    <section className="workshop-labor-board" aria-label="Diario de horas de taller">
      <div className="workshop-labor-toolbar flex-wrap">
        <div>
          <h2>Diario de horas</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <label>
            Día del diario
            <input
              type="date"
              value={date}
              onChange={(event) => {
                if (event.target.value) setDate(event.target.value);
              }}
            />
          </label>
          {supervisor && (
            <label>
              Filtrar trabajador
              <select
                value={filterWorker}
                onChange={(event) => setFilterWorker(event.target.value)}
              >
                <option value="">Todos los trabajadores</option>
                {journal.data?.workers.map((worker) => (
                  <option key={worker.id} value={worker.id}>
                    {worker.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>
      {journal.isPending && <p role="status">Cargando diario…</p>}
      {journal.isError && (
        <div role="alert" className="workshop-labor-error">
          {getApiErrorMessage(journal.error, 'No se pudo cargar el diario.')}
          <button
            type="button"
            onClick={() => {
              void journal.refetch();
            }}
          >
            Reintentar diario
          </button>
        </div>
      )}
      {totals && (
        <div className="workshop-labor-hours" aria-label="Totales de la jornada">
          <span>
            <Clock3 aria-hidden="true" />
            Registrado: {minutesLabel(totals.registeredMinutes)}
          </span>
          <span>Pendiente: {minutesLabel(totals.pendingMinutes)}</span>
          {totals.scheduledMinutes === null ? (
            <span>Jornada sin configurar</span>
          ) : (
            <>
              <span>Jornada: {minutesLabel(totals.scheduledMinutes)}</span>
              <span>Sin registrar: {minutesLabel(totals.unregisteredMinutes ?? 0)}</span>
            </>
          )}
          {workOrderId !== undefined && (
            <span>Totales del día completo; historial de esta OT.</span>
          )}
        </div>
      )}
      {editable && (
        <details className="workshop-labor-details" open>
          <summary>
            {source
              ? `Solicitar corrección del registro #${source.id}`
              : overtime && supervisor ? 'Registrar horas extra' : 'Registrar intervalo manual'}
          </summary>
          <form
            className="workshop-labor-detail-body"
            onSubmit={submit}
            aria-label="Registro de intervalo"
          >
            {source ? (
              <p>
                {source.workOrderCode} · {source.description}. El original se conserva y cuenta
                hasta que el jefe apruebe la corrección.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {supervisor && (
                  <label>
                    Trabajador del registro
                    <select
                      required
                      value={manualWorker}
                      disabled={create.isPending}
                      onChange={(event) => {
                        setManualWorker(event.target.value);
                        setItemId('');
                      }}
                    >
                      <option value="">Seleccionar trabajador</option>
                      {journal.data?.workers.map((worker) => (
                        <option key={worker.id} value={worker.id}>
                          {worker.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Servicio asignado
                  <select
                    required
                    value={itemId}
                    disabled={
                      create.isPending || eligible.isFetching || (supervisor && !manualWorker)
                    }
                    onChange={(event) => setItemId(event.target.value)}
                  >
                    <option value="">Seleccionar servicio</option>
                    {items.map((item) => (
                      <option key={`${item.itemId}:${item.dpStageId ?? 'service'}`} value={item.dpStageId ? `${item.itemId}:${item.dpStageId}` : String(item.itemId)} disabled={item.blocked}>
                        {item.patente ? `${item.patente} · ` : ''}{item.workOrderCode} · {item.description}{item.blocked ? ' · Espera la etapa anterior' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {!source && eligible.isError && (
              <p role="alert">
                {getApiErrorMessage(eligible.error, 'No se pudieron cargar los servicios.')}{' '}
                <button
                  type="button"
                  onClick={() => {
                    void eligible.refetch();
                  }}
                >
                  Reintentar servicios
                </button>
              </p>
            )}
            {!source && eligible.isSuccess && !items.length && (
              <p>No hay servicios de OT activas asignados a este trabajador.</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                Inicio del intervalo
                <input
                  type="datetime-local"
                  step="1"
                  required
                  value={startedAt}
                  disabled={create.isPending}
                  onChange={(event) => setStartedAt(event.target.value)}
                />
              </label>
              <label>
                Fin del intervalo
                <input
                  type="datetime-local"
                  step="1"
                  required
                  value={endedAt}
                  disabled={create.isPending}
                  onChange={(event) => setEndedAt(event.target.value)}
                />
              </label>
            </div>
            <label>
              Motivo del registro
              <textarea
                required
                maxLength={2000}
                value={note}
                disabled={create.isPending}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            {!source && (
              <label>
                Estado de mi actividad
                <select value={activityStatus} disabled={create.isPending}
                  onChange={(event) => setActivityStatus(event.target.value as WorkshopTimeActivityStatus)}>
                  <option value="en_proceso">En proceso</option>
                  <option value="completado">Finalizado por el trabajador</option>
                </select>
              </label>
            )}
            <p className="workshop-labor-help">
              El avance se aplica al aprobar,
              si sigue vigente. Finalizar tu parte conserva el avance del resto del equipo y requiere control de calidad.
            </p>
            {supervisor && !source && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto', alignSelf: 'center', margin: 0 }}
                  checked={overtime}
                  disabled={create.isPending}
                  onChange={(event) => setOvertime(event.target.checked)}
                />
                Registrar como horas extra
              </label>
            )}
            {source?.overtime && <p>Horas extra: la corrección conserva esta clasificación.</p>}
            {supervisor && !source && overtime && (
              <p className="workshop-labor-help">
                El intervalo debe quedar completamente fuera de la jornada ordinaria. Si cruza
                el cierre, registra dos intervalos separados. Las horas extra se incluyen en las horas registradas.
              </p>
            )}
            <p className="workshop-labor-help">
              {source || !supervisor
                ? 'Requiere validación del jefe antes de modificar las horas registradas.'
                : 'Se acepta directamente y se atribuye al trabajador elegido. Justifica el registro retroactivo y las horas fuera de jornada en el motivo.'}
            </p>
            <div className="workshop-labor-actions">
              <button type="submit" disabled={create.isPending || !note.trim()}>
                {create.isPending
                  ? 'Guardando…'
                  : source
                    ? 'Enviar corrección al jefe'
                    : supervisor
                      ? 'Guardar horas aceptadas'
                      : 'Enviar horas al jefe'}
              </button>
              {source && (
                <button
                  type="button"
                  disabled={create.isPending}
                  onClick={() => {
                    setSource(null);
                    setOvertime(defaultOvertime);
                    setStartedAt('');
                    setEndedAt('');
                    setNote('');
                    setFeedback(null);
                  }}
                >
                  Cancelar corrección
                </button>
              )}
            </div>
          </form>
        </details>
      )}
      {feedback && (
        <p
          role={feedback.error ? 'alert' : 'status'}
          className={feedback.error ? 'workshop-labor-error' : 'workshop-labor-help'}
        >
          {feedback.text}
        </p>
      )}
      <details className="workshop-labor-details" open>
        <summary>
          Solicitudes
          <span>
            {requests.filter((request) => request.status === 'pendiente').length} pendientes
          </span>
        </summary>
        <div className="workshop-labor-detail-body">
          {!requests.length && <p>Sin solicitudes para este día.</p>}
          {requests.map((request) => (
            <article
              className="workshop-labor-task"
              key={request.id}
              aria-label={`Solicitud de horas #${request.id}`}
            >
              <div className="workshop-labor-task-top">
                <strong>
                  {request.workOrderCode} · {request.description}
                </strong>
                <span className="workshop-labor-state">{statusLabels[request.status]}</span>
              </div>
              <p>
                {request.userName} ·{' '}
                {request.kind === 'correction'
                  ? `Corrección del registro #${request.sourceSessionId}`
                  : 'Registro manual'}{' '}
                · {minutesLabel(request.durationMinutes)}
                {request.overtime && ' · Horas extra'}
              </p>
              <p>
                {request.reportedDate
                  ? `${formatDate(request.reportedDate)} · Horas declaradas`
                  : `${formatDateTime(request.startedAt)} → ${formatDateTime(request.endedAt)}`}
              </p>
              <p>{request.note}</p>
              {request.activityStatus && <p>Actividad declarada: {request.activityStatus === 'completado' ? 'Finalizado por el trabajador' : 'En proceso'}</p>}
              {request.reviewNote && <p>Motivo de revisión: {request.reviewNote}</p>}
              {request.status === 'pendiente' && supervisor && (
                <ReviewRequest request={request} enabled={editable} onState={onReviewState} />
              )}
            </article>
          ))}
        </div>
      </details>
      <details className="workshop-labor-details" open>
        <summary>
          Historial registrado<span>{entries.length} registros</span>
        </summary>
        <div className="workshop-labor-detail-body">
          {!entries.length && <p>Sin horas registradas para este día.</p>}
          {entries.map((entry) => (
            <article
              key={entry.id}
              className="workshop-labor-task"
              aria-label={`Registro de horas #${entry.id}`}
            >
              <strong>
                {entry.workOrderCode} · {entry.description}
              </strong>
              <p>
                {entry.userName ?? 'Trabajador'} · {minutesLabel(entry.durationMinutes)} ·{' '}
                {entry.kind === 'manual'
                  ? 'Manual'
                  : entry.kind === 'ajuste'
                    ? 'Ajuste'
                    : 'Cronómetro'}
                {entry.overtime && ' · Horas extra'}
              </p>
              <p>
                {entry.reportedDate
                  ? `${formatDate(entry.reportedDate)} · Horas declaradas`
                  : `${formatDateTime(entry.startedAt)} → ${entry.endedAt ? formatDateTime(entry.endedAt) : 'En curso'}`}
              </p>
              {entry.note && <p>{entry.note}</p>}
              {entry.supersededAt && (
                <p>Original conservado · reemplazado por corrección aprobada; no suma horas.</p>
              )}
              {editable &&
                entry.userId === user?.id &&
                entry.status === 'cerrada' &&
                !entry.supersededAt &&
                !entry.reportedDate &&
                entry.kind !== 'ajuste' &&
                !requests.some(
                  (request) =>
                    request.sourceSessionId === entry.id && request.status === 'pendiente',
                ) && (
                  <button
                    type="button"
                    disabled={create.isPending}
                    onClick={() => beginCorrection(entry)}
                  >
                    Solicitar corrección #{entry.id}
                  </button>
                )}
            </article>
          ))}
        </div>
      </details>
    </section>
  );
}
