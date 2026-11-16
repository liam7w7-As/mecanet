import { History, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';

import './workshop-insights.css';

import { useWorkOrderHistory, validInsightDate } from '../../hooks/useWorkshopInsights';
import { formatClp, formatDate } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';

import type { WorkOrder } from '../../types/entities';

interface Filters { fechaDesde: string; fechaHasta: string; sameVehicle: boolean; search: string }
const emptyFilters: Filters = { fechaDesde: '', fechaHasta: '', sameVehicle: false, search: '' };
const hours = (value: number | null): string => value === null ? 'Sin registro' : `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(value)} h`;

export default function WorkOrderHistoryPanel({ workOrder, active = true, requestedItem, onState }: { workOrder: WorkOrder; active?: boolean; requestedItem?: { itemId: number }; onState?: (dirty: boolean, pending: boolean) => void }) {
  const user = useAuthStore((state) => state.user);
  const allowed = Boolean(user && ['admin', 'desarrollador', 'jefe'].includes(user.role) && hasUserPermission(user, 'taller', 'read'));
  const services = (workOrder.items ?? []).filter((item) => item.tipoLinea !== 'parte');
  const [expanded, setExpanded] = useState(false);
  const [itemId, setItemId] = useState(String(requestedItem?.itemId ?? services[0]?.id ?? ''));
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(1);
  const selected = services.find((item) => item.id === Number(itemId));
  const dirty = JSON.stringify(draft) !== JSON.stringify(filters);
  const valid = (!draft.fechaDesde || validInsightDate(draft.fechaDesde)) && (!draft.fechaHasta || validInsightDate(draft.fechaHasta)) && (!draft.fechaDesde || !draft.fechaHasta || draft.fechaDesde <= draft.fechaHasta) && draft.search.trim().length <= 80;
  const query = useWorkOrderHistory(workOrder.id, Number(itemId), { page, pageSize: 10, ...(filters.fechaDesde ? { fechaDesde: filters.fechaDesde } : {}), ...(filters.fechaHasta ? { fechaHasta: filters.fechaHasta } : {}), ...(filters.sameVehicle ? { sameVehicle: true } : {}), ...(filters.search.trim() ? { search: filters.search.trim() } : {}) }, active && expanded && allowed && Boolean(selected));
  useEffect(() => { if (requestedItem) { setItemId(String(requestedItem.itemId)); setPage(1); setExpanded(true); } }, [requestedItem]);
  useEffect(() => onState?.(dirty, false), [onState, dirty]);
  useEffect(() => () => onState?.(false, false), [onState]);
  const history = query.data;
  const firstServiceId = services[0]?.id;
  useEffect(() => { if (!selected && firstServiceId !== undefined) { setItemId(String(firstServiceId)); setPage(1); } }, [selected?.id, firstServiceId]);
  if (!allowed) return null;
  return <details className="workshop-insight-panel" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
    <summary><span><History aria-hidden="true" />Comparar trabajos anteriores</span><span>Horas y precios de referencia</span></summary>
    <div className="workshop-insight-body">
      <p className="workshop-labor-help">Consulta servicios terminados de órdenes anteriores finalizadas o entregadas. Esta referencia no modifica los precios ni las estimaciones actuales.</p>
      {!services.length ? <p>Esta OT no tiene servicios para comparar.</p> : <>
        <label>Servicio para comparar<select value={itemId} disabled={!active} onChange={(event) => { setItemId(event.target.value); setPage(1); }}><option value="">Seleccionar servicio</option>{services.map((item) => <option key={item.id} value={item.id}>{item.descripcion}</option>)}</select></label>
        {selected && <div className="workshop-insight-metrics" aria-label="Trabajo actual"><div><span>Cantidad actual</span><strong>{selected.cantidad} {selected.unidadMedida}</strong></div><div><span>Estimación actual por unidad</span><strong>{hours(selected.horasHombreEstimadas)}</strong></div><div><span>Horas actuales del servicio</span><strong>{hours(selected.horasHombreReales)}</strong></div></div>}
        <div className="workshop-insight-filters">
          <label>Desde<input type="date" aria-label="Historial desde" value={draft.fechaDesde} disabled={!active} onChange={(event) => setDraft((current) => ({ ...current, fechaDesde: event.target.value }))} /></label>
          <label>Hasta<input type="date" aria-label="Historial hasta" value={draft.fechaHasta} disabled={!active} onChange={(event) => setDraft((current) => ({ ...current, fechaHasta: event.target.value }))} /></label>
          <label>Buscar antecedente<input aria-label="Buscar en trabajos anteriores" maxLength={80} value={draft.search} disabled={!active} onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))} /></label>
          <label className="workshop-insight-check"><input type="checkbox" checked={draft.sameVehicle} disabled={!active} onChange={(event) => setDraft((current) => ({ ...current, sameVehicle: event.target.checked }))} />Solo el mismo vehículo</label>
          <button type="button" disabled={!valid || !active || !selected} onClick={() => { setFilters({ ...draft, search: draft.search.trim() }); setDraft((current) => ({ ...current, search: current.search.trim() })); setPage(1); }}>Aplicar filtros de historial</button>
        </div>
        {!valid && <p role="alert">Revisa las fechas: desde no puede ser posterior a hasta.</p>}
        {query.isPending && expanded && active && selected && <p role="status">Consultando trabajos anteriores…</p>}
        {query.isError && <div className="workshop-labor-error" role="alert"><span>No se pudieron cargar los trabajos anteriores. Los filtros se conservan.</span><button type="button" disabled={!active || !expanded} onClick={() => void query.refetch()}><RotateCcw aria-hidden="true" />Reintentar historial</button></div>}
        {history && <>
          <section aria-label="Referencia de esta página" className="workshop-insight-reference"><h3>Referencia de esta página</h3><p>{history.reference.samples} servicios · {history.reference.hourSamples} con horas · {history.reference.priceSamples} con precio neto</p><div className="workshop-insight-metrics"><div><span>Horas promedio por unidad</span><strong>{history.reference.averageHoursPerUnit === null ? 'Sin referencia de horas' : hours(history.reference.averageHoursPerUnit)}</strong></div><div><span>Precio neto promedio por unidad</span><strong>{history.reference.averageNetUnitPrice === null ? 'Sin referencia de precio' : formatClp(history.reference.averageNetUnitPrice)}</strong></div></div><p>Precio neto después de descuentos, sin IVA ni abonos. Los diagnósticos sin valoración no aportan al promedio de precios.</p></section>
          <details className="workshop-insight-criteria"><summary>Criterios de comparación</summary><div className="workshop-insight-body"><p className="workshop-labor-help">{history.matchMode === 'catalog' ? 'Mismo servicio de catálogo, tipo y unidad.' : 'Misma descripción (sin distinguir mayúsculas ni espacios exteriores), tipo y unidad.'}</p>{history.notes.map((note, index) => <p className="workshop-labor-help" key={index}>{note}</p>)}</div></details>
          {!history.items.length ? <p className="workshop-insight-empty">Sin trabajos anteriores comparables para estos filtros.</p> : <div className="workshop-insight-table-wrap"><table className="workshop-insight-table"><caption className="sr-only">Trabajos anteriores comparables</caption><thead><tr><th>Orden / vehículo</th><th>Cantidad</th><th>Horas estimadas / reales</th><th>Horas por unidad</th><th>Precio neto por unidad</th><th>Calidad</th></tr></thead><tbody>{history.items.map((entry) => <tr key={`${entry.workOrderId}-${entry.itemId}`}><td data-label="Orden / vehículo"><a href={`/work-orders/${entry.workOrderId}`} target="_blank" rel="noopener noreferrer">{entry.codigo}<span className="sr-only"> en otra pestaña</span></a><small>{formatDate(entry.fechaIngreso)} · {entry.vehicle?.patente ?? 'Sin vehículo'}</small><small>{entry.description}</small></td><td data-label="Cantidad">{entry.quantity} {entry.unit}</td><td data-label="Horas estimadas / reales">{hours(entry.estimatedHours)} / {hours(entry.actualHours)}</td><td data-label="Horas por unidad">{hours(entry.hoursPerUnit)}</td><td data-label="Precio neto por unidad">{entry.netUnitPrice === null ? 'Sin valoración' : formatClp(entry.netUnitPrice)}</td><td data-label="Calidad">{entry.qualityApproved ? 'Aprobada' : 'Sin aprobación registrada'}</td></tr>)}</tbody></table></div>}
          <div className="workshop-insight-pagination"><button type="button" disabled={!active || page <= 1} onClick={() => setPage((current) => current - 1)}>Página anterior</button><span>Página {history.page} de {Math.max(1, history.totalPages)} · {history.total} antecedentes</span><button type="button" disabled={!active || page >= history.totalPages} onClick={() => setPage((current) => current + 1)}>Página siguiente</button></div>
        </>}
      </>}
    </div>
  </details>;
}
