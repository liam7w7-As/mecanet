import { BellRing, RotateCcw } from 'lucide-react';
import { useState } from 'react';

import './workshop-insights.css';

import { useWorkOrderAlerts } from '../../hooks/useWorkshopInsights';
import { formatDateTime } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';

import type { WorkOrder } from '../../types/entities';
import type { WorkshopAlertSummary } from '@unithor/shared';

export function visibleWorkshopAlerts(summary: WorkshopAlertSummary | undefined, userId: number | undefined, mechanic: boolean, workOrderId?: number) {
  return (summary?.alerts ?? []).filter((alert) => (!workOrderId || alert.workOrderId === workOrderId) && (!mechanic || (alert.userId === userId && !['commercial_difference', 'price_review_pending', 'valuation_pending'].includes(alert.kind))));
}

export function WorkshopAlertList({ summary, workOrderId }: { summary: WorkshopAlertSummary; workOrderId?: number }) {
  const user = useAuthStore((state) => state.user);
  const [showAll, setShowAll] = useState(false);
  const alerts = visibleWorkshopAlerts(summary, user?.id, user?.role === 'mecanico', workOrderId);
  const shown = showAll ? alerts : alerts.slice(0, 5);
  return <div className="workshop-insight-body">
    <p className="workshop-labor-help">{alerts.length} avisos · {alerts.filter((alert) => alert.priority === 'high').length} prioritarios · Actualizado {formatDateTime(summary.generatedAt)}</p>
    {!summary.scheduleConfigured && <p className="workshop-labor-help">La jornada del taller no está configurada. Los avisos de jornada pueden estar incompletos.</p>}
    {!alerts.length && <p className="workshop-insight-empty">{user?.role === 'mecanico' ? 'No tienes alertas personales para esta consulta.' : 'Sin alertas operativas para esta consulta.'}</p>}
    <ul className="workshop-insight-alerts">{shown.map((alert) => <li key={alert.id} data-priority={alert.priority}><div><strong>{alert.title}</strong><span className="workshop-insight-chip">{alert.priority === 'high' ? 'Prioritario' : alert.priority === 'medium' ? 'Atención' : 'Seguimiento'}</span></div><p>{alert.description}</p>{alert.workOrderCodigo && <small>{alert.workOrderCodigo}</small>}{(alert.href.startsWith('/work-orders/') || alert.href.startsWith('/work-orders?')) && <a href={alert.href} target="_blank" rel="noopener noreferrer">Abrir trabajo<span className="sr-only"> en otra pestaña</span></a>}</li>)}</ul>
    {alerts.length > 5 && <button type="button" className="secondary-button" onClick={() => setShowAll((current) => !current)}>{showAll ? 'Mostrar menos avisos' : `Ver los ${alerts.length} avisos`}</button>}
  </div>;
}

export default function WorkOrderAlertsPanel({ workOrder, active = true }: { workOrder: WorkOrder; active?: boolean }) {
  const user = useAuthStore((state) => state.user);
  const mechanic = user?.role === 'mecanico';
  const items = workOrder.items ?? [];
  const managed = (item: typeof items[number]): boolean => 'teamManaged' in item ? item.teamManaged === true : Boolean(item.assignments?.length);
  const owns = Boolean(user && (items.some((item) => managed(item) ? item.assignments?.some((member) => member.active && member.userId === user.id) : (item.assignedUserId ?? item.assignedUser?.id ?? workOrder.assignedMechanicId) === user.id) || (!items.some(managed) && workOrder.assignedMechanicId === user.id)));
  const allowed = Boolean(user && hasUserPermission(user, 'taller', 'read') && (['admin', 'desarrollador', 'jefe'].includes(user.role) || (mechanic && owns)));
  const [expanded, setExpanded] = useState(true);
  const query = useWorkOrderAlerts(workOrder.id, active && expanded && allowed);
  const alerts = visibleWorkshopAlerts(query.data, user?.id, mechanic, workOrder.id);
  if (!allowed) return null;
  return <details className="workshop-insight-panel" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
    <summary onClick={(event) => { event.preventDefault(); setExpanded((current) => !current); }}><span><BellRing aria-hidden="true" />{mechanic ? 'Mis alertas de esta OT' : 'Alertas de esta OT'}</span><span>{query.data ? `${alerts.length} avisos` : 'Demoras, registros y calidad'}</span></summary>
    <div className="workshop-insight-body">
      {query.isPending && active && expanded && <p role="status">Consultando alertas…</p>}
      {query.isError && <div role="alert" className="workshop-labor-error"><span>No se pudieron consultar las alertas.</span><button type="button" disabled={!active || !expanded} onClick={() => void query.refetch()}><RotateCcw aria-hidden="true" />Reintentar alertas</button></div>}
      {query.data && <WorkshopAlertList summary={query.data} workOrderId={workOrder.id} />}
    </div>
  </details>;
}
