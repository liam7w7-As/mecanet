import { WORK_ORDER_STATUS, WORK_ORDER_STATUS_LABELS } from '@unithor/shared';
import { FileSpreadsheet, FileText, LoaderCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

import {
  useWorkshopCostReport,
  useWorkshopCostReportDownload,
} from '../../hooks/useWorkshopCostReport';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDateTime } from '../../lib/formatters';
import {
  canExportWorkshopCosts,
  canReadWorkshopCosts,
} from '../../lib/workshop-cost-report-access';
import { useAuthStore } from '../../stores/auth.store';

import type { ReportPanelProps } from './ReportPanels';
import type { WorkOrderStatus } from '@unithor/shared';

const hours = (value: number | null): string =>
  value === null
    ? 'Sin estimación'
    : `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(value)} h`;
const cost = (value: number | null): string => (value === null ? 'Sin tarifa' : formatClp(value));

const WorkshopCostReportContent = ({
  from,
  to,
  search,
  searchValue,
  setSearch,
  params,
  setFilter,
}: ReportPanelProps) => {
  const user = useAuthStore((state) => state.user);
  const filters = {
    fechaDesde: from,
    fechaHasta: to,
    search: search || undefined,
    workOrderId: params.get('costOrder') ? Number(params.get('costOrder')) : undefined,
    userId: params.get('costWorker') ? Number(params.get('costWorker')) : undefined,
    specialtyId: params.get('costSpecialty') ? Number(params.get('costSpecialty')) : undefined,
    estado: (params.get('costStatus') || undefined) as WorkOrderStatus | undefined,
  };
  const query = useWorkshopCostReport(filters);
  const download = useWorkshopCostReportDownload();
  const report = query.isError ? undefined : query.data;
  const totals = report?.totals;
  const inputClass = 'mt-1 w-full px-3 text-sm';
  return (
    <section className="min-w-0 space-y-4" aria-label="Costos y horas de mano de obra">
      <div className="report-panel-heading">
        <div>
          <h2>Costos y horas de mano de obra</h2>
          <p>Costos internos por servicio, trabajador y tarifa histórica.</p>
        </div>
        {canExportWorkshopCosts(user) && (
          <div
            className="report-export-actions flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Exportar costos internos"
          >
            {(['excel', 'pdf'] as const).map((format) => {
              const Icon =
                download.isPending && download.variables?.format === format
                  ? LoaderCircle
                  : format === 'excel'
                    ? FileSpreadsheet
                    : FileText;
              return (
                <button
                  key={format}
                  type="button"
                  className="secondary-button"
                  disabled={!query.valid || query.isPending || query.isError || download.isPending}
                  onClick={() => download.download(format, filters)}
                  aria-label={format === 'pdf' ? 'Abrir PDF de costos' : 'Exportar costos a Excel'}
                >
                  <Icon
                    className={`h-4 w-4${download.isPending && download.variables?.format === format ? ' animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  {format === 'pdf' ? 'PDF' : 'Excel'}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="report-filters grid gap-3">
        <label>
          Desde
          <input
            type="date"
            aria-label="Fecha desde"
            value={from}
            max={to}
            onChange={(event) => setFilter('from', event.target.value)}
            className={inputClass}
          />
        </label>
        <label>
          Hasta
          <input
            type="date"
            aria-label="Fecha hasta"
            value={to}
            min={from}
            onChange={(event) => setFilter('to', event.target.value)}
            className={inputClass}
          />
        </label>
        <label>
          Trabajador
          <select
            aria-label="Trabajador de costos"
            value={params.get('costWorker') ?? ''}
            onChange={(event) => setFilter('costWorker', event.target.value)}
            className={inputClass}
          >
            <option value="">Todos, incluidos históricos</option>
            {report?.options.workers.map((worker) => (
              <option key={worker.id} value={worker.id}>
                {worker.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Especialidad
          <select
            aria-label="Especialidad de costos"
            value={params.get('costSpecialty') ?? ''}
            onChange={(event) => setFilter('costSpecialty', event.target.value)}
            className={inputClass}
          >
            <option value="">Todas</option>
            {report?.options.specialties.map((specialty) => (
              <option key={specialty.id} value={specialty.id}>
                {specialty.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Orden de trabajo
          <select
            aria-label="OT de costos"
            value={params.get('costOrder') ?? ''}
            onChange={(event) => setFilter('costOrder', event.target.value)}
            className={inputClass}
          >
            <option value="">Todas las OT</option>
            {report?.options.workOrders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.codigo}
              </option>
            ))}
          </select>
        </label>
        <label>
          Estado OT
          <select
            aria-label="Estado OT de costos"
            value={params.get('costStatus') ?? ''}
            onChange={(event) => setFilter('costStatus', event.target.value)}
            className={inputClass}
          >
            <option value="">Todos</option>
            {WORK_ORDER_STATUS.map((status) => (
              <option key={status} value={status}>
                {WORK_ORDER_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Buscar
          <input
            aria-label="Buscar costos"
            value={searchValue}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="OT, patente, servicio o persona"
            className={inputClass}
          />
        </label>
      </div>
      {!query.valid && (
        <p role="alert" className="text-sm text-brand-coralInk">
          Selecciona un período válido y filtros con identificadores positivos.
        </p>
      )}
      {query.isError && (
        <div role="alert" className="text-sm text-brand-coralInk">
          {getApiErrorMessage(query.error, 'No se pudieron cargar los costos.')}{' '}
          <button type="button" className="table-action" onClick={() => void query.refetch()}>
            Reintentar
          </button>
        </div>
      )}
      {download.isError && (
        <p role="alert" className="text-sm text-brand-coralInk">
          {getApiErrorMessage(download.error, 'No se pudo exportar el reporte.')}
        </p>
      )}
      <p className="text-sm text-brand-muted">
        Uso interno y confidencial · No enviar a clientes. Las horas reales corresponden al período;
        las estimaciones corresponden al equipo vigente.
      </p>
      {query.isPending && query.valid && (
        <p role="status" className="text-sm text-brand-muted">
          Cargando costos y horas…
        </p>
      )}
      {totals && (
        <>
          <div className="report-summary-panel report-table-panel">
            <table>
              <thead>
                <tr>
                  <th>Estimadas</th>
                  <th>Reales</th>
                  <th>Costo estimado</th>
                  <th>Costo real</th>
                  <th>Costo conocido</th>
                  <th>Sin tarifa</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td data-label="Horas estimadas">{hours(totals.estimatedHours)}</td>
                  <td data-label="Horas reales">{hours(totals.actualHours)}</td>
                  <td data-label="Costo estimado">
                    {totals.estimatedCost === null ? 'Incompleto' : formatClp(totals.estimatedCost)}
                  </td>
                  <td data-label="Costo real total">
                    {totals.actualCost === null ? 'Incompleto' : formatClp(totals.actualCost)}
                  </td>
                  <td data-label="Subtotal conocido">{formatClp(totals.knownActualCost)}</td>
                  <td data-label="Filas sin tarifa de costo">{totals.missingCostRateCount}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {(totals.missingCostRateCount > 0 || totals.missingEstimateCount > 0) && (
            <p role="status" className="text-sm text-brand-muted">
              {totals.missingCostRateCount} filas sin tarifa histórica ·{' '}
              {totals.missingEstimateCount} estimaciones pendientes. El subtotal conocido excluye
              los importes desconocidos.
            </p>
          )}
        </>
      )}
      {report && (
        <div className="report-table-panel overflow-hidden rounded-2xl bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
            <h3>Detalle por asignación · {report.rows.length} filas</h3>
            <span className="text-xs text-brand-muted">
              Corte: {formatDateTime(report.generadoEn)}
            </span>
          </div>
          <div className="data-scroll">
            <table className="workspace-table data-table">
              <thead>
                <tr>
                  <th>OT / servicio</th>
                  <th>Trabajador / especialidad</th>
                  <th>Equipo</th>
                  <th className="text-right">H. estimadas</th>
                  <th className="text-right">H. reales</th>
                  <th className="text-right">Costo/h</th>
                  <th className="text-right">Costo estimado</th>
                  <th className="text-right">Costo real</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.key}>
                    <td data-label="OT / servicio">
                      {row.workOrderCodigo}
                      <span className="block text-xs text-brand-muted">
                        {row.descripcion}
                        {row.patente ? ` · ${row.patente}` : ''}
                      </span>
                      {user && ['admin', 'desarrollador', 'jefe'].includes(user.role) && (
                        <Link
                          to={`/work-orders?manage=${row.workOrderId}`}
                          className="table-action text-xs"
                        >
                          Abrir OT
                        </Link>
                      )}
                    </td>
                    <td data-label="Trabajador / especialidad">
                      {row.userName ?? (row.userId ? `Trabajador #${row.userId}` : 'Sin atribuir')}
                      <span className="block text-xs text-brand-muted">
                        {row.specialtyName ?? 'Sin especialidad'}
                      </span>
                    </td>
                    <td data-label="Equipo">
                      <span className="status-chip">
                        {row.assignmentActive === null
                          ? 'Sin vínculo'
                          : row.assignmentActive
                            ? 'Vigente'
                            : 'Histórico'}
                      </span>
                      {row.runningSessions > 0 && (
                        <span className="block text-xs text-brand-muted">En curso</span>
                      )}
                    </td>
                    <td data-label="H. estimadas" className="text-right">
                      {row.includesEstimate ? hours(row.estimatedHours) : '—'}
                    </td>
                    <td data-label="H. reales" className="text-right">
                      {hours(row.actualHours)}
                    </td>
                    <td data-label="Costo/h" className="text-right">
                      {cost(row.costHourly)}
                    </td>
                    <td data-label="Costo estimado" className="text-right">
                      {!row.includesEstimate
                        ? '—'
                        : row.estimatedHours === null
                          ? 'Sin estimación'
                          : cost(row.estimatedCost)}
                    </td>
                    <td data-label="Costo real" className="text-right">
                      {cost(row.actualCost)}
                    </td>
                  </tr>
                ))}
                {report.rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="empty-row">
                      Sin registros para los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};

export default function WorkshopCostReportPanel(props: ReportPanelProps) {
  const user = useAuthStore((state) => state.user);
  return canReadWorkshopCosts(user) ? <WorkshopCostReportContent {...props} /> : null;
}
