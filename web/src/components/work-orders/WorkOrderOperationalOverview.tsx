import { ArrowRight, BadgeDollarSign, ClipboardCheck, PackageSearch, UsersRound } from 'lucide-react';

import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';

import type { WorkOrder, WorkOrderItem } from '../../types/entities';

export type ExecutionFocus = 'all' | 'unassigned' | 'quality';

const hasTeam = (item: WorkOrderItem): boolean => 'teamManaged' in item
  ? item.teamManaged === true
  : Boolean(item.assignments?.length);

const assignedTo = (item: WorkOrderItem, order: WorkOrder, userId?: number): boolean => hasTeam(item)
  ? Boolean(item.assignments?.some((member) => member.active && member.userId === userId))
  : (item.assignedUserId ?? item.assignedUser?.id ?? order.assignedMechanicId) === userId;

export default function WorkOrderOperationalOverview({ workOrder, focus, pending, onFocus, onRequests, onPrice }: {
  workOrder: WorkOrder;
  focus: ExecutionFocus;
  pending: boolean;
  onFocus: (focus: ExecutionFocus) => void;
  onRequests: () => void;
  onPrice: (itemId: number) => void;
}) {
  const user = useAuthStore((state) => state.user);
  if (!user || !hasUserPermission(user, 'taller', 'read')) return null;
  const supervisor = ['admin', 'desarrollador', 'jefe'].includes(user.role);
  const mechanic = user.role === 'mecanico';
  if (!supervisor && !mechanic) return null;
  const items = workOrder.items ?? [];
  const services = items.filter((item) => item.tipoLinea !== 'parte');
  const finished = (item: WorkOrderItem) => ['completado', 'omitido'].includes(item.estadoOperativo);
  const closed = ['entregada', 'cancelada'].includes(workOrder.estado);
  const mine = items.filter((item) => assignedTo(item, workOrder, user.id));
  const unassigned = services.filter((item) => !finished(item) && (hasTeam(item)
    ? !item.assignments?.some((member) => member.active)
    : !(item.assignedUserId ?? item.assignedUser?.id ?? workOrder.assignedMechanicId)));
  const quality = services.filter((item) => finished(item) && item.qualityStatus !== 'aprobado');
  const requests = (workOrder.requests ?? []).filter((request) => request.estado === 'pendiente');
  const unpriced = services.filter((item) => Number(item.precioUnitario) <= 0);
  return <section className="workshop-operational-overview" aria-label={supervisor ? 'Prioridades de esta OT' : 'Resumen de mi trabajo'}>
    <div className="workshop-operational-heading"><div><h2>{supervisor ? 'Control del taller' : 'Mi trabajo en esta OT'}</h2><p>{closed ? 'Trabajos e historial disponibles para consulta.' : supervisor
      ? 'Resuelve los pendientes sin salir de esta orden.'
      : `${mine.filter(finished).length} de ${mine.length} trabajos terminados · Inicia o continúa tu servicio para registrar tus horas.`}</p></div>
      {supervisor && <button type="button" disabled={pending} aria-pressed={focus === 'all'} onClick={() => onFocus('all')}>Ver trabajos<ArrowRight aria-hidden="true" /></button>}
    </div>
    {supervisor && !closed && <div className="workshop-operational-priorities">
      <button type="button" disabled={pending} aria-pressed={focus === 'unassigned'} onClick={() => onFocus('unassigned')}><UsersRound aria-hidden="true" /><span>Asignar equipo<small>Servicios sin responsable</small></span><strong>{unassigned.length}</strong></button>
      <button type="button" disabled={pending} aria-pressed={focus === 'quality'} onClick={() => onFocus('quality')}><ClipboardCheck aria-hidden="true" /><span>Revisar calidad<small>{workOrder.qualityApprovedAt ? 'Calidad general confirmada' : 'Servicios listos para revisión'}</small></span><strong>{quality.length}</strong></button>
      <button type="button" disabled={pending} onClick={onRequests}><PackageSearch aria-hidden="true" /><span>Resolver solicitudes<small>Repuestos y propuestas del equipo</small></span><strong>{requests.length}</strong></button>
      <button type="button" disabled={pending || !unpriced.length} onClick={() => { if (unpriced[0]) onPrice(unpriced[0].id); }}><BadgeDollarSign aria-hidden="true" /><span>Por valorar<small>{unpriced.length ? 'Diagnósticos con precio pendiente' : 'Todos los servicios con precio'}</small></span><strong>{unpriced.length}</strong></button>
    </div>}
    {supervisor && closed && <button type="button" disabled={pending} onClick={() => onFocus('quality')}>Consultar calidad</button>}
  </section>;
}
