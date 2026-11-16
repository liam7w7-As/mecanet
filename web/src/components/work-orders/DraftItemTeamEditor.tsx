import type { EditableWorkOrderItem } from './WorkOrderItemsEditor';

interface Props {
  item: EditableWorkOrderItem;
  mechanics: ReadonlyArray<{ id: number; nombre: string }>;
  onChange: (members: EditableWorkOrderItem['teamMembers']) => void;
}
/** Reception drafts only: the complete team is persisted atomically with the OT. */
export default function DraftItemTeamEditor({ item, mechanics, onChange }: Props) {
  const members = item.teamMembers;
  if (!members) return <button type="button" className="text-xs font-semibold text-brand-primaryInk underline underline-offset-4" onClick={() => onChange([{ userId: item.assignedUserId ?? 0, estimatedHours: item.horasHombreEstimadas ? Number(item.horasHombreEstimadas) * Number(item.cantidad) : null }])}>Asignar varios mecánicos</button>;
  return <div className="space-y-2 rounded-xl border border-brand-line p-3">
    <p className="text-xs font-semibold text-brand-primaryInk">Equipo del servicio · horas por trabajador</p>
    {members.map((member, index) => <div className="flex flex-wrap items-end gap-2" key={index}>
      <label className="min-w-[130px] flex-1 text-xs">Mecánico {index + 1}<select className="form-control w-full" aria-label={`Integrante ${index + 1} de ${item.descripcion}`} value={member.userId || ''} onChange={(event) => onChange(members.map((m, i) => i === index ? { ...m, userId: Number(event.target.value) } : m))}>
        <option value="">Selecciona un mecánico</option>{mechanics.filter((worker) => worker.id === member.userId || !members.some((m) => m.userId === worker.id)).map((worker) => <option key={worker.id} value={worker.id}>{worker.nombre}</option>)}
      </select></label>
      <label className="w-24 text-xs">Horas estimadas<input className="form-control w-full" type="number" min="0" max="9999" step="0.25" value={member.estimatedHours ?? ''} onChange={(event) => onChange(members.map((m, i) => i === index ? { ...m, estimatedHours: event.target.value === '' ? null : Number(event.target.value) } : m))} /></label>
      <button type="button" className="secondary-button px-2 text-xs" aria-label={`Quitar integrante ${index + 1}`} onClick={() => onChange(members.filter((_, i) => i !== index))}>Quitar</button>
    </div>)}
    <div className="flex flex-wrap gap-3"><button type="button" className="text-xs font-semibold text-brand-primaryInk" disabled={members.length >= mechanics.length} onClick={() => onChange([...members, { userId: 0, estimatedHours: null }])}>+ Agregar integrante</button><button type="button" className="text-xs text-brand-muted" onClick={() => onChange(undefined)}>Usar responsable único</button></div>
  </div>;
}
