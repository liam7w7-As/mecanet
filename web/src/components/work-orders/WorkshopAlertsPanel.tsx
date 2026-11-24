import { BellRing } from 'lucide-react';
import { useEffect, useState } from 'react';

import { visibleWorkshopAlerts, WorkshopAlertList } from './WorkOrderAlertsPanel';
import { useUpdateWorkshopAlertSettingsMutation, useWorkshopAlertSettings, useWorkshopAlerts, validInsightDate, workshopInsightsToday } from '../../hooks/useWorkshopInsights';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatDateTime } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';

interface Props { active?: boolean; initialDate?: string; onState?: (dirty: boolean, pending: boolean) => void }
export default function WorkshopAlertsPanel({ active = true, initialDate, onState }: Props) {
  const user = useAuthStore((state) => state.user);
  const allowed = Boolean(user && ['admin', 'desarrollador', 'jefe', 'mecanico'].includes(user.role) && hasUserPermission(user, 'taller', 'read'));
  const canConfigure = Boolean(user && ['admin', 'desarrollador'].includes(user.role) && hasUserPermission(user, 'taller', 'update'));
  const mechanic = user?.role === 'mecanico';
  const [expanded, setExpanded] = useState(true);
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [date, setDate] = useState(initialDate ?? workshopInsightsToday);
  const [draft, setDraft] = useState<{ time: string; commercial: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = useWorkshopAlerts(date, active && expanded && allowed);
  const settings = useWorkshopAlertSettings(active && expanded && settingsExpanded && allowed);
  const mutation = useUpdateWorkshopAlertSettingsMutation();
  const saved = settings.data;
  const values = draft ?? { time: saved ? String(saved.timeTolerancePercent) : '', commercial: saved ? String(saved.commercialTolerancePercent) : '' };
  const dirty = draft !== null && (!saved || values.time !== String(saved.timeTolerancePercent) || values.commercial !== String(saved.commercialTolerancePercent));
  const valid = [values.time, values.commercial].every((value) => value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1000);
  useEffect(() => onState?.(dirty, mutation.isPending), [onState, dirty, mutation.isPending]);
  useEffect(() => () => onState?.(false, false), [onState]);
  const save = (): void => {
    if (!canConfigure || !active || !expanded || !settingsExpanded || !saved || !dirty || !valid || mutation.isPending) return;
    setError(null);
    mutation.mutate({ timeTolerancePercent: Number(values.time), commercialTolerancePercent: Number(values.commercial) }, {
      onSuccess: () => setDraft(null),
      onError: (failure) => setError(getApiErrorMessage(failure, 'No se pudieron guardar las tolerancias. Tus valores se conservan para reintentar.')),
    });
  };
  if (!allowed) return null;
  const alerts = visibleWorkshopAlerts(query.data, user?.id, mechanic);
  return <details className="workshop-insight-panel" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
    <summary><span><BellRing aria-hidden="true" />{mechanic ? 'Mis alertas del taller' : 'Alertas del taller'}</span><span>{query.data ? `${alerts.length} avisos` : 'Seguimiento operativo'}</span></summary>
    <div className="workshop-insight-body">
      <label>Día de jornada<input type="date" value={date} disabled={!active || mutation.isPending} onChange={(event) => setDate(event.target.value)} /></label>
      {!validInsightDate(date) && <p role="alert">Selecciona una fecha válida para consultar las alertas.</p>}
      {query.isPending && active && expanded && validInsightDate(date) && <p role="status">Consultando alertas del taller…</p>}
      {query.isError && <div className="workshop-labor-error" role="alert"><span>No se pudieron consultar las alertas del taller.</span><button type="button" disabled={!active || !expanded} onClick={() => void query.refetch()}>Reintentar alertas del taller</button></div>}
      {query.data && <WorkshopAlertList summary={query.data} />}
      <details className="workshop-insight-settings" open={settingsExpanded} onToggle={(event) => setSettingsExpanded(event.currentTarget.open)}>
        <summary>Tolerancias de las alertas<span>{canConfigure ? 'Configuración del taller' : 'Solo consulta'}</span></summary>
        <div className="workshop-insight-body">
          <p className="workshop-labor-help">Con 0% se avisa cualquier desviación. La tolerancia de tiempo considera las horas estimadas y el tiempo de jornada sin registrar. La comercial compara con el neto cotizado, sin IVA ni abonos.</p>
          {settings.isPending && settingsExpanded && active && <p role="status">Consultando tolerancias…</p>}
          {settings.isError && <div role="alert" className="workshop-labor-error"><span>No se pudieron cargar las tolerancias.</span><button type="button" disabled={!active || !expanded || !settingsExpanded} onClick={() => void settings.refetch()}>Reintentar tolerancias</button></div>}
          {(saved || draft) && <>
            {canConfigure ? <form className="workshop-insight-filters" onSubmit={(event) => { event.preventDefault(); save(); }}>
              <label>Tolerancia de tiempo (%)<input type="number" min="0" max="1000" step="0.01" value={values.time} disabled={!active || mutation.isPending} onChange={(event) => setDraft({ ...values, time: event.target.value })} /></label>
              <label>Tolerancia comercial (%)<input type="number" min="0" max="1000" step="0.01" value={values.commercial} disabled={!active || mutation.isPending} onChange={(event) => setDraft({ ...values, commercial: event.target.value })} /></label>
              <button type="submit" disabled={!active || !valid || !dirty || mutation.isPending}>{mutation.isPending ? 'Guardando tolerancias…' : 'Guardar tolerancias'}</button>
            </form> : <p>Tolerancia de tiempo: {saved?.timeTolerancePercent ?? 'Sin datos'}%{!mechanic && ` · Tolerancia comercial: ${saved?.commercialTolerancePercent ?? 'Sin datos'}%`}</p>}
            {saved?.updatedAt && <p className="workshop-labor-help">Actualizado {formatDateTime(saved.updatedAt)}</p>}
            {error && <p className="workshop-labor-error" role="alert">{error}</p>}
          </>}
        </div>
      </details>
    </div>
  </details>;
}
