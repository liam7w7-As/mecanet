import { WORK_ORDER_STATUS } from '@unithor/shared';
import { AlertCircle, CheckCircle2, Clock3, Users, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import BrandLogo from '../../components/common/BrandLogo';
import DatePicker from '../../components/common/DatePicker';
import ListExportButtons from '../../components/common/ListExportButtons';
import DashboardKpi from '../../components/dashboard/DashboardKpi';
import WorkOrderStatusBadge from '../../components/work-orders/WorkOrderStatusBadge';
import { useWorkshopDailyReport } from '../../hooks/useWorkOrderLabor';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatDateTime, toLocalDateInput } from '../../lib/formatters';
import { ROLE_LABELS } from '../../lib/permissions';

import type { Role } from '@unithor/shared';

const formatHours = (value: number): string => `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(value)} h`;
const formatMinutes = (minutes: number): string => `${Math.floor(Math.max(0, minutes) / 60)} h ${Math.max(0, minutes) % 60} min`;

export const WorkshopDailyReportPage = () => {
  const [fecha, setFecha] = useState(() => toLocalDateInput(new Date()));
  const reportQuery = useWorkshopDailyReport(fecha);
  const report = reportQuery.data;
  const metrics = [
    { title: 'Horas registradas', value: report ? formatHours(report.totalHoras) : '—', detail: `${report?.totalSesiones ?? 0} sesiones de trabajo`, icon: Clock3, testId: 'daily-hours' },
    { title: 'Trabajos completados', value: String(report?.totalItemsCompletados ?? 0), detail: 'En la fecha seleccionada', icon: CheckCircle2, testId: 'daily-completed' },
    { title: 'Personas en curso', value: String(report?.usuarios.filter((person) => person.enCurso).length ?? 0), detail: `${report?.usuarios.length ?? 0} personas con actividad`, icon: Users, testId: 'daily-running' },
    { title: 'Órdenes con actividad', value: String(report?.ordenes.length ?? 0), detail: 'Trabajo registrado en el día', icon: Wrench, testId: 'daily-orders' },
  ];
  return <div className="workspace-page workspace-dashboard workshop-role-report min-w-0 space-y-5">
    <header className="page-banner">
      <div><div className="dashboard-heading"><h1>Reporte diario de horas</h1><BrandLogo className="dashboard-heading-logo" /></div><p className="mt-1 text-sm text-brand-muted">Actividad del equipo y avances del taller</p></div>
      <div className="workshop-report-tools">
        <DatePicker label="Fecha del reporte" value={fecha} onChange={setFecha} allowClear={false} />
        <ListExportButtons
          target="workshop-daily"
          filters={{ fecha }}
          disabled={reportQuery.isPending || reportQuery.isError}
        />
      </div>
    </header>
    {reportQuery.isError && <div className="workshop-overview-error" role="alert"><AlertCircle aria-hidden="true" /><span>{getApiErrorMessage(reportQuery.error, 'No se pudo cargar el reporte diario.')}</span><button type="button" onClick={() => void reportQuery.refetch()}>Reintentar</button></div>}
    <section className="dashboard-metrics" aria-label="Resumen de actividad diaria" aria-busy={reportQuery.isPending}>{metrics.map((metric) => <div className={`dashboard-kpi${reportQuery.isPending ? ' animate-pulse' : ''}`} key={metric.testId}><DashboardKpi {...metric} value={!report ? '—' : metric.value} /></div>)}</section>
    {report && <>
      <section className="view-panel"><div className="view-panel-title flex flex-wrap justify-between gap-2"><h2>Avance por persona</h2><span className="text-xs text-brand-muted">Actualizado {formatDateTime(report.generadoEn)}</span></div>{report.usuarios.length === 0 ? <p className="empty-row">Sin actividad registrada en la fecha seleccionada.</p> : <div className="data-scroll"><table className="workspace-table data-table"><thead><tr><th>Persona</th><th>Rol</th><th className="text-right">Horas</th><th className="text-right">Sesiones</th><th className="text-right">Completados</th><th>Estado</th></tr></thead><tbody>{report.usuarios.map((person) => <tr key={person.id}><td data-label="Persona"><strong className="font-medium">{person.nombre}</strong>{person.detalle.length > 0 && <details className="workshop-report-details"><summary>Ver trabajos ({person.detalle.length})</summary><ul>{person.detalle.map((detail, index) => <li key={`${detail.workOrderId}-${index}`}><Link to={`/work-orders?manage=${detail.workOrderId}`}>{detail.workOrderCodigo}</Link> · {detail.itemDescripcion} · {formatMinutes(detail.minutos)}</li>)}</ul></details>}</td><td data-label="Rol">{ROLE_LABELS[person.rol as Role] ?? person.rol}</td><td data-label="Horas" className="text-right">{formatHours(person.horas)}</td><td data-label="Sesiones" className="text-right">{person.sesiones}</td><td data-label="Completados" className="text-right">{person.itemsCompletados}</td><td data-label="Estado"><span className={`status-chip ${person.enCurso ? 'gold' : person.sesiones > 0 ? 'green' : ''}`}>{person.enCurso ? 'En curso' : person.sesiones > 0 ? 'Con actividad' : 'Sin actividad'}</span></td></tr>)}</tbody></table></div>}</section>
      <section className="view-panel"><div className="view-panel-title"><h2>Órdenes con actividad</h2></div>{report.ordenes.length === 0 ? <p className="empty-row">Sin actividad registrada en la fecha seleccionada.</p> : <div className="data-scroll"><table className="workspace-table data-table"><thead><tr><th>OT</th><th>Patente</th><th>Estado</th><th className="text-right">Horas</th><th className="text-right">Completados</th><th>Mecánicos</th><th>Gestión</th></tr></thead><tbody>{report.ordenes.map((order) => { const status = WORK_ORDER_STATUS.find((value) => value === order.estado); return <tr key={order.id}><td data-label="OT">{order.codigo}</td><td data-label="Patente">{order.patente ?? 'Sin patente'}</td><td data-label="Estado">{status ? <WorkOrderStatusBadge status={status} /> : order.estado}</td><td data-label="Horas" className="text-right">{formatHours(order.horas)}</td><td data-label="Completados" className="text-right">{order.completados}</td><td data-label="Mecánicos">{order.mecanicos.join(', ') || 'Sin asignar'}</td><td data-label="Gestión"><Link className="table-action" aria-label={`Gestionar ${order.codigo}`} to={`/work-orders?manage=${order.id}`}>Abrir</Link></td></tr>; })}</tbody></table></div>}</section>
    </>}
  </div>;
};

export default WorkshopDailyReportPage;
