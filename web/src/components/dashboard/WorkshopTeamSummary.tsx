import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { WorkshopDailyReport } from '../../types/entities';

interface Props {
  report: WorkshopDailyReport | undefined;
  pending: boolean;
  failed: boolean;
  onRetry: () => void;
}

export default function WorkshopTeamSummary({ report, pending, failed, onRetry }: Props) {
  const people = [...(report?.usuarios ?? [])].sort((a, b) => Number(b.enCurso) - Number(a.enCurso) || b.horas - a.horas).slice(0, 5);
  return <section className="view-panel-body dashboard-team border-t border-brand-line" aria-label="Actividad del equipo">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2>Equipo de hoy</h2><Link className="dashboard-team-report" to="/work-orders/daily-report">Reporte diario<ArrowRight aria-hidden="true" /></Link></div>
    {pending ? <p className="py-5 animate-pulse" role="status">Cargando actividad del taller…</p> : failed ? <div className="py-4" role="alert"><p>No se pudo cargar la actividad del equipo.</p><button type="button" className="table-action" onClick={onRetry}>Reintentar</button></div> : <>
      {people.length === 0 && <p className="py-5">Sin actividad registrada hoy.</p>}
      {people.map((person) => <div className="dashboard-team-person" key={person.id}><div><span className="dashboard-team-avatar" aria-hidden="true">{person.nombre.trim().split(/\s+/).slice(0, 2).map((name) => name[0]).join('')}</span><span><strong>{person.nombre}</strong><small>{person.itemsCompletados} trabajos completados</small></span><span className="dashboard-team-hours">{new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(person.horas)} h<span className={`status-chip ${person.enCurso ? 'green' : ''}`}>{person.enCurso ? 'En curso' : 'Con actividad'}</span></span></div>
        {person.detalle.length > 0 && <details><summary>Ver trabajos ({person.detalle.length})</summary>{person.detalle.map((item, index) => <Link key={`${item.workOrderId}-${index}`} to={`/work-orders?manage=${item.workOrderId}`}><strong>{item.workOrderCodigo}</strong><span>{item.itemDescripcion}</span></Link>)}</details>}
      </div>)}
    </>}
  </section>;
}
