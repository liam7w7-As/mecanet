import { WORK_ORDER_OBSERVATION_FILE_MIME_TYPES, WORK_ORDER_OBSERVATION_MAX_FILES, WORK_ORDER_OBSERVATION_MAX_FILE_BYTES } from '@unithor/shared';
import { AlertCircle, BadgeDollarSign, Check, Clock3, LoaderCircle, Pause, Play, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import WorkOrderAccSection from './WorkOrderAccSection';
import WorkOrderDpSection from './WorkOrderDpSection';
import WorkOrderObservationFiles from './WorkOrderObservationFiles';
import WorkOrderTeamEditor, { ItemEstimateReasonDialog } from './WorkOrderTeamEditor';
import { useModalOverlay } from '../../hooks/useModalOverlay';
import {
  useAssignWorkOrderItemMutation, useCompleteItemTimerMutation,
  useCreateObservationMutation, useStartItemTimerMutation,
  useUpdateItemEstimateMutation, useValidateItemHoursMutation, useWorkOrderWorksheet,
} from '../../hooks/useWorkOrderLabor';
import { useAssignWorkOrderMechanicMutation, useMechanics, useUpdateWorkOrderExecutionMutation } from '../../hooks/useWorkOrders';
import { usePauseWorkshopTimerMutation } from '../../hooks/useWorkshopTime';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDate, formatDateTime } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { formatWorkshopMinutes as minutesLabel } from '../../lib/workshop-time-format';
import { useAuthStore } from '../../stores/auth.store';
import { notifyError, notifySuccess } from '../../stores/toast.store';


import type { WorkOrder, WorkOrderWorksheetItem, WorkOrderWorksheetObservation } from '../../types/entities';
import type { ItemOperationalStatus } from '@unithor/shared';

const labels = { pendiente: 'Pendiente', en_proceso: 'En proceso', completado: 'Completado', omitido: 'Omitido' } as const;

function PauseReasonDialog({ reason, onReason, pending, error, onClose, onConfirm }: {
  reason: string; onReason: (value: string) => void; pending: boolean;
  error: string | null; onClose: () => void; onConfirm: () => void;
}) {
  const titleId = useId();
  const panelRef = useModalOverlay({ isOpen: true, onClose, isPending: pending, labelledBy: titleId });
  return createPortal(<div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-[#18273c55] p-4 backdrop-blur-sm">
    <section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="workshop-action-dialog relative w-full max-w-[440px] bg-white p-6 shadow-2xl">
      <h2 id={titleId} className="text-lg font-semibold text-brand-ink">Pausar trabajo</h2>
      <label className="mt-4 grid gap-2 text-sm text-brand-ink">Motivo de la pausa<textarea className="form-control" rows={3} maxLength={2000} value={reason} disabled={pending} onChange={(event) => onReason(event.target.value)} /></label>
      <p className="mt-2 text-xs text-brand-muted">Motivo opcional.</p>
      {error && <p role="alert" className="workshop-labor-error mt-3">{error}</p>}
      <div className="dialog-buttons mt-5">
        <button type="button" className="secondary-button" disabled={pending} onClick={onClose}>Volver</button>
        <button type="button" className="primary-button" disabled={pending || reason.trim().length > 2000} onClick={onConfirm}>{pending ? 'Guardando…' : 'Confirmar pausa'}</button>
      </div>
    </section>
  </div>, document.body);
}

const observationError = (text: string, files: readonly File[]): string | null => {
  if (text.trim().length > 2000) return 'La observación admite hasta 2000 caracteres.';
  if (files.length > WORK_ORDER_OBSERVATION_MAX_FILES) return `Puedes adjuntar hasta ${WORK_ORDER_OBSERVATION_MAX_FILES} archivos por observación.`;
  for (const file of files) {
    if (!(WORK_ORDER_OBSERVATION_FILE_MIME_TYPES as readonly string[]).includes(file.type.toLowerCase())) return `${file.name}: usa JPEG, PNG, WebP o PDF.`;
    if (file.size === 0) return `${file.name}: el archivo está vacío.`;
    if (file.size > WORK_ORDER_OBSERVATION_MAX_FILE_BYTES) return `${file.name}: el archivo supera el límite de 10 MB.`;
  }
  return null;
};

const appendFiles = (current: File[], selected: File[]): File[] => {
  const key = (file: File) => `${file.name}:${file.size}:${file.type}:${file.lastModified}`;
  const existing = new Set(current.map(key));
  return [...current, ...selected.filter((file) => {
    if (existing.has(key(file))) return false;
    existing.add(key(file));
    return true;
  })];
};

const GeneralObservations = ({ workOrderId, entries, editable, onState }: { workOrderId: number; entries: TaskProps['observations']; editable: boolean; onState: TaskProps['onState'] }) => {
  const mutation = useCreateObservationMutation();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const error = observationError(text, files);
  useEffect(() => onState(0, Boolean(text.trim() || files.length), mutation.isPending), [onState, text, files.length, mutation.isPending]);
  useEffect(() => () => onState(0, false, false), [onState]);
  return <details className="workshop-labor-details"><summary>Observaciones generales<span>{entries.length} registros · imágenes y documentos</span></summary><div className="workshop-labor-detail-body">
    {entries.map((entry) => <article className="workshop-labor-observation" key={entry.id}><p>{entry.texto}</p><small>{entry.authorName ?? 'Taller'} · {formatDateTime(entry.createdAt)}</small>{entry.files.map((file) => <a key={file.id} href={file.url} target="_blank" rel="noreferrer">{file.nombreOriginal}</a>)}</article>)}
    {!entries.length && <p>Sin observaciones generales.</p>}
    {editable && <><label>Observación general<textarea value={text} maxLength={2000} disabled={mutation.isPending} onChange={(event) => setText(event.target.value)} /></label><label>Adjuntos de la orden<input type="file" accept={WORK_ORDER_OBSERVATION_FILE_MIME_TYPES.join(',')} multiple disabled={mutation.isPending} onChange={(event) => { const selected = Array.from(event.target.files ?? []); setFiles((current) => appendFiles(current, selected)); event.target.value = ''; }} /></label>
      {files.map((file, index) => <button key={`${file.name}-${index}`} type="button" disabled={mutation.isPending} onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}>Quitar {file.name}</button>)}
      {error && <p role="alert">{error}</p>}
      <button type="button" disabled={mutation.isPending || Boolean(error) || (!text.trim() && !files.length)} onClick={() => mutation.mutate({ id: workOrderId, data: { texto: text || null, workOrderItemId: null, progressReportId: null }, files }, { onSuccess: () => { setText(''); setFiles([]); notifySuccess('Observación guardada.'); }, onError: (error) => notifyError(getApiErrorMessage(error, 'No se pudo guardar. La observación y sus archivos siguen disponibles para reintentar.')) })}>Guardar observación general</button></>}
  </div></details>;
};

interface TaskProps {
  item: WorkOrderWorksheetItem;
  workOrderId: number;
  canManage: boolean;
  autoOpenTeam: boolean;
  closed: boolean;
  available: boolean;
  observations: WorkOrderWorksheetObservation[];
  onState: (id: number, dirty: boolean, pending: boolean) => void;
  onSuggestPrice?: (itemId: number) => void;
  onNext?: () => void;
  onCompleted: () => void;
  accessory?: boolean;
}

const Task = ({ item, workOrderId, canManage, autoOpenTeam, closed, available, observations, onState, onSuggestPrice, onNext, onCompleted, accessory = false }: TaskProps) => {
  const actorId = useAuthStore((state) => state.user?.id);
  const actorRole = useAuthStore((state) => state.user?.role);
  const start = useStartItemTimerMutation();
  const pause = usePauseWorkshopTimerMutation();
  const complete = useCompleteItemTimerMutation();
  const assign = useAssignWorkOrderItemMutation();
  const estimate = useUpdateItemEstimateMutation();
  const validate = useValidateItemHoursMutation();
  const execution = useUpdateWorkOrderExecutionMutation();
  const observation = useCreateObservationMutation();
  const mechanics = useMechanics(canManage && !closed);
  const [note, setNote] = useState<string | null>(null);
  const [fullInstructions, setFullInstructions] = useState(false);
  const [fullObservation, setFullObservation] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState('');
  const [pauseError, setPauseError] = useState<string | null>(null);
  const [estimated, setEstimated] = useState<string | null>(null);
  const [estimateReason, setEstimateReason] = useState('');
  const [confirmEstimate, setConfirmEstimate] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [assigneeDraft, setAssigneeDraft] = useState<number | null | undefined>(undefined);
  const [statusDraft, setStatusDraft] = useState<ItemOperationalStatus | null>(null);
  const [teamState, setTeamState] = useState({ dirty: false, pending: false });
  const onTeamState = useCallback((dirty: boolean, pending: boolean) => setTeamState((current) => current.dirty === dirty && current.pending === pending ? current : { dirty, pending }), []);
  const [validationNote, setValidationNote] = useState('');
  const [comment, setComment] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [now, setNow] = useState(Date.now);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string; completed?: boolean } | null>(null);
  const savedRef = useRef<HTMLDivElement>(null);
  const hasTeam = item.tipoLinea !== 'parte' && Boolean(item.assignments?.length);
  const team = item.assignments?.filter((member) => member.active) ?? [];
  const ownAssignment = team.find((member) => member.userId === actorId);
  const hasTheoreticalValue = canManage && team.length > 0 && team.every((member) => member.saleHourly != null && member.estimatedHours != null);
  const theoreticalTeamValue = team.reduce((sum, member) => sum + (member.saleHourly != null && member.estimatedHours != null ? member.saleHourly * member.estimatedHours : 0), 0);
  const ownPartDone = Boolean(ownAssignment?.completedAt);
  const activeSessions = useMemo(() => {
    const sessions = item.activeSessions ?? [];
    return item.activeSession && !sessions.some((session) => session.id === item.activeSession?.id) ? [...sessions, item.activeSession] : sessions;
  }, [item.activeSession, item.activeSessions]);
  const ownSession = activeSessions.find((session) => session.mine);
  const controlSession = hasTeam ? ownSession : ownSession ?? item.activeSession;
  useEffect(() => { if (feedback?.completed && !feedback.error) savedRef.current?.focus(); }, [feedback]);
  useEffect(() => {
    if (!activeSessions.length) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeSessions]);
  const pending = teamState.pending || [start, pause, complete, assign, estimate, validate, execution, observation].some((mutation) => mutation.isPending);
  const noteValue = note ?? item.notasOperativas ?? '';
  const longInstructions = noteValue.length > 220 || noteValue.split('\n').length > 3;
  const latestObservation = [...observations].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)[0];
  const estimateValue = estimated ?? (item.horasHombreEstimadas === null ? '' : String(item.horasHombreEstimadas));
  const changedNote = note !== null && note !== (item.notasOperativas ?? '');
  const changedEstimate = estimated !== null && estimated !== (item.horasHombreEstimadas === null ? '' : String(item.horasHombreEstimadas));
  const dirty = pauseOpen || Boolean(pauseReason) || teamState.dirty || changedNote || changedEstimate || assigneeDraft !== undefined || statusDraft !== null || Boolean(estimateReason || validationNote.trim() || comment || files.length);
  const attachmentError = observationError(comment, files);
  useEffect(() => { onState(item.id, dirty, pending); }, [onState, item.id, dirty, pending]);
  useEffect(() => () => onState(item.id, false, false), [onState, item.id]);
  const canWork = available && !closed && item.qualityStatus !== 'aprobado' && (canManage || (item.canWork === true && (!accessory || actorRole === 'mecanico') && (!hasTeam || Boolean(ownAssignment))));
  const awaitingPartDelivery = item.tipoLinea === 'parte' && item.awaitingWarehouseDelivery === true;
  const awaitingCustodyDelivery = accessory && !(item.entregadoBodegaAt || item.custodyBodegueroDeliveredAt || item.entregadoBodega);
  const awaitingCustodyReception = accessory && !(item.recibidoTallerAt || item.custodyArmadorReceivedAt || item.recibidoTaller);
  const awaitingPartCustody = awaitingPartDelivery || awaitingCustodyDelivery || awaitingCustodyReception;
  const canControl = canWork && (hasTeam ? Boolean(ownAssignment) && !ownPartDone : !controlSession || controlSession.mine || canManage);
  const disabled = pending || !available || closed;
  const fail = (error: unknown) => setFeedback({ error: true, text: getApiErrorMessage(error, 'No se pudo guardar. Tus datos siguen en el formulario.') });
  const variables = { id: workOrderId, itemId: item.id };
  const realMinutes = Math.max(0, item.totalMinutes + activeSessions.reduce((delta, session) => {
    const startedAt = Date.parse(session.startedAt);
    return delta + (Number.isFinite(startedAt) ? Math.max(0, (now - startedAt) / 60000) - session.elapsedMinutes : 0);
  }, 0));
  const ownSessionMinutes = ownSession ? (Number.isFinite(Date.parse(ownSession.startedAt)) ? Math.max(0, (now - Date.parse(ownSession.startedAt)) / 60000) : ownSession.elapsedMinutes) : null;
  const saveEstimate = (): void => {
    if (disabled || !canManage || !changedEstimate || (item.horasHombreEstimadas !== null && estimateReason.trim().length < 2)) return;
    setEstimateError(null);
    estimate.mutate({ ...variables, data: { horasHombreEstimadas: estimateValue === '' ? null : Number(estimateValue), ...(item.horasHombreEstimadas !== null ? { motivo: estimateReason.trim() } : {}) } }, {
      onSuccess: () => { setEstimated(null); setEstimateReason(''); setConfirmEstimate(false); },
      onError: (error) => { const text = getApiErrorMessage(error, 'No se pudo guardar. Tus horas y motivo siguen en el formulario.'); setEstimateError(text); fail(error); },
    });
  };
  const saveAssignee = (assignedUserId: number | null): void => {
    setAssigneeDraft(assignedUserId);
    assign.mutate({ ...variables, data: { assignedUserId } }, { onSuccess: () => { setAssigneeDraft(undefined); notifySuccess('Responsable actualizado; las horas anteriores se conservaron.'); }, onError: fail });
  };
  const saveStatus = (estadoOperativo: ItemOperationalStatus): void => {
    setStatusDraft(estadoOperativo);
    execution.mutate({ id: workOrderId, data: { items: [{ id: item.id, estadoOperativo }] } }, { onSuccess: () => setStatusDraft(null), onError: fail });
  };
  const saveNote = () => execution.mutate({ id: workOrderId, data: { items: [{ id: item.id, estadoOperativo: item.estadoOperativo, notasOperativas: noteValue || null }] } }, { onSuccess: () => { setNote(noteValue); notifySuccess('Nota guardada.'); }, onError: fail });
  const completeTask = (): void => {
    if (disabled || !canControl || awaitingPartCustody || ['completado', 'omitido'].includes(item.estadoOperativo)) return;
    setFeedback(null);
    complete.mutate({ ...variables, ...(changedNote ? { notasOperativas: noteValue || null } : {}) }, {
      onError: (error) => setFeedback({ error: true, text: getApiErrorMessage(error, 'No se pudo completar. Tus notas y horas guardadas se conservan.'), completed: true }),
      onSuccess: (worksheet) => {
        const savedItem = worksheet.items.find((entry) => entry.id === item.id);
        const teamPending = hasTeam && savedItem?.estadoOperativo !== 'completado';
        setNote(null); onCompleted(); setFeedback({ error: false, text: item.tipoLinea === 'parte' ? 'Repuesto marcado como usado.' : teamPending ? 'Parte terminada / equipo pendiente. Tus horas y notas quedaron guardadas.' : 'Trabajo completado. Sus horas y notas quedaron guardadas.', completed: true });
      },
    });
  };

  return <article className={accessory ? 'mt-3 border-t border-slate-100 pt-3' : 'workshop-labor-task'} aria-label={`Trabajo: ${item.descripcion}`} data-status={item.estadoOperativo} aria-busy={pending}>
    {!accessory && <div className="workshop-labor-task-top">
      <div className="workshop-labor-task-title"><span className={`workshop-labor-state workshop-labor-state--${item.estadoOperativo}`}>{labels[item.estadoOperativo]}</span><h3>{item.descripcion}</h3></div>
      {canManage && !closed && !hasTeam && !autoOpenTeam ? <div className="workshop-labor-assignee"><label><span>Mecánico</span><select aria-label={`Mecánico de ${item.descripcion}`} value={(assigneeDraft === undefined ? item.assignedUser?.id : assigneeDraft) ?? ''} disabled={disabled || mechanics.isPending}
        onChange={(event) => saveAssignee(event.target.value ? Number(event.target.value) : null)}>
        <option value="">Sin asignar</option>{(mechanics.data ?? []).map((mechanic) => <option key={mechanic.id} value={mechanic.id}>{mechanic.nombre}</option>)}
      </select></label>{assigneeDraft !== undefined && !assign.isPending && <button type="button" disabled={disabled} onClick={() => saveAssignee(assigneeDraft)}>Reintentar asignación</button>}</div> : <span className="workshop-labor-assigned-name">{hasTeam ? team.map((member) => member.userName ?? `Mecánico #${member.userId}`).join(', ') || 'Sin asignar' : item.assignedUser?.nombre ?? 'Sin asignar'}</span>}
    </div>}
    <div className="workshop-labor-task-controls">
      {accessory ? <span className={`workshop-labor-state workshop-labor-state--${item.estadoOperativo}`}>{labels[item.estadoOperativo]}</span> : <div className="workshop-labor-hours"><span className={activeSessions.length ? 'is-running' : ''}><Clock3 aria-hidden="true" />{hasTeam ? 'Equipo' : 'Servicio'}: <span>{minutesLabel(realMinutes)}</span>{activeSessions.length ? ' · En curso' : ''}</span>{ownSessionMinutes !== null && <span>Tu sesión actual: {minutesLabel(ownSessionMinutes)}</span>}{ownAssignment && <span>Tus horas estimadas: {ownAssignment.estimatedHours === null ? 'Sin definir' : minutesLabel(ownAssignment.estimatedHours * 60)}</span>}{hasTheoreticalValue && <span>Valor teórico{hasTeam ? ' del equipo' : ''}: {formatClp(theoreticalTeamValue)}</span>}<span>Estimado{hasTeam ? ' del servicio' : ''}: {item.horasEstimadasTotales === null ? 'Sin definir' : minutesLabel(item.horasEstimadasTotales * 60)}</span>{item.laborValidatedAt && <span>Horas validadas</span>}</div>}
      <div className="workshop-labor-actions">
        {canControl && !['completado', 'omitido'].includes(item.estadoOperativo) && <>
          {item.tipoLinea !== 'parte' && (controlSession ? <button type="button" className="workshop-labor-primary" disabled={disabled} onClick={() => { setPauseError(null); setPauseOpen(true); }}><Pause aria-hidden="true" />Pausar</button>
            : <button type="button" className="workshop-labor-primary" disabled={disabled} onClick={() => start.mutate(variables, { onError: fail, onSuccess: (result) => { if (result.pausedOtherItems) notifySuccess('Se pausó tu trabajo anterior y se conservaron sus horas.'); } })}><Play aria-hidden="true" />{item.estadoOperativo === 'en_proceso' ? 'Continuar' : 'Iniciar'}</button>)}
          <button type="button" className="workshop-labor-complete" disabled={disabled || awaitingPartCustody} onClick={completeTask}><Check aria-hidden="true" />{item.tipoLinea === 'parte' ? 'Marcar usado' : hasTeam ? 'Terminar mi parte' : 'Completar'}</button>
        </>}
        {available && !closed && canManage && item.tipoLinea !== 'parte' && onSuggestPrice && <button type="button" disabled={disabled} onClick={() => onSuggestPrice(item.id)}><BadgeDollarSign aria-hidden="true" />Sugerir precio</button>}
        {pending && <span role="status"><LoaderCircle className="animate-spin" aria-hidden="true" /><span className="sr-only">Guardando trabajo</span></span>}
      </div>
    </div>
    {pauseOpen && <PauseReasonDialog reason={pauseReason} onReason={setPauseReason} pending={pause.isPending} error={pauseError}
      onClose={() => { if (!pause.isPending) { setPauseOpen(false); setPauseReason(''); setPauseError(null); } }}
      onConfirm={() => {
        if (disabled || !canControl) return;
        setPauseError(null);
        pause.mutate({ ...variables, note: pauseReason.trim() || undefined }, {
          onSuccess: () => { setPauseOpen(false); setPauseReason(''); },
          onError: (error) => setPauseError(getApiErrorMessage(error, 'No se pudo pausar. El motivo se conserva para reintentar.')),
        });
      }} />}
    {(awaitingPartDelivery || awaitingCustodyDelivery) && <p className="workshop-labor-help">Pendiente de entrega por bodega. Podrás marcar el repuesto como usado cuando se registre su entrega{accessory ? ' y recepción en taller' : ''}.</p>}
    {!awaitingPartDelivery && !awaitingCustodyDelivery && awaitingCustodyReception && <p className="workshop-labor-help">Pendiente de recepción en taller. El armador debe confirmar la recepción antes de marcar el repuesto como usado.</p>}
    {feedback && <div ref={savedRef} tabIndex={-1} role={feedback.error ? 'alert' : 'status'} className={feedback.error ? 'workshop-labor-error' : 'workshop-labor-saved'}><span>{feedback.text}</span>{feedback.error && feedback.completed && canControl && !awaitingPartCustody && <button type="button" disabled={disabled} onClick={completeTask}><RotateCcw aria-hidden="true" />Reintentar</button>}{!feedback.error && feedback.completed && onNext && <button type="button" onClick={onNext}>Ir al siguiente trabajo</button>}</div>}
    {ownPartDone && !['completado', 'omitido'].includes(item.estadoOperativo) && <p className="workshop-labor-help">Parte terminada / equipo pendiente</p>}
    {activeSessions.filter((session) => !session.mine).map((session) => <p key={session.id} className="workshop-labor-help">En curso por {session.userName ?? 'otro responsable'}.</p>)}
    {item.tipoLinea !== 'parte' && <WorkOrderTeamEditor item={item} workOrderId={workOrderId} editable={canManage && !closed} showFinancials={canManage} disabled={disabled} mechanics={mechanics.data ?? []} loadingMechanics={mechanics.isPending} mechanicsError={mechanics.isError} autoOpenTeam={autoOpenTeam} onState={onTeamState} />}
    <section className="workshop-job-context" aria-label={`Indicaciones y adjuntos de ${item.descripcion}`}>
      <h4>Indicaciones del trabajo</h4>
      <p className={`workshop-job-instructions${longInstructions && !fullInstructions ? ' is-truncated' : ''}`}>{noteValue || 'Sin indicaciones adicionales.'}</p>
      {longInstructions && <button type="button" aria-expanded={fullInstructions} onClick={() => setFullInstructions((value) => !value)}>{fullInstructions ? 'Ver menos' : 'Leer indicaciones completas'}</button>}
      {latestObservation?.texto && <div className="workshop-job-latest-note"><small>{latestObservation.authorName ?? 'Taller'} · {formatDateTime(latestObservation.createdAt)}</small><p className={fullObservation ? '' : 'workshop-job-instructions is-truncated'}>{latestObservation.texto}</p>{(latestObservation.texto.length > 220 || latestObservation.texto.split('\n').length > 3) && <button type="button" aria-expanded={fullObservation} onClick={() => setFullObservation((value) => !value)}>{fullObservation ? 'Ver menos' : 'Leer observación completa'}</button>}</div>}
      <WorkOrderObservationFiles files={observations.flatMap((entry) => entry.files)} />
    </section>
    <details className="workshop-labor-details"><summary>Ver detalle<span>Notas, acciones e historial de horas</span></summary>
      <div className="workshop-labor-detail-body">
        {available && !closed && !canManage && item.canWork === true && item.tipoLinea !== 'parte' && onSuggestPrice && <div className="workshop-labor-actions"><button type="button" disabled={disabled} onClick={() => onSuggestPrice(item.id)}><BadgeDollarSign aria-hidden="true" />Sugerir precio</button></div>}
        <label>Nota del trabajo<textarea aria-label={`Nota técnica de ${item.descripcion}`} value={noteValue} maxLength={1000} disabled={!canWork || pending} onChange={(event) => setNote(event.target.value)} /></label>
        {changedNote && <button type="button" disabled={!canWork || pending} onClick={saveNote}>Guardar nota</button>}
        <section aria-label={`Historial de horas de ${item.descripcion}`}><h4>Historial de horas</h4>{(item.sessions ?? []).length === 0 ? <p>Sin horas registradas.</p> : <ul>{item.sessions?.map((session) => <li key={session.id}><strong>{session.userName ?? 'Taller'}</strong><span>{session.reportedDate ? `${formatDate(session.reportedDate)} · Horas declaradas` : formatDateTime(session.startedAt)} · {minutesLabel(session.minutes)}{session.kind === 'ajuste' ? ' · Ajuste' : ''}</span>{session.note && <p>{session.note}</p>}</li>)}</ul>}</section>
        {canManage && !closed && !accessory && <details><summary>Administrar trabajo</summary><div className="workshop-labor-admin">
          <label>Estado del trabajo<select aria-label={`Estado de ${item.descripcion}`} value={statusDraft ?? item.estadoOperativo} disabled={disabled} onChange={(event) => saveStatus(event.target.value as ItemOperationalStatus)}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {statusDraft !== null && !execution.isPending && <button type="button" disabled={disabled} onClick={() => saveStatus(statusDraft)}>Reintentar estado</button>}
          {!item.assignments?.length && <>
          <label>Horas estimadas por unidad<input aria-label={`Horas estimadas de ${item.descripcion}`} type="number" min="0" max="999.99" step="0.25" value={estimateValue} disabled={disabled} onChange={(event) => setEstimated(event.target.value)} /></label>
          <button type="button" disabled={disabled || !changedEstimate || (estimateValue !== '' && (!Number.isFinite(Number(estimateValue)) || Number(estimateValue) < 0 || Number(estimateValue) > 999.99))} onClick={() => item.horasHombreEstimadas === null ? saveEstimate() : setConfirmEstimate(true)}>Guardar estimación</button>
          </>}
          <label>Comentario de validación (opcional)<input aria-label={`Comentario de validación de ${item.descripcion}`} maxLength={500} disabled={disabled} value={validationNote} onChange={(event) => setValidationNote(event.target.value)} /></label>
          <button type="button" disabled={disabled || item.horasHombreReales === null || validationNote.trim().length > 500} onClick={() => validate.mutate({ ...variables, comentario: validationNote.trim() || null }, { onError: fail, onSuccess: () => { setValidationNote(''); notifySuccess('Horas validadas.'); } })}>Validar horas</button>
        </div></details>}
        {item.laborValidationNote && <p className="workshop-labor-help">Validación: {item.laborValidationNote}</p>}
        <section><h4>Observaciones y archivos</h4>{observations.map((entry) => <div className="workshop-labor-observation" key={entry.id}><p>{entry.texto}</p><small>{entry.authorName ?? 'Taller'} · {formatDateTime(entry.createdAt)}</small>{entry.files.map((file) => <a key={file.id} href={file.url} target="_blank" rel="noreferrer">{file.nombreOriginal}</a>)}</div>)}
          {canWork && <><label>Agregar observación<textarea value={comment} maxLength={2000} aria-label={`Observación de ${item.descripcion}`} onChange={(event) => setComment(event.target.value)} /></label><label>Adjuntar imágenes o PDF<input type="file" accept={WORK_ORDER_OBSERVATION_FILE_MIME_TYPES.join(',')} multiple disabled={pending} onChange={(event) => { const selected = Array.from(event.target.files ?? []); setFiles((current) => appendFiles(current, selected)); event.target.value = ''; }} /></label>{files.map((file, index) => <button key={`${file.name}-${index}`} type="button" disabled={pending} onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}>Quitar {file.name}</button>)}{attachmentError && <p role="alert">{attachmentError}</p>}<button type="button" disabled={disabled || Boolean(attachmentError) || (!comment.trim() && !files.length)} onClick={() => observation.mutate({ id: workOrderId, data: { workOrderItemId: item.id, texto: comment || null, progressReportId: null }, files }, { onError: fail, onSuccess: () => { setComment(''); setFiles([]); notifySuccess('Observación registrada.'); } })}>Guardar observación</button></>}
        </section>
      </div>
    </details>
    {confirmEstimate && <ItemEstimateReasonDialog description={`Cambio de horas estimadas de ${item.descripcion}.`} reason={estimateReason} onReasonChange={setEstimateReason} pending={estimate.isPending} disabled={disabled || !canManage} error={estimateError} onClose={() => setConfirmEstimate(false)} onConfirm={saveEstimate} />}
  </article>;
};

export interface WorkOrderLaborBoardProps {
  workOrder: WorkOrder;
  onDirtyChange: (dirty: boolean) => void;
  onPendingChange: (pending: boolean) => void;
  onSuggestPrice?: (itemId: number) => void;
  focus?: 'all' | 'unassigned';
  onFocusChange?: (focus: 'all' | 'unassigned') => void;
}

export default function WorkOrderLaborBoard({ workOrder, onDirtyChange, onPendingChange, onSuggestPrice, focus = 'all', onFocusChange }: WorkOrderLaborBoardProps) {
  const user = useAuthStore((state) => state.user);
  const supervisor = Boolean(user && ['desarrollador', 'admin', 'jefe'].includes(user.role));
  const canUpdate = Boolean(user && hasUserPermission(user, 'taller', 'update'));
  const canManage = Boolean(user && ['desarrollador', 'admin', 'jefe'].includes(user.role) && hasUserPermission(user, 'taller', 'update'));
  const closed = ['entregada', 'cancelada'].includes(workOrder.estado);
  const query = useWorkOrderWorksheet(workOrder.id);
  const coordinator = useAssignWorkOrderMechanicMutation();
  const mechanics = useMechanics(canManage);
  const [mine, setMine] = useState(user?.role === 'mecanico');
  const [status, setStatus] = useState<'all' | ItemOperationalStatus>('all');
  const [assignmentFocus, setAssignmentFocus] = useState(focus);
  const changeAssignmentFocus = (next: 'all' | 'unassigned'): void => { setAssignmentFocus(next); onFocusChange?.(next); setStatus('all'); };
  useEffect(() => { setAssignmentFocus(focus); setStatus('all'); }, [focus]);
  const taskNodes = useRef<Record<number, HTMLDivElement | null>>({});
  const [states, setStates] = useState<Record<number, { dirty: boolean; pending: boolean }>>({});
  const onState = useCallback((id: number, dirty: boolean, pending: boolean) => setStates((current) => current[id]?.dirty === dirty && current[id]?.pending === pending ? current : { ...current, [id]: { dirty, pending } }), []);
  const dirty = Object.values(states).some((state) => state.dirty);
  const pending = Object.values(states).some((state) => state.pending);
  useEffect(() => onDirtyChange(dirty), [onDirtyChange, dirty]);
  useEffect(() => onPendingChange(pending || coordinator.isPending), [onPendingChange, pending, coordinator.isPending]);
  const items = useMemo(() => query.data?.items ?? (workOrder.items ?? []).map((item): WorkOrderWorksheetItem => ({
    id: item.id, descripcion: item.descripcion, tipoLinea: item.tipoLinea, unidadMedida: item.unidadMedida, cantidad: Number(item.cantidad), estadoOperativo: item.estadoOperativo, notasOperativas: item.notasOperativas,
    horasHombreEstimadas: item.horasHombreEstimadas, horasEstimadasTotales: item.horasHombreEstimadas === null ? null : item.horasHombreEstimadas * item.cantidad,
    horasHombreReales: item.horasHombreReales, excedeEstimado: false, assignments: item.assignments, assignedUser: item.assignedUser ?? (item.assignedUserId ? { id: item.assignedUserId, nombre: `Mecánico #${item.assignedUserId}` } : null), laborValidatedAt: item.laborValidatedAt, laborValidationNote: item.laborValidationNote, activeSession: null, totalMinutes: (item.horasHombreReales ?? 0) * 60, observationsCount: 0,
    division: item.division ?? (item.tipoLinea === 'parte' ? 'ACC' : 'MEC'),
    subtipo: item.subtipo,
    esAPedido: Boolean(item.esAPedido),
    precioUnitario: item.precioUnitario,
    bodegueroUserId: item.bodegueroUserId,
    entregadoBodega: item.entregadoBodega,
    entregadoBodegaAt: item.entregadoBodegaAt ?? null,
    armadorUserId: item.armadorUserId,
    recibidoTaller: item.recibidoTaller,
    recibidoTallerAt: item.recibidoTallerAt ?? null,
    notaEntrega: item.notaEntrega ?? null,
    ccfStatus: item.ccfStatus ?? 'pendiente',
    ccfNotes: item.ccfNotes ?? null,
    ccfReviewedAt: item.ccfReviewedAt,
    ccfReviewedBy: item.ccfReviewedBy,
    dpStages: item.dpStages ?? [],
    ...('teamManaged' in item ? { teamManaged: item.teamManaged === true } : {}),
  })), [query.data?.items, workOrder.items]);

  const dpItems = useMemo(() => items.filter((item) => item.division === 'DP'), [items]);
  const accItems = useMemo(
    () => items.filter((item) => item.division === 'ACC' || item.tipoLinea === 'parte'),
    [items],
  );
  const mecItems = useMemo(
    () =>
      items.filter(
        (item) =>
          item.division !== 'DP' &&
          item.tipoLinea !== 'parte' &&
          item.division !== 'ACC',
      ),
    [items],
  );
  const isMine = (item: WorkOrderWorksheetItem): boolean => item.dpStages?.some((stage) => stage.assignedUserId === user?.id) || (item.assignments?.length
    ? item.assignments.some((member) => member.active && member.userId === user?.id)
    : Boolean(item.canWork || item.assignedUser?.id === user?.id || (!item.assignedUser && workOrder.assignedMechanicId === user?.id)));
  const mineItems = items.filter((item) => !mine || isMine(item));
  const isUnassigned = (item: WorkOrderWorksheetItem): boolean => {
    if (item.tipoLinea === 'parte' || ['completado', 'omitido'].includes(item.estadoOperativo)) return false;
    if (item.division === 'DP') return !item.dpStages?.length || item.dpStages.some((stage) => !stage.assignedUserId);
    const original = workOrder.items?.find((entry) => entry.id === item.id);
    const explicitTeam = 'teamManaged' in item ? item.teamManaged === true
      : original && 'teamManaged' in original ? original.teamManaged === true : Boolean(item.assignments?.length);
    if (explicitTeam) return !item.assignments?.some((member) => member.active);
    return !item.assignedUser && !workOrder.assignedMechanicId;
  };
  const focusedItems = mineItems.filter((item) => !supervisor || assignmentFocus !== 'unassigned' || isUnassigned(item));
  const visibleItems = focusedItems.filter((item) => status === 'all' || item.estadoOperativo === status);
  const goTo = (itemId: number): void => {
    setStatus('all');
    window.requestAnimationFrame(() => { taskNodes.current[itemId]?.focus(); taskNodes.current[itemId]?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); });
  };
  return <div className="workshop-labor-board">
    <div className="workshop-labor-toolbar"><div><h2>Trabajos de la orden</h2></div>{user?.role === 'mecanico' && <button type="button" aria-pressed={mine} onClick={() => setMine((current) => !current)}>{mine ? 'Mis trabajos' : 'Todos los trabajos'}</button>}</div>
    <div className="workshop-labor-filters" role="group" aria-label="Filtrar trabajos"><button type="button" aria-pressed={status === 'all' && (!supervisor || assignmentFocus === 'all')} onClick={() => changeAssignmentFocus('all')}>Todos <span>{mineItems.length}</span></button>{supervisor && <button type="button" aria-pressed={assignmentFocus === 'unassigned'} onClick={() => changeAssignmentFocus(assignmentFocus === 'unassigned' ? 'all' : 'unassigned')}>Sin asignar <span>{mineItems.filter(isUnassigned).length}</span></button>}{Object.entries(labels).map(([value, label]) => <button key={value} type="button" aria-pressed={status === value} onClick={() => setStatus(value as ItemOperationalStatus)}>{label} <span>{focusedItems.filter((item) => item.estadoOperativo === value).length}</span></button>)}</div>
    {query.isPending && <p role="status" className="workshop-labor-help">Cargando horas de trabajo…</p>}
    {query.isError && <div role="alert" className="workshop-labor-error"><AlertCircle aria-hidden="true" /><span>No se pudieron cargar las horas. Los registros guardados se conservan.</span><button type="button" onClick={() => void query.refetch()}><RotateCcw aria-hidden="true" />Reintentar</button></div>}

    {/* Bloque D&P Quirúrgico (5 etapas secuenciales + CCF) */}
    {dpItems.length > 0 && (
      <WorkOrderDpSection
        workOrderId={workOrder.id}
        items={visibleItems.filter((item) => item.division === 'DP')}
        mechanics={mechanics.data ?? []}
        canManage={canManage}
        closed={closed}
        onSuggestPrice={onSuggestPrice}
        onState={onState}
      />
    )}

    {/* Bloque ACC (Custodia Bodeguero & Armador + Buscador Inteligente) */}
    {(accItems.length > 0 || (canManage && !closed)) && (
      <WorkOrderAccSection
        workOrderId={workOrder.id}
        items={accItems}
        visibleItemIds={visibleItems.map((item) => item.id)}
        assignedToOrder={user?.role === 'mecanico' && (workOrder.assignedMechanicId === user.id || items.some((item) => item.assignedUser?.id === user.id || item.assignments?.some((entry) => entry.active && entry.userId === user.id) || item.dpStages?.some((stage) => stage.assignedUserId === user.id)))}
        mechanics={mechanics.data ?? []}
        canManage={canManage}
        closed={closed}
        onSuggestPrice={onSuggestPrice}
        onState={onState}
        renderExecution={(item) => <div ref={(node) => { taskNodes.current[item.id] = node; }} tabIndex={-1}>
          <Task item={item} workOrderId={workOrder.id} canManage={canManage} autoOpenTeam={false}
            closed={closed} available={Boolean(query.data) && canUpdate}
            observations={(query.data?.observations ?? []).filter((entry) => entry.itemId === item.id)}
            onState={onState} onCompleted={() => setStatus('all')} accessory />
        </div>}
      />
    )}

    {/* Bloque MEC (Mecánica General: Estándar y Específicos) */}
    {(mecItems.length > 0 || (dpItems.length === 0 && accItems.length === 0)) && (
      <div className="rounded-2xl border border-sky-200 bg-[#edf4f9] p-4 sm:p-5 shadow-xs mb-5">
        <div className="flex items-center gap-2.5 border-b border-sky-200/80 pb-3 mb-4">
          <span className="rounded-md bg-[#1d396a] px-3 py-1 text-sm font-black tracking-wider text-white shadow-xs">
            MEC:
          </span>
        </div>
        <div className="workshop-labor-list">
          {mecItems.map((item) => {
            const next = focusedItems.find(
              (other) =>
                other.id !== item.id &&
                !['completado', 'omitido'].includes(other.estadoOperativo) &&
                (canManage || other.canWork) &&
                (!other.assignments?.length ||
                  other.assignments.some(
                    (member) =>
                      member.active &&
                      member.userId === user?.id &&
                      !member.completedAt,
                  )),
            );
            return (
              <div
                key={item.id}
                ref={(node) => {
                  taskNodes.current[item.id] = node;
                }}
                tabIndex={-1}
                hidden={!visibleItems.some((visible) => visible.id === item.id)}
              >
                <Task
                  item={item}
                  workOrderId={workOrder.id}
                  canManage={canManage}
                  autoOpenTeam={supervisor && assignmentFocus === 'unassigned' && isUnassigned(item)}
                  closed={closed}
                  available={Boolean(query.data) && canUpdate}
                  observations={(query.data?.observations ?? []).filter((entry) => entry.itemId === item.id)}
                  onState={onState}
                  onSuggestPrice={onSuggestPrice}
                  onCompleted={() => setStatus('all')}
                  onNext={next ? () => goTo(next.id) : undefined}
                />
              </div>
            );
          })}
        </div>
      </div>
    )}
    {items.length > 0 && visibleItems.length === 0 && <p className="workshop-labor-empty">No hay trabajos en este filtro.</p>}
    {query.data && <GeneralObservations workOrderId={workOrder.id} entries={query.data.observations.filter((entry) => entry.itemId === null)} editable={!closed && canUpdate} onState={onState} />}
    {!items.length && <p className="workshop-labor-empty">No hay trabajos cargados todavía.</p>}
    {canManage && !closed && <details className="workshop-labor-details"><summary>Responsable general (opcional)</summary><div className="workshop-labor-detail-body"><p>Los servicios con un mecánico propio mantienen su asignación.</p><label>Responsable general<select aria-label="Responsable general de la OT" disabled={coordinator.isPending} value={workOrder.assignedMechanicId ?? ''} onChange={(event) => coordinator.mutate({ id: workOrder.id, data: { mechanicId: event.target.value ? Number(event.target.value) : null } }, { onError: (error) => notifyError(getApiErrorMessage(error)) })}><option value="">Sin asignar</option>{(mechanics.data ?? []).map((mechanic) => <option key={mechanic.id} value={mechanic.id}>{mechanic.nombre}</option>)}</select></label></div></details>}
  </div>;
}
