import { useMemo, useState } from 'react';

import { useWorkOrderWorksheet } from '../../hooks/useWorkOrderLabor';
import { formatDate, formatDateTime } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { formatWorkshopMinutes } from '../../lib/workshop-time-format';
import { useAuthStore } from '../../stores/auth.store';

import type {
  WorkOrder,
  WorkOrderWorksheet,
  WorkOrderWorksheetObservationFile,
} from '../../types/entities';

import './work-order-execution-history.css';

export interface WorkOrderExecutionHistoryProps {
  workOrder: WorkOrder;
  active?: boolean;
}

type HistoryType = 'session' | 'observation' | 'report';
interface HistoryEntry {
  key: string;
  type: HistoryType;
  timestamp: string;
  author: string;
  service: string | null;
  label: string;
  text: string | null;
  minutes?: number;
  blockers?: string | null;
  files?: WorkOrderWorksheetObservationFile[];
}

const filters = [
  ['all', 'Todo'],
  ['session', 'Sesiones'],
  ['observation', 'Observaciones'],
  ['report', 'Reportes'],
] as const;

const timestampValue = (value: string): number => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
};

const historyEntries = (worksheet: WorkOrderWorksheet | undefined): HistoryEntry[] => {
  if (!worksheet) return [];
  const sessions: HistoryEntry[] = worksheet.servicios.flatMap((item) =>
    (item.sessions ?? []).map((session) => ({
      key: `session-${item.id}-${session.id}`,
      type: 'session',
      timestamp: session.endedAt ?? session.startedAt,
      author: session.userName ?? 'Taller',
      service: item.descripcion,
      label:
        session.endedAt === null
          ? 'Cronómetro en curso'
          : session.kind === 'manual'
            ? 'Registro manual'
            : session.kind === 'ajuste'
              ? 'Ajuste'
              : 'Cronómetro',
      text: session.note,
      minutes: session.minutes,
    })),
  );
  const observations: HistoryEntry[] = worksheet.observations.map((observation) => ({
    key: `observation-${observation.id}`,
    type: 'observation',
    timestamp: observation.createdAt,
    author: observation.authorName ?? 'Taller',
    service: observation.itemDescripcion,
    label: 'Observación',
    text: observation.texto,
    files: observation.files,
  }));
  const reports: HistoryEntry[] = worksheet.progressReports.map((report) => ({
    key: `report-${report.id}`,
    type: 'report',
    timestamp: report.createdAt,
    author: report.mechanic?.nombre ?? 'Taller',
    service: null,
    label: `Reporte de avance · ${report.porcentaje}%`,
    text: report.comentario,
    blockers: report.bloqueos,
  }));
  // The worksheet dates are the event dates; order updates are not history events.
  return [...sessions, ...observations, ...reports].sort(
    (a, b) => timestampValue(b.timestamp) - timestampValue(a.timestamp),
  );
};

interface SessionSummary {
  date: string;
  author: string;
  service: string;
  sessions: number;
  minutes: number;
}

const localDay = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
};

const sessionSummary = (worksheet: WorkOrderWorksheet | undefined): SessionSummary[] => {
  if (!worksheet) return [];
  const summaries = new Map<string, SessionSummary>();
  for (const item of worksheet.servicios) {
    for (const session of item.sessions ?? []) {
      const date = localDay(session.startedAt);
      if (!date) continue;
      const author = session.userName ?? 'Taller';
      const key = `${date}|${author}|${item.descripcion}`;
      const current = summaries.get(key) ?? {
        date,
        author,
        service: item.descripcion,
        sessions: 0,
        minutes: 0,
      };
      current.sessions += 1;
      current.minutes += session.minutes;
      summaries.set(key, current);
    }
  }
  return [...summaries.values()].sort((a, b) => b.date.localeCompare(a.date)
    || a.author.localeCompare(b.author)
    || a.service.localeCompare(b.service));
};

export default function WorkOrderExecutionHistory({
  workOrder,
  active = true,
}: WorkOrderExecutionHistoryProps) {
  const user = useAuthStore((state) => state.user);
  const allowed = Boolean(
    user &&
    ['admin', 'desarrollador', 'jefe', 'mecanico'].includes(user.role) &&
    hasUserPermission(user, 'taller', 'read'),
  );
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<'all' | HistoryType>('all');
  const [visibleCount, setVisibleCount] = useState(10);
  const query = useWorkOrderWorksheet(workOrder.id, active && expanded && allowed);
  const entries = useMemo(() => historyEntries(query.data), [query.data]);
  const summaries = useMemo(() => sessionSummary(query.data), [query.data]);
  const filtered = filter === 'all' ? entries : entries.filter((entry) => entry.type === filter);

  if (!allowed) return null;

  return (
    <details
      className="workshop-labor-details workshop-execution-history"
      hidden={!active}
      open={expanded}
    >
      <summary
        onClick={(event) => {
          event.preventDefault();
          setExpanded((current) => !current);
        }}
      >
        Historial de trabajo<span>{entries.length} {entries.length === 1 ? 'registro' : 'registros'}</span>
      </summary>
      <div className="workshop-labor-detail-body">
        <p className="workshop-labor-help">Se actualiza con las sesiones, observaciones y avances guardados en esta orden.</p>
        {summaries.length > 0 && (
          <details className="workshop-labor-details" open>
            <summary>
              Resumen por día, empleado y servicio
              <span>{summaries.length} {summaries.length === 1 ? 'grupo' : 'grupos'}</span>
            </summary>
            <div className="data-scroll">
              <table className="workspace-table data-table">
                <thead>
                  <tr>
                    <th>Día</th>
                    <th>Empleado</th>
                    <th>Servicio</th>
                    <th className="text-right">Sesiones</th>
                    <th className="text-right">Horas</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.map((summary) => (
                    <tr key={`${summary.date}-${summary.author}-${summary.service}`}>
                      <td data-label="Día">{formatDate(summary.date)}</td>
                      <td data-label="Empleado">{summary.author}</td>
                      <td data-label="Servicio">{summary.service}</td>
                      <td data-label="Sesiones" className="text-right">{summary.sessions}</td>
                      <td data-label="Horas" className="text-right">{formatWorkshopMinutes(summary.minutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
        <div
          className="workshop-execution-history-filters"
          role="group"
          aria-label="Filtrar historial de trabajo"
        >
          {filters.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => {
                setFilter(value);
                setVisibleCount(10);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {query.isFetching && (
          <p role="status">{query.data ? 'Actualizando historial…' : 'Cargando historial…'}</p>
        )}
        {query.isError && (
          <div className="workshop-labor-error" role="alert">
            <span>No se pudo actualizar el historial. Los registros disponibles se conservan.</span>
            <button
              type="button"
              disabled={!active || !expanded || query.isFetching}
              onClick={() => {
                void query.refetch();
              }}
            >
              Reintentar
            </button>
          </div>
        )}
        {query.data && filtered.length === 0 && (
          <p>Sin registros{filter === 'all' ? ' de trabajo' : ' en este filtro'}.</p>
        )}
        {filtered.length > 0 && (
          <ol
            className="workshop-execution-history-list"
            aria-label="Registros del historial de trabajo"
          >
            {filtered.slice(0, visibleCount).map((entry) => (
              <li key={entry.key}>
                <div className="workshop-execution-history-meta">
                  <span className="workshop-execution-history-pill">{entry.label}</span>
                  {Number.isFinite(Date.parse(entry.timestamp)) ? (
                    <time dateTime={entry.timestamp}>{formatDateTime(entry.timestamp)}</time>
                  ) : (
                    <span>Sin fecha</span>
                  )}
                </div>
                {entry.service && <strong>{entry.service}</strong>}
                <p>
                  {entry.author}
                  {entry.minutes !== undefined && (
                    <>
                      {' '}
                      · <strong>{formatWorkshopMinutes(entry.minutes)}</strong>
                    </>
                  )}
                </p>
                {entry.text && <p className="workshop-execution-history-text">{entry.text}</p>}
                {entry.blockers && (
                  <p className="workshop-execution-history-text">Bloqueos: {entry.blockers}</p>
                )}
                {Boolean(entry.files?.length) && (
                  <div className="workshop-execution-history-files">
                    {entry.files?.map((file) => (
                      <a key={file.id} href={file.url} target="_blank" rel="noopener noreferrer">
                        {file.nombreOriginal}
                      </a>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
        {filtered.length > visibleCount && (
          <button
            className="workshop-execution-history-more"
            type="button"
            onClick={() => setVisibleCount((count) => count + 10)}
          >
            Ver más ({filtered.length - visibleCount})
          </button>
        )}
      </div>
    </details>
  );
}
