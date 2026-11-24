import { ClipboardCheck, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import './work-order-quality.css';

import { useConfirmWorkOrderQualityMutation, useReviewWorkOrderItemQualityMutation, useWorkOrderQuality } from '../../hooks/useWorkOrderQuality';
import { useMechanics } from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatDateTime } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';
import { notifySuccess } from '../../stores/toast.store';

import type { WorkOrderQualityItem, ReviewWorkOrderItemQualityInput } from '../../hooks/useWorkOrderQuality';
import type { WorkOrder, WorkOrderItem } from '../../types/entities';

const qualityLabels = { pendiente: 'Pendiente de calidad', aprobado: 'Aprobado', rechazado: 'Corrección pendiente' } as const;
const operationalLabels = { pendiente: 'Trabajo pendiente', en_proceso: 'Trabajo en proceso', completado: 'Trabajo terminado', omitido: 'Omitido' } as const;
type OnState = (dirty: boolean, pending: boolean) => void;
interface CrewDraft { userId: string; specialtyId?: number | null; estimatedHours: string }

const reviewPriority = (item: WorkOrderQualityItem): number => item.qualityStatus === 'aprobado' ? 2 : ['completado', 'omitido'].includes(item.estadoOperativo) ? 0 : 1;

const initialCrew = (item: WorkOrderItem | undefined, workOrder: WorkOrder): CrewDraft[] => {
  if (item?.assignments?.length) return item.assignments.filter((member) => member.active).map((member) => ({ userId: String(member.userId), specialtyId: member.specialtyId, estimatedHours: member.estimatedHours === null ? '' : String(member.estimatedHours) }));
  const userId = item?.assignedUserId ?? item?.assignedUser?.id ?? workOrder.assignedMechanicId;
  return userId ? [{ userId: String(userId), estimatedHours: item?.horasHombreEstimadas == null ? '' : String(item.horasHombreEstimadas * item.cantidad) }] : [];
};

const crewError = (members: CrewDraft[]): string | null => {
  if (members.length > 30) return 'El equipo admite hasta 30 integrantes.';
  if (members.some((member) => !member.userId)) return 'Selecciona un mecánico para cada integrante.';
  if (new Set(members.map((member) => member.userId)).size !== members.length) return 'No repitas mecánicos en el equipo.';
  if (members.some((member) => member.estimatedHours !== '' && (!Number.isFinite(Number(member.estimatedHours)) || Number(member.estimatedHours) < 0 || Number(member.estimatedHours) > 9999))) return 'Las horas estimadas deben estar entre 0 y 9999.';
  return null;
};

function ItemQualityReview({ item, workOrder, canReview, onState }: { item: WorkOrderQualityItem; workOrder: WorkOrder; canReview: boolean; onState: (id: number, dirty: boolean, pending: boolean) => void }) {
  const mutation = useReviewWorkOrderItemQualityMutation();
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [replaceCrew, setReplaceCrew] = useState(false);
  const [crewDraft, setCrewDraft] = useState<CrewDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const mechanics = useMechanics(canReview && rejecting && replaceCrew);
  const originalItem = workOrder.items?.find((entry) => entry.id === item.id);
  const members = crewDraft ?? initialCrew(originalItem, workOrder);
  const invalidCrew = replaceCrew ? crewError(members) : null;
  const dirty = Boolean(note || reason || replaceCrew || crewDraft !== null);
  const ready = item.estadoOperativo === 'completado' || item.estadoOperativo === 'omitido';
  const approved = item.qualityStatus === 'aprobado';
  const disabled = !canReview || mutation.isPending;
  useEffect(() => { if (approved && note) setDetailsOpen(true); }, [approved, note]);
  useEffect(() => onState(item.id, dirty, mutation.isPending), [onState, item.id, dirty, mutation.isPending]);
  useEffect(() => () => onState(item.id, false, false), [onState, item.id]);
  const review = (decision: 'aprobar' | 'rechazar'): void => {
    if (disabled || !ready || (decision === 'aprobar' && approved) || (decision === 'rechazar' && (reason.trim().length < 2 || invalidCrew))) return;
    const data: ReviewWorkOrderItemQualityInput = decision === 'aprobar' ? { decision, nota: note.trim() || null } : {
      decision, nota: reason.trim(), ...(replaceCrew ? { members: members.map((member) => ({ userId: Number(member.userId), ...(member.specialtyId === undefined ? {} : { specialtyId: member.specialtyId }), estimatedHours: member.estimatedHours === '' ? null : Number(member.estimatedHours) })) } : {}),
    };
    setError(null);
    mutation.mutate({ id: workOrder.id, itemId: item.id, data }, {
      onSuccess: () => { setNote(''); setReason(''); setRejecting(false); setReplaceCrew(false); setCrewDraft(null); notifySuccess(decision === 'aprobar' ? 'Calidad del servicio aprobada.' : 'Corrección solicitada. Las horas e historial se conservaron.'); },
      onError: (failure) => setError(getApiErrorMessage(failure, 'No se pudo guardar la revisión. Tus notas y equipo siguen disponibles para reintentar.')),
    });
  };
  return <section className="workshop-quality-item" aria-label={`Calidad de ${item.descripcion}`} aria-busy={mutation.isPending}>
    <div className="workshop-quality-item-heading">
      <div><h4>{item.descripcion}</h4><p className="workshop-quality-help">{operationalLabels[item.estadoOperativo]}</p></div>
      <span className="workshop-quality-badge" data-quality={item.qualityStatus}>{qualityLabels[item.qualityStatus]}</span>
    </div>
    <div className="workshop-quality-body">
      {(canReview || dirty) && <>
        <div className="workshop-quality-actions">
          <button type="button" className="workshop-quality-primary" disabled={disabled || !ready || approved} onClick={() => review('aprobar')}>Aprobar servicio</button>
          <button type="button" disabled={disabled || !ready} aria-expanded={rejecting} onClick={() => setRejecting(true)}>Solicitar corrección</button>
        </div>
        {!ready && <p className="workshop-quality-help">Termina u omite el trabajo antes de revisar su calidad.</p>}
      </>}
      <details className="workshop-quality-detail" open={detailsOpen}>
        <summary onClick={(event) => { event.preventDefault(); setDetailsOpen((current) => !current); }}><span>Notas y detalle</span>{note && <span className="workshop-quality-draft">Nota sin guardar</span>}</summary>
        <div className="workshop-quality-body">
          {item.qualityReviewedAt && <p className="workshop-quality-help">Revisado {formatDateTime(item.qualityReviewedAt)}</p>}
          {item.qualityNote && <p className="workshop-quality-note">{item.qualityNote}</p>}
          {(canReview || dirty) && (!approved || note) && <label>{approved ? 'Nota local sin guardar' : 'Nota de revisión (opcional)'}<textarea aria-label={`Nota de calidad de ${item.descripcion}`} rows={2} maxLength={2000} value={note} readOnly={approved} disabled={disabled} onChange={(event) => { if (!approved) setNote(event.target.value); }} /></label>}
          {approved && note && <button type="button" disabled={mutation.isPending} onClick={() => setNote('')}>Descartar solo esta nota</button>}
          {!item.qualityNote && !(canReview || dirty) && <p className="workshop-quality-help">Sin notas de revisión.</p>}
        </div>
      </details>
      {(canReview || dirty) && <>
        {rejecting && <div className="workshop-quality-correction">
          <label>Motivo de la corrección<textarea aria-label={`Motivo de corrección de ${item.descripcion}`} rows={2} maxLength={2000} value={reason} disabled={disabled} onChange={(event) => setReason(event.target.value)} /></label>
          <label className="workshop-quality-check"><input type="checkbox" aria-label={`Cambiar equipo de ${item.descripcion}`} checked={replaceCrew} disabled={disabled} onChange={(event) => setReplaceCrew(event.target.checked)} />Cambiar equipo para la corrección (opcional)</label>
          {replaceCrew && <div className="workshop-quality-crew">
            <p className="workshop-quality-help">El servicio volverá a pendiente con el equipo que indiques.</p>
            {mechanics.isError && <p role="alert">No se pudo cargar la lista de mecánicos. El equipo del borrador se conserva.<button type="button" disabled={mutation.isPending} onClick={() => void mechanics.refetch()}>Reintentar lista</button></p>}
            {members.map((member, index) => {
              const assigned = originalItem?.assignments?.find((entry) => entry.userId === Number(member.userId));
              return <div className="workshop-quality-crew-row" role="group" aria-label={`Integrante ${index + 1} de corrección de ${item.descripcion}`} key={index}>
                <label>Mecánico<select aria-label={`Mecánico ${index + 1} para corrección de ${item.descripcion}`} value={member.userId} disabled={disabled || mechanics.isPending} onChange={(event) => setCrewDraft(members.map((entry, i) => i === index ? { ...entry, userId: event.target.value, specialtyId: undefined } : entry))}>
                  <option value="">Seleccionar mecánico</option>
                  {member.userId && !mechanics.data?.some((mechanic) => mechanic.id === Number(member.userId)) && <option value={member.userId}>{assigned?.userName ?? originalItem?.assignedUser?.nombre ?? `Mecánico #${member.userId}`}</option>}
                  {(mechanics.data ?? []).map((mechanic) => <option key={mechanic.id} value={mechanic.id} disabled={members.some((entry, i) => i !== index && entry.userId === String(mechanic.id))}>{mechanic.nombre}</option>)}
                </select></label>
                <label>Horas estimadas<input aria-label={`Horas del integrante ${index + 1} para corrección de ${item.descripcion}`} type="number" min="0" max="9999" step="0.25" value={member.estimatedHours} disabled={disabled} onChange={(event) => setCrewDraft(members.map((entry, i) => i === index ? { ...entry, estimatedHours: event.target.value } : entry))} /></label>
                <button type="button" disabled={disabled} onClick={() => setCrewDraft(members.filter((_, i) => i !== index))}>Quitar integrante {index + 1}</button>
              </div>;
            })}
            {invalidCrew && <p role="alert">{invalidCrew}</p>}
            <button type="button" disabled={disabled || mechanics.isPending || mechanics.isError || members.length >= 30} onClick={() => setCrewDraft([...members, { userId: '', estimatedHours: '' }])}>Agregar integrante</button>
          </div>}
          <div className="workshop-quality-actions"><button type="button" disabled={disabled} onClick={() => setRejecting(false)}>Volver</button><button type="button" disabled={disabled || reason.trim().length < 2 || Boolean(invalidCrew)} onClick={() => review('rechazar')}>Rechazar servicio</button></div>
        </div>}
      </>}
      {error && <p role="alert" className="workshop-quality-error">{error}</p>}
      {mutation.isPending && <p role="status">Guardando revisión de calidad…</p>}
    </div>
  </section>;
}

export default function WorkOrderQualityPanel({ workOrder, onState, active = true, focused = false }: { workOrder: WorkOrder; onState: OnState; active?: boolean; focused?: boolean }) {
  const user = useAuthStore((state) => state.user);
  const supervisor = Boolean(user && ['desarrollador', 'admin', 'jefe'].includes(user.role));
  const ownOrder = Boolean(user && (workOrder.assignedMechanicId === user.id || workOrder.items?.some((item) => item.assignments?.length ? item.assignments.some((member) => member.active && member.userId === user.id) : item.assignedUserId === user.id || item.assignedUser?.id === user.id)));
  const canRead = Boolean(user && hasUserPermission(user, 'taller', 'read') && (supervisor || (user.role === 'mecanico' && ownOrder)));
  const query = useWorkOrderQuality(workOrder.id, active && canRead);
  const workRevision = `${workOrder.estado}:${workOrder.updatedAt}:${(workOrder.items ?? []).map((item) => `${item.id}:${item.estadoOperativo}`).join(',')}`;
  const previousWorkRevision = useRef(workRevision);
  useEffect(() => {
    if (previousWorkRevision.current === workRevision) return;
    previousWorkRevision.current = workRevision;
    if (active && canRead) void query.refetch();
  }, [workRevision, active, canRead, query.refetch]);
  const confirm = useConfirmWorkOrderQualityMutation();
  const [expanded, setExpanded] = useState(focused);
  useEffect(() => { if (focused) setExpanded(true); }, [focused]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [states, setStates] = useState<Record<number, { dirty: boolean; pending: boolean }>>({});
  const onItemState = useCallback((id: number, dirty: boolean, pending: boolean) => setStates((current) => current[id]?.dirty === dirty && current[id]?.pending === pending ? current : { ...current, [id]: { dirty, pending } }), []);
  const dirty = Boolean(notes) || Object.values(states).some((state) => state.dirty);
  const pending = confirm.isPending || Object.values(states).some((state) => state.pending);
  useEffect(() => onState(dirty, pending), [onState, dirty, pending]);
  useEffect(() => () => onState(false, false), [onState]);
  const quality = query.data;
  const closed = ['entregada', 'cancelada'].includes(quality?.estado ?? workOrder.estado);
  const canReview = Boolean(canRead && supervisor && user && hasUserPermission(user, 'taller', 'update') && quality && !query.isError && !closed);
  const services = quality?.items.filter((item) => item.tipoLinea !== 'parte') ?? [];
  const approved = services.filter((item) => item.qualityStatus === 'aprobado').length;
  const readyToReview = services.filter((item) => reviewPriority(item) === 0).length;
  const servicesToFinish = services.filter((item) => reviewPriority(item) === 1).length;
  const unresolved = quality?.items.filter((item) => !['completado', 'omitido'].includes(item.estadoOperativo)).length ?? 0;
  const confirmed = Boolean(quality?.approvedAt);
  const ready = Boolean(quality?.canConfirm && quality.items.every((item) => ['completado', 'omitido'].includes(item.estadoOperativo)) && services.every((item) => item.qualityStatus === 'aprobado'));
  const submit = (): void => {
    if (!canReview || !ready || pending || confirmed) return;
    setError(null);
    confirm.mutate({ id: workOrder.id, data: { notas: notes.trim() || null } }, {
      onSuccess: () => { setNotes(''); notifySuccess('Calidad confirmada. La orden quedó finalizada.'); },
      onError: (failure) => setError(getApiErrorMessage(failure, 'No se pudo confirmar la calidad. Tus notas siguen disponibles para reintentar.')),
    });
  };
  if (!canRead) return null;
  return <details className="workshop-quality-panel" aria-busy={pending} open={expanded}>
    <summary onClick={(event) => { event.preventDefault(); setExpanded((current) => !current); }}><span><ClipboardCheck aria-hidden="true" />Control de calidad</span><span className="workshop-quality-badge" data-quality={confirmed ? 'aprobado' : 'pendiente'}>{confirmed ? 'Calidad confirmada' : 'Pendiente de calidad'}{quality ? ` · ${approved}/${services.length}` : ''}</span></summary>
    <div className="workshop-quality-body">
      {query.isPending && <p role="status">Cargando control de calidad…</p>}
      {query.isError && <div className="workshop-quality-error" role="alert"><span>No se pudo cargar la calidad. Las revisiones guardadas y tus borradores se conservan.</span><button type="button" onClick={() => void query.refetch()}><RotateCcw aria-hidden="true" />Reintentar calidad</button></div>}
      {quality && <>
        {confirmed && <p className="workshop-quality-note">Calidad confirmada el {formatDateTime(quality.approvedAt!)}{quality.approvalNote ? ` · ${quality.approvalNote}` : ''}</p>}
        {services.length > 0 && <p className="workshop-quality-list-heading">{readyToReview} {readyToReview === 1 ? 'listo' : 'listos'} para revisar · {servicesToFinish} por terminar</p>}
        {[...services].sort((a, b) => reviewPriority(a) - reviewPriority(b)).map((item) => <ItemQualityReview key={item.id} item={item} workOrder={workOrder} canReview={canReview} onState={onItemState} />)}
        {!services.length && <p className="workshop-quality-help">Sin servicios que requieran revisión individual.</p>}
        {(canReview || notes) && !confirmed && <section className="workshop-quality-final" aria-label="Confirmación final de calidad"><h3>Confirmación final de calidad</h3><div className="workshop-quality-body">
          <div className="workshop-quality-requirements"><span>{unresolved ? `${unresolved} ${unresolved === 1 ? 'trabajo' : 'trabajos'} por terminar u omitir` : 'Todos los trabajos resueltos'}</span><span>{approved}/{services.length} servicios aprobados</span></div>
          {!ready && <p className="workshop-quality-help">Completa u omite los trabajos y aprueba la calidad de cada servicio antes de confirmar.</p>}
          <details className="workshop-quality-detail"><summary>Notas finales (opcional){notes && <span className="workshop-quality-draft">Nota sin guardar</span>}</summary><div className="workshop-quality-body"><label>Notas finales<textarea aria-label="Notas finales de calidad" maxLength={2000} rows={2} value={notes} disabled={!canReview || pending} onChange={(event) => setNotes(event.target.value)} /></label></div></details>
          <button type="button" className="workshop-quality-primary" disabled={!canReview || !ready || pending} onClick={submit}>{confirm.isPending ? 'Confirmando…' : 'Confirmar calidad y finalizar'}</button>
          {error && <p className="workshop-quality-error" role="alert">{error}</p>}
        </div></section>}
        <details className="workshop-quality-history"><summary>Historial de calidad<span>{quality.history.length} registros</span></summary><div className="workshop-quality-body">
          {!quality.history.length && <p className="workshop-quality-help">Sin revisiones registradas.</p>}
          <ul>{quality.history.map((entry) => <li key={entry.id}><strong>{entry.workOrderItemId === null ? 'Confirmación general' : quality.items.find((item) => item.id === entry.workOrderItemId)?.descripcion ?? 'Servicio'} · {entry.decision === 'aprobado' ? 'Aprobado' : 'Rechazado'}</strong><span>{entry.reviewerName} · {formatDateTime(entry.createdAt)}</span>{entry.note && <p>{entry.note}</p>}</li>)}</ul>
        </div></details>
      </>}
    </div>
  </details>;
}
