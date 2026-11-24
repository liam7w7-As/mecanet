import { Clock3 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useModalOverlay } from '../../hooks/useModalOverlay';
import { useAssignItemTeamMutation } from '../../hooks/useWorkOrderLabor';
import { useWorkshopPersonnel } from '../../hooks/useWorkshopPersonnel';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp } from '../../lib/formatters';
import { notifySuccess } from '../../stores/toast.store';

import type { WorkOrderMechanic } from '../../hooks/useWorkOrders';
import type { WorkOrderWorksheetItem } from '../../types/entities';

interface ReasonDialogProps {
  description: string;
  reason: string;
  onReasonChange: (reason: string) => void;
  pending: boolean;
  disabled?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function ItemEstimateReasonDialog({ description, reason, onReasonChange, pending, disabled, error, onClose, onConfirm }: ReasonDialogProps) {
  const titleId = useId();
  const panelRef = useModalOverlay({ isOpen: true, onClose, isPending: pending, labelledBy: titleId });
  return createPortal(<div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-[#18273c55] p-4 backdrop-blur-sm">
    <section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="workshop-action-dialog relative w-full max-w-[440px] bg-white p-6 shadow-2xl">
      <h2 id={titleId} className="text-lg font-semibold text-brand-ink">Motivo del cambio de estimación</h2>
      <p className="mt-2 text-sm text-brand-muted">{description}</p>
      <label className="mt-4 grid gap-2 text-sm text-brand-ink">Motivo del cambio<textarea className="form-control" rows={3} maxLength={500} value={reason} disabled={pending} onChange={(event) => onReasonChange(event.target.value)} /></label>
      <p className="mt-2 text-xs text-brand-muted">Indica al menos 2 caracteres.</p>
      {error && <p role="alert" className="workshop-labor-error mt-3">{error}</p>}
      <div className="dialog-buttons mt-5">
        <button type="button" className="secondary-button" disabled={pending} onClick={onClose}>Volver</button>
        <button type="button" className="primary-button" disabled={pending || disabled || reason.trim().length < 2 || reason.trim().length > 500} onClick={onConfirm}>{pending ? 'Guardando…' : 'Confirmar cambio'}</button>
      </div>
    </section>
  </div>, document.body);
}

interface MemberDraft {
  userId: string;
  specialtyId?: number | null;
  estimatedHours: string;
}

interface TeamEditorProps {
  item: WorkOrderWorksheetItem;
  workOrderId: number;
  editable: boolean;
  showFinancials?: boolean;
  disabled: boolean;
  mechanics: WorkOrderMechanic[];
  loadingMechanics: boolean;
  mechanicsError: boolean;
  autoOpenTeam?: boolean;
  onState: (dirty: boolean, pending: boolean) => void;
}

const initialMembers = (item: WorkOrderWorksheetItem): MemberDraft[] => {
  if (item.assignments?.length) return item.assignments.filter((member) => member.active).map((member) => ({
    userId: String(member.userId), specialtyId: member.specialtyId,
    estimatedHours: member.estimatedHours === null ? '' : String(member.estimatedHours),
  }));
  return item.assignedUser ? [{ userId: String(item.assignedUser.id), estimatedHours: item.horasEstimadasTotales === null ? '' : String(item.horasEstimadasTotales) }] : [];
};

const memberError = (members: MemberDraft[]): string | null => {
  if (members.some((member) => !member.userId)) return 'Selecciona un mecánico para cada integrante.';
  if (new Set(members.map((member) => member.userId)).size !== members.length) return 'Cada mecánico solo puede aparecer una vez en el equipo.';
  if (members.length > 30) return 'El equipo admite hasta 30 integrantes.';
  if (members.some((member) => member.estimatedHours !== '' && (!Number.isFinite(Number(member.estimatedHours)) || Number(member.estimatedHours) < 0 || Number(member.estimatedHours) > 9999))) return 'Las horas estimadas deben estar entre 0 y 9999.';
  return null;
};

export default function WorkOrderTeamEditor({ item, workOrderId, editable, showFinancials = false, disabled, mechanics, loadingMechanics, mechanicsError, autoOpenTeam = false, onState }: TeamEditorProps) {
  const mutation = useAssignItemTeamMutation();
  const personnel = useWorkshopPersonnel(editable);
  const [draft, setDraft] = useState<MemberDraft[] | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(autoOpenTeam);
  const [focusRequest, setFocusRequest] = useState(0);
  const editorId = useId();
  const editorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (autoOpenTeam) setEditing(true); }, [autoOpenTeam]);
  useEffect(() => {
    if (editing && focusRequest > 0) {
      const editor = editorRef.current;
      (editor?.querySelector<HTMLElement>('input[type="number"]:not(:disabled)')
        ?? editor?.querySelector<HTMLElement>('select:not(:disabled), button[data-add-member]'))?.focus();
    }
  }, [editing, focusRequest]);
  const baseline = initialMembers(item);
  const members = draft ?? baseline;
  const changed = draft !== null && JSON.stringify(draft) !== JSON.stringify(baseline);
  const invalid = memberError(members);
  const locked = disabled || !editable || mutation.isPending;
  const dirty = changed || Boolean(reason);
  useEffect(() => onState(dirty, mutation.isPending), [onState, dirty, mutation.isPending]);
  useEffect(() => () => onState(false, false), [onState]);
  const update = (index: number, values: Partial<MemberDraft>): void => setDraft(members.map((member, i) => i === index ? { ...member, ...values } : member));
  const save = (): void => {
    if (locked || !changed || invalid || reason.trim().length < 2 || reason.trim().length > 500) return;
    setError(null);
    mutation.mutate({ id: workOrderId, itemId: item.id, data: {
      members: members.map((member) => ({ userId: Number(member.userId), ...(member.specialtyId === undefined ? {} : { specialtyId: member.specialtyId }), estimatedHours: member.estimatedHours === '' ? null : Number(member.estimatedHours) })),
      motivo: reason.trim(),
    } }, {
      onSuccess: () => { setDraft(null); setReason(''); notifySuccess('Equipo y horas estimadas guardados.'); },
      onError: (failure) => setError(getApiErrorMessage(failure, 'No se pudo guardar. El equipo, las horas y el motivo siguen disponibles para reintentar.')),
    });
  };
  if (!editable && draft === null && !item.assignments?.some((member) => member.active)) return null;
  return <section className="workshop-job-team" aria-label={`Equipo de trabajo de ${item.descripcion}`}>
    <div className="workshop-job-team-heading">
      <div><h4>Equipo de trabajo</h4><p>{members.length ? members.map((member) => mechanics.find((mechanic) => mechanic.id === Number(member.userId))?.nombre ?? item.assignments?.find((entry) => entry.userId === Number(member.userId))?.userName ?? item.assignedUser?.nombre ?? 'Mecánico por seleccionar').join(' · ') : 'Sin integrantes asignados'}</p></div>
      <div className="workshop-labor-actions">
        {editable && <button type="button" className="workshop-job-hours-button" aria-controls={editorId} aria-expanded={editing} disabled={locked} onClick={() => { setEditing(true); setFocusRequest((current) => current + 1); }}><Clock3 aria-hidden="true" />Asignar horas</button>}
        {editing && (editable || draft !== null) && <button type="button" disabled={mutation.isPending} aria-label={`Cerrar edición de equipo de ${item.descripcion}`} onClick={() => setEditing(false)}>Cerrar edición</button>}
      </div>
    </div>
    <div ref={editorRef} id={editorId} className="workshop-labor-detail-body" hidden={(editable || draft !== null) && !editing}>
      {editable || draft !== null ? <>
        {mechanicsError && <p className="workshop-labor-help">No se pudo cargar la lista de mecánicos. Los integrantes y horas del borrador se conservan.</p>}
        {personnel.isError && <p className="workshop-labor-help">No se pudieron cargar las especialidades. Se conserva la especialidad de cada integrante.</p>}
        {members.map((member, index) => {
          const current = item.assignments?.find((assignment) => assignment.userId === Number(member.userId));
          const fallbackName = current?.userName ?? (item.assignedUser?.id === Number(member.userId) ? item.assignedUser.nombre : `Mecánico #${member.userId}`);
          const profile = personnel.data?.profiles?.find((entry) => entry.userId === Number(member.userId));
          const specialtyIds = [profile?.principalSpecialtyId, ...(profile?.additionalSpecialtyIds ?? [])];
          const specialties = personnel.data?.specialties?.filter((specialty) => specialty.active && specialtyIds.includes(specialty.id)) ?? [];
          const principal = specialties.find((specialty) => specialty.id === profile?.principalSpecialtyId);
          const estimateHours = Number(member.estimatedHours);
          const theoreticalValue = current?.saleHourly != null && member.estimatedHours !== '' && Number.isFinite(estimateHours) && estimateHours > 0
            ? estimateHours * current.saleHourly
            : null;
          return <div key={index} className="workshop-labor-admin" role="group" aria-label={`Integrante ${index + 1} de ${item.descripcion}`}>
            <label>Mecánico<select aria-label={`Mecánico ${index + 1} de ${item.descripcion}`} value={member.userId} disabled={locked || loadingMechanics} onChange={(event) => update(index, { userId: event.target.value, specialtyId: undefined })}>
              <option value="">Seleccionar mecánico</option>
              {member.userId && !mechanics.some((mechanic) => mechanic.id === Number(member.userId)) && <option value={member.userId}>{fallbackName}</option>}
              {mechanics.map((mechanic) => <option key={mechanic.id} value={mechanic.id} disabled={members.some((other, otherIndex) => otherIndex !== index && other.userId === String(mechanic.id))}>{mechanic.nombre}</option>)}
            </select></label>
            <label>Horas estimadas<input aria-label={`Horas estimadas del integrante ${index + 1} de ${item.descripcion}`} type="number" min="0" max="9999" step="0.25" placeholder="Sin definir" value={member.estimatedHours} disabled={locked} onChange={(event) => update(index, { estimatedHours: event.target.value })} /></label>
            {personnel.data?.specialties ? <label>Especialidad (opcional)<select aria-label={`Especialidad del integrante ${index + 1} de ${item.descripcion}`} value={member.specialtyId === undefined ? 'principal' : member.specialtyId ?? ''} disabled={locked || !member.userId} onChange={(event) => update(index, { specialtyId: event.target.value === 'principal' ? profile?.principalSpecialtyId ?? undefined : event.target.value === '' ? null : Number(event.target.value) })}>
              <option value="principal">{principal ? `Principal: ${principal.name}` : 'Principal del trabajador'}</option>
              <option value="">Sin especialidad</option>
              {member.specialtyId != null && !specialties.some((specialty) => specialty.id === member.specialtyId) && <option value={member.specialtyId}>{current?.specialtyName ?? `Especialidad #${member.specialtyId}`} (asignada)</option>}
              {specialties.map((specialty) => <option key={specialty.id} value={specialty.id}>{specialty.name}</option>)}
            </select></label> : current?.specialtyName && <small>Especialidad: {current.specialtyName}</small>}
            {theoreticalValue !== null && <small>Valor teórico: {formatClp(theoreticalValue)}</small>}
            {current?.completedAt && <small>Parte terminada</small>}
            <button type="button" disabled={locked} onClick={() => setDraft(members.filter((_, i) => i !== index))}>Quitar integrante {index + 1}</button>
          </div>;
        })}
        {!members.length && <p>Sin integrantes asignados.</p>}
        {changed && invalid && <p role="alert">{invalid}</p>}
        <label>Motivo del cambio de equipo<textarea rows={2} maxLength={500} value={reason} disabled={locked} onChange={(event) => setReason(event.target.value)} /></label>
        <p className="workshop-labor-help">Indica al menos 2 caracteres.</p>
        <div className="workshop-labor-actions">
          <button type="button" data-add-member disabled={locked || loadingMechanics || mechanicsError || members.length >= 30} onClick={() => setDraft([...members, { userId: '', estimatedHours: '' }])}>Agregar integrante</button>
          <button type="button" className="workshop-labor-primary" disabled={locked || !changed || Boolean(invalid) || reason.trim().length < 2 || reason.trim().length > 500} onClick={save}>{mutation.isPending ? 'Guardando equipo…' : 'Guardar equipo'}</button>
        </div>
        {error && <p role="alert" className="workshop-labor-error">{error}</p>}
      </> : <ul>{item.assignments?.filter((member) => member.active).map((member) => <li key={member.id}><strong>{member.userName ?? `Mecánico #${member.userId}`}</strong><span>{member.specialtyName ? `${member.specialtyName} · ` : ''}Estimado: {member.estimatedHours === null ? 'Sin definir' : `${member.estimatedHours} h`}{showFinancials && member.saleHourly != null && member.estimatedHours != null ? ` · Valor teórico: ${formatClp(member.saleHourly * member.estimatedHours)}` : ''}{member.completedAt ? ' · Parte terminada' : ''}</span></li>)}</ul>}
    </div>
  </section>;
}
