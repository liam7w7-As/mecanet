import { WORK_ORDER_OBSERVATION_FILE_MIME_TYPES, WORK_ORDER_OBSERVATION_MAX_FILES, WORK_ORDER_OBSERVATION_MAX_FILE_BYTES } from '@unithor/shared';
import { AlertCircle, BadgeDollarSign, Check, Clock3, LoaderCircle, Pause, Play, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  useAdjustItemHoursMutation, useAssignWorkOrderItemMutation, useCompleteItemTimerMutation,
  useCreateObservationMutation, usePauseItemTimerMutation, useStartItemTimerMutation,
  useUpdateItemEstimateMutation, useValidateItemHoursMutation, useWorkOrderWorksheet,
} from '../../hooks/useWorkOrderLabor';
import { useAssignWorkOrderMechanicMutation, useMechanics, useUpdateWorkOrderExecutionMutation } from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatDateTime } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';
import { notifyError, notifySuccess } from '../../stores/toast.store';

import type { WorkOrder, WorkOrderWorksheetItem } from '../../types/entities';
import type { ItemOperationalStatus } from '@unithor/shared';

const labels = { pendiente: 'Pendiente', en_proceso: 'En proceso', completado: 'Completado', omitido: 'Omitido' } as const;
const minutesLabel = (value: number): string => `${Math.floor(Math.max(0, value) / 60)} h ${Math.floor(Math.max(0, value) % 60).toString().padStart(2, '0')} min`;

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
  closed: boolean;
  available: boolean;
  observations: Array<{ id: number; texto: string | null; createdAt: string; authorName: string | null; files: Array<{ id: number; nombreOriginal: string; url: string }> }>;
  onState: (id: number, dirty: boolean, pending: boolean) => void;
  onSuggestPrice?: (itemId: number) => void;
  onNext?: () => void;
  onCompleted: () => void;
}

const Task = ({ item, workOrderId, canManage, closed, available, observations, onState, onSuggestPrice, onNext, onCompleted }: TaskProps) => {
  const start = useStartItemTimerMutation();
  const pause = usePauseItemTimerMutation();
  const complete = useCompleteItemTimerMutation();
  const assign = useAssignWorkOrderItemMutation();
  const estimate = useUpdateItemEstimateMutation();
  const adjust = useAdjustItemHoursMutation();
  const validate = useValidateItemHoursMutation();
  const execution = useUpdateWorkOrderExecutionMutation();
  const observation = useCreateObservationMutation();
  const mechanics = useMechanics(canManage && !closed);
  const [note, setNote] = useState<string | null>(null);
  const [estimated, setEstimated] = useState<string | null>(null);
  const [adjustMinutes, setAdjustMinutes] = useState('');
  const [reason, setReason] = useState('');
  const [validationNote, setValidationNote] = useState('');
  const [comment, setComment] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [now, setNow] = useState(Date.now);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string; completed?: boolean } | null>(null);
  const savedRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (feedback?.completed && !feedback.error) savedRef.current?.focus(); }, [feedback]);
  useEffect(() => {
    if (!item.activeSession) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [item.activeSession]);
  const pending = [start, pause, complete, assign, estimate, adjust, validate, execution, observation].some((mutation) => mutation.isPending);
  const noteValue = note ?? item.notasOperativas ?? '';
  const estimateValue = estimated ?? (item.horasHombreEstimadas === null ? '' : String(item.horasHombreEstimadas));
  const changedNote = note !== null && note !== (item.notasOperativas ?? '');
  const changedEstimate = estimated !== null && estimated !== (item.horasHombreEstimadas === null ? '' : String(item.horasHombreEstimadas));
  const dirty = changedNote || changedEstimate || Boolean(adjustMinutes || reason || validationNote.trim() || comment || files.length);
  const attachmentError = observationError(comment, files);
  useEffect(() => { onState(item.id, dirty, pending); }, [onState, item.id, dirty, pending]);
  useEffect(() => () => onState(item.id, false, false), [onState, item.id]);
  const canWork = available && !closed && (canManage || item.canWork === true);
  const canControl = canWork && (!item.activeSession || item.activeSession.mine || canManage);
  const disabled = pending || !available || closed;
  const fail = (error: unknown) => setFeedback({ error: true, text: getApiErrorMessage(error, 'No se pudo guardar. Tus datos siguen en el formulario.') });
  const variables = { id: workOrderId, itemId: item.id };
  const realMinutes = item.activeSession
    ? Math.max(0, item.totalMinutes - item.activeSession.elapsedMinutes) + Math.max(0, Math.floor((now - Date.parse(item.activeSession.startedAt)) / 60000))
    : item.totalMinutes;
  const saveNote = () => execution.mutate({ id: workOrderId, data: { items: [{ id: item.id, estadoOperativo: item.estadoOperativo, notasOperativas: noteValue || null }] } }, { onSuccess: () => { setNote(noteValue); notifySuccess('Nota guardada.'); }, onError: fail });
  const completeTask = (): void => {
    if (item.awaitingWarehouseDelivery) return;
    setFeedback(null);
    complete.mutate({ ...variables, ...(changedNote ? { notasOperativas: noteValue || null } : {}) }, {
      onError: (error) => setFeedback({ error: true, text: getApiErrorMessage(error, 'No se pudo completar. Tus notas y horas guardadas se conservan.'), completed: true }),
      onSuccess: () => { setNote(null); onCompleted(); setFeedback({ error: false, text: item.tipoLinea === 'parte' ? 'Repuesto marcado como usado.' : 'Trabajo completado. Sus horas y notas quedaron guardadas.', completed: true }); },
    });
  };

  return <article className="workshop-labor-task" aria-label={`Trabajo: ${item.descripcion}`} data-status={item.estadoOperativo} aria-busy={pending}>
    <div className="workshop-labor-task-top">
      <div className="workshop-labor-task-title"><span className={`workshop-labor-state workshop-labor-state--${item.estadoOperativo}`}>{labels[item.estadoOperativo]}</span><h3>{item.descripcion}</h3></div>
      {canManage && !closed ? <label className="workshop-labor-assignee"><span>Mecánico</span><select aria-label={`Mecánico de ${item.descripcion}`} value={item.assignedUser?.id ?? ''} disabled={disabled || mechanics.isPending}
        onChange={(event) => assign.mutate({ ...variables, data: { assignedUserId: event.target.value ? Number(event.target.value) : null } }, { onSuccess: () => notifySuccess('Responsable actualizado; las horas anteriores se conservaron.'), onError: fail })}>
        <option value="">Sin asignar</option>{(mechanics.data ?? []).map((mechanic) => <option key={mechanic.id} value={mechanic.id}>{mechanic.nombre}</option>)}
      </select></label> : <span className="workshop-labor-assigned-name">{item.assignedUser?.nombre ?? 'Sin asignar'}</span>}
    </div>
    <div className="workshop-labor-task-controls">
      <div className="workshop-labor-hours"><span className={item.activeSession ? 'is-running' : ''}><Clock3 aria-hidden="true" />{minutesLabel(realMinutes)}{item.activeSession ? ' · En curso' : ''}</span><span>Estimado: {item.horasEstimadasTotales === null ? 'Sin definir' : minutesLabel(item.horasEstimadasTotales * 60)}</span>{item.laborValidatedAt && <span>Horas validadas</span>}</div>
      <div className="workshop-labor-actions">
        {canControl && !['completado', 'omitido'].includes(item.estadoOperativo) && <>
          {item.tipoLinea !== 'parte' && (item.activeSession ? <button type="button" disabled={disabled} onClick={() => pause.mutate(variables, { onError: fail })}><Pause aria-hidden="true" />Pausar</button>
            : <button type="button" className="workshop-labor-primary" disabled={disabled} onClick={() => start.mutate(variables, { onError: fail, onSuccess: (result) => { if (result.pausedOtherItems) notifySuccess('Se pausó tu trabajo anterior y se conservaron sus horas.'); } })}><Play aria-hidden="true" />{item.estadoOperativo === 'en_proceso' ? 'Continuar' : 'Iniciar'}</button>)}
          <button type="button" className="workshop-labor-complete" disabled={disabled || item.awaitingWarehouseDelivery === true} onClick={completeTask}><Check aria-hidden="true" />{item.tipoLinea === 'parte' ? 'Marcar usado' : 'Completar'}</button>
        </>}
        {canManage && !closed && item.tipoLinea !== 'parte' && onSuggestPrice && <button type="button" disabled={disabled} onClick={() => onSuggestPrice(item.id)}><BadgeDollarSign aria-hidden="true" />Sugerir precio</button>}
        {pending && <span role="status"><LoaderCircle className="animate-spin" aria-hidden="true" /><span className="sr-only">Guardando trabajo</span></span>}
      </div>
    </div>
    {item.awaitingWarehouseDelivery && <p className="workshop-labor-help">Pendiente de entrega por bodega. Podrás marcar el repuesto como usado cuando se registre su entrega.</p>}
    {feedback && <div ref={savedRef} tabIndex={-1} role={feedback.error ? 'alert' : 'status'} className={feedback.error ? 'workshop-labor-error' : 'workshop-labor-saved'}><span>{feedback.text}</span>{feedback.error && feedback.completed && canControl && !item.awaitingWarehouseDelivery && <button type="button" disabled={disabled} onClick={completeTask}><RotateCcw aria-hidden="true" />Reintentar</button>}{!feedback.error && feedback.completed && onNext && <button type="button" onClick={onNext}>Ir al siguiente trabajo</button>}</div>}
    {item.activeSession && !item.activeSession.mine && <p className="workshop-labor-help">En curso por {item.activeSession.userName ?? 'otro responsable'}.</p>}
    <details className="workshop-labor-details"><summary>Ver detalle<span>Notas e historial de horas</span></summary>
      <div className="workshop-labor-detail-body">
        <label>Nota del trabajo<textarea aria-label={`Nota técnica de ${item.descripcion}`} value={noteValue} maxLength={1000} disabled={!canWork || pending} onChange={(event) => setNote(event.target.value)} /></label>
        {changedNote && <button type="button" disabled={!canWork || pending} onClick={saveNote}>Guardar nota</button>}
        <section aria-label={`Historial de horas de ${item.descripcion}`}><h4>Historial de horas</h4>{(item.sessions ?? []).length === 0 ? <p>Sin horas registradas.</p> : <ul>{item.sessions?.map((session) => <li key={session.id}><strong>{session.userName ?? 'Taller'}</strong><span>{formatDateTime(session.startedAt)} · {minutesLabel(session.minutes)}{session.kind === 'ajuste' ? ' · Ajuste' : ''}</span>{session.note && <p>{session.note}</p>}</li>)}</ul>}</section>
        {canManage && !closed && <details><summary>Administrar trabajo</summary><div className="workshop-labor-admin">
          <label>Estado del trabajo<select aria-label={`Estado de ${item.descripcion}`} value={item.estadoOperativo} disabled={disabled} onChange={(event) => execution.mutate({ id: workOrderId, data: { items: [{ id: item.id, estadoOperativo: event.target.value as ItemOperationalStatus }] } }, { onError: fail })}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Horas estimadas por unidad<input aria-label={`Horas estimadas de ${item.descripcion}`} type="number" min="0" max="999.99" step="0.25" value={estimateValue} onChange={(event) => setEstimated(event.target.value)} /></label>
          <button type="button" disabled={disabled || !changedEstimate || (estimateValue !== '' && (!Number.isFinite(Number(estimateValue)) || Number(estimateValue) < 0 || Number(estimateValue) > 999.99))} onClick={() => estimate.mutate({ ...variables, data: { horasHombreEstimadas: estimateValue === '' ? null : Number(estimateValue) } }, { onSuccess: () => setEstimated(null), onError: fail })}>Guardar estimación</button>
          <label>Ajuste de minutos<input aria-label={`Ajuste de minutos de ${item.descripcion}`} type="number" min="-1440" max="1440" value={adjustMinutes} onChange={(event) => setAdjustMinutes(event.target.value)} /></label>
          <label>Motivo del ajuste<input value={reason} aria-label={`Motivo del ajuste de ${item.descripcion}`} maxLength={500} onChange={(event) => setReason(event.target.value)} /></label>
          <button type="button" disabled={disabled || !adjustMinutes || !Number.isInteger(Number(adjustMinutes)) || Math.abs(Number(adjustMinutes)) > 1440 || reason.trim().length < 2} onClick={() => adjust.mutate({ ...variables, data: { minutos: Number(adjustMinutes), motivo: reason } }, { onSuccess: () => { setAdjustMinutes(''); setReason(''); }, onError: fail })}>Registrar ajuste</button>
          <label>Comentario de validación (opcional)<input aria-label={`Comentario de validación de ${item.descripcion}`} maxLength={500} disabled={disabled} value={validationNote} onChange={(event) => setValidationNote(event.target.value)} /></label>
          <button type="button" disabled={disabled || item.horasHombreReales === null || validationNote.trim().length > 500} onClick={() => validate.mutate({ ...variables, comentario: validationNote.trim() || null }, { onError: fail, onSuccess: () => { setValidationNote(''); notifySuccess('Horas validadas.'); } })}>Validar horas</button>
        </div></details>}
        {item.laborValidationNote && <p className="workshop-labor-help">Validación: {item.laborValidationNote}</p>}
        <section><h4>Observaciones y archivos</h4>{observations.map((entry) => <div className="workshop-labor-observation" key={entry.id}><p>{entry.texto}</p><small>{entry.authorName ?? 'Taller'} · {formatDateTime(entry.createdAt)}</small>{entry.files.map((file) => <a key={file.id} href={file.url} target="_blank" rel="noreferrer">{file.nombreOriginal}</a>)}</div>)}
          {canWork && <><label>Agregar observación<textarea value={comment} maxLength={2000} aria-label={`Observación de ${item.descripcion}`} onChange={(event) => setComment(event.target.value)} /></label><label>Adjuntar imágenes o PDF<input type="file" accept={WORK_ORDER_OBSERVATION_FILE_MIME_TYPES.join(',')} multiple disabled={pending} onChange={(event) => { const selected = Array.from(event.target.files ?? []); setFiles((current) => appendFiles(current, selected)); event.target.value = ''; }} /></label>{files.map((file, index) => <button key={`${file.name}-${index}`} type="button" disabled={pending} onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}>Quitar {file.name}</button>)}{attachmentError && <p role="alert">{attachmentError}</p>}<button type="button" disabled={disabled || Boolean(attachmentError) || (!comment.trim() && !files.length)} onClick={() => observation.mutate({ id: workOrderId, data: { workOrderItemId: item.id, texto: comment || null, progressReportId: null }, files }, { onError: fail, onSuccess: () => { setComment(''); setFiles([]); notifySuccess('Observación registrada.'); } })}>Guardar observación</button></>}
        </section>
      </div>
    </details>
  </article>;
};

export default function WorkOrderLaborBoard({ workOrder, onDirtyChange, onPendingChange, onSuggestPrice }: { workOrder: WorkOrder; onDirtyChange: (dirty: boolean) => void; onPendingChange: (pending: boolean) => void; onSuggestPrice?: (itemId: number) => void }) {
  const user = useAuthStore((state) => state.user);
  const canUpdate = Boolean(user && hasUserPermission(user, 'taller', 'update'));
  const canManage = Boolean(user && ['desarrollador', 'admin', 'jefe'].includes(user.role) && hasUserPermission(user, 'taller', 'update'));
  const closed = ['entregada', 'cancelada'].includes(workOrder.estado);
  const query = useWorkOrderWorksheet(workOrder.id);
  const coordinator = useAssignWorkOrderMechanicMutation();
  const mechanics = useMechanics(canManage);
  const [mine, setMine] = useState(user?.role === 'mecanico');
  const [status, setStatus] = useState<'all' | ItemOperationalStatus>('all');
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
    horasHombreReales: item.horasHombreReales, excedeEstimado: false, assignedUser: item.assignedUser ?? null, laborValidatedAt: item.laborValidatedAt, laborValidationNote: item.laborValidationNote, activeSession: null, totalMinutes: (item.horasHombreReales ?? 0) * 60, observationsCount: 0,
  })), [query.data?.items, workOrder.items]);
  const mineItems = items.filter((item) => !mine || item.canWork || item.assignedUser?.id === user?.id || (!item.assignedUser && workOrder.assignedMechanicId === user?.id));
  const visibleItems = mineItems.filter((item) => status === 'all' || item.estadoOperativo === status);
  const goTo = (itemId: number): void => {
    setStatus('all');
    window.requestAnimationFrame(() => { taskNodes.current[itemId]?.focus(); taskNodes.current[itemId]?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); });
  };
  return <div className="workshop-labor-board">
    <div className="workshop-labor-toolbar"><div><h2>Trabajos de la orden</h2><p>{canManage ? 'Asigna responsables por servicio. Iniciar el cronómetro registra tus propias horas.' : 'Inicia tu trabajo para registrar horas y márcalo al terminar.'}</p></div>{user?.role === 'mecanico' && <button type="button" aria-pressed={mine} onClick={() => setMine((current) => !current)}>{mine ? 'Mis trabajos' : 'Todos los trabajos'}</button>}</div>
    <div className="workshop-labor-filters" role="group" aria-label="Filtrar trabajos"><button type="button" aria-pressed={status === 'all'} onClick={() => setStatus('all')}>Todos <span>{mineItems.length}</span></button>{Object.entries(labels).map(([value, label]) => <button key={value} type="button" aria-pressed={status === value} onClick={() => setStatus(value as ItemOperationalStatus)}>{label} <span>{mineItems.filter((item) => item.estadoOperativo === value).length}</span></button>)}</div>
    {query.isPending && <p role="status" className="workshop-labor-help">Cargando horas de trabajo…</p>}
    {query.isError && <div role="alert" className="workshop-labor-error"><AlertCircle aria-hidden="true" /><span>No se pudieron cargar las horas. Los registros guardados se conservan.</span><button type="button" onClick={() => void query.refetch()}><RotateCcw aria-hidden="true" />Reintentar</button></div>}
    <div className="workshop-labor-list">{items.map((item) => { const next = mineItems.find((other) => other.id !== item.id && !['completado', 'omitido'].includes(other.estadoOperativo) && (canManage || other.canWork)); return <div key={item.id} ref={(node) => { taskNodes.current[item.id] = node; }} tabIndex={-1} hidden={!visibleItems.some((visible) => visible.id === item.id)}><Task item={item} workOrderId={workOrder.id} canManage={canManage} closed={closed} available={Boolean(query.data) && canUpdate} observations={(query.data?.observations ?? []).filter((entry) => entry.itemId === item.id)} onState={onState} onSuggestPrice={onSuggestPrice} onCompleted={() => setStatus('all')} onNext={next ? () => goTo(next.id) : undefined} /></div>; })}</div>
    {items.length > 0 && visibleItems.length === 0 && <p className="workshop-labor-empty">No hay trabajos en este filtro.</p>}
    {query.data && <GeneralObservations workOrderId={workOrder.id} entries={query.data.observations.filter((entry) => entry.itemId === null)} editable={!closed && canUpdate} onState={onState} />}
    {!items.length && <p className="workshop-labor-empty">No hay trabajos cargados todavía.</p>}
    {canManage && !closed && <details className="workshop-labor-details"><summary>Responsable general (opcional)</summary><div className="workshop-labor-detail-body"><p>Los servicios con un mecánico propio mantienen su asignación.</p><label>Responsable general<select aria-label="Responsable general de la OT" disabled={coordinator.isPending} value={workOrder.assignedMechanicId ?? ''} onChange={(event) => coordinator.mutate({ id: workOrder.id, data: { mechanicId: event.target.value ? Number(event.target.value) : null } }, { onError: (error) => notifyError(getApiErrorMessage(error)) })}><option value="">Sin asignar</option>{(mechanics.data ?? []).map((mechanic) => <option key={mechanic.id} value={mechanic.id}>{mechanic.nombre}</option>)}</select></label></div></details>}
  </div>;
}
