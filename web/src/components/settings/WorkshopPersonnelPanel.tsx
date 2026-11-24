import {
  createSpecialtySchema, updateSpecialtySchema, createSpecialtyRateSchema,
  updateWorkerSpecialtiesSchema, updateWorkshopScheduleSchema, createWorkshopScheduleExceptionSchema, DEFAULT_WORKSHOP_WEEKLY,
} from '@unithor/shared';
import {
  AlertCircle, CalendarClock, CalendarOff, LoaderCircle, Pencil, Plus, Search, Sparkles, Star, UsersRound, Wrench,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import {
  useWorkshopPersonnel, useCreateWorkshopSpecialty, useUpdateWorkshopSpecialty, useSeedWorkshopSpecialties,
  useAppendWorkshopSpecialtyRate, useUpdateWorkerSpecialties, useUpdateWorkshopSchedule, useAppendWorkshopShiftException,
} from '../../hooks/useWorkshopPersonnel';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDate, formatDateTime } from '../../lib/formatters';
import { getRoleLabel, hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';
import { notifyError, notifySuccess } from '../../stores/toast.store';
import FormDialog from '../common/FormDialog';

import type { WorkshopWeeklyDay } from '@unithor/shared';
import type { FormEvent } from 'react';
import type { ZodType } from 'zod';

export interface WorkshopPersonnelPanelProps {
  mode?: 'settings' | 'chief';
  className?: string;
  onState?: (dirty: boolean, pending: boolean) => void;
}

type Dialog =
  | { kind: 'specialty'; id?: number; name: string; active: boolean }
  | { kind: 'rate'; specialtyId: number; validityFrom: string; costHourly: string; saleHourly: string }
  | { kind: 'profile'; userId: number; selectedIds: number[]; principalId: number | null; query: string }
  | { kind: 'schedule'; timezone: string; weekly: WorkshopWeeklyDay[] }
  | { kind: 'exception'; userId: string; date: string; dayOff: boolean; start: string; end: string; reason: string };

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const TITLES = { specialty: 'Especialidad', rate: 'Nueva tarifa', profile: 'Especialidades del trabajador', schedule: 'Horario semanal del taller', exception: 'Excepción de jornada' };
const DIALOG_CLASS = {
  specialty: 'workshop-specialty-dialog', rate: 'workshop-rate-dialog', profile: 'workshop-profile-dialog',
  schedule: 'workshop-schedule-dialog', exception: 'workshop-exception-dialog',
};
const parse = <T,>(schema: ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(result.error.issues.map((issue) => issue.message).join('. '));
  return result.data;
};
const initials = (value: string): string => value.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toLocaleUpperCase('es');
const roleRank = (role: string | null | undefined): number => (role === 'mecanico' ? 0 : 1);

/** Embedded settings/chief workspace panel. The mode affects presentation; authorization always uses the session. */
export function WorkshopPersonnelPanel({ mode = 'settings', className = '', onState }: WorkshopPersonnelPanelProps) {
  const actor = useAuthStore((state) => state.user);
  const canRead = Boolean(actor && ['admin', 'desarrollador', 'jefe'].includes(actor.role) && hasUserPermission(actor, 'taller', 'read'));
  // The chief already owns shifts, so managing specialties and profiles uses the taller module.
  // Specialty prices stay admin-only: they are costing data, not shift data.
  const canManage = Boolean(canRead && actor && ['admin', 'desarrollador', 'jefe'].includes(actor.role) && hasUserPermission(actor, 'taller', 'update'));
  const canPrice = Boolean(canRead && actor && ['admin', 'desarrollador'].includes(actor.role) && hasUserPermission(actor, 'admin', 'update'));
  const canExcept = Boolean(canRead && actor && hasUserPermission(actor, 'taller', 'update'));
  const config = useWorkshopPersonnel(canRead);
  const createSpecialty = useCreateWorkshopSpecialty();
  const updateSpecialty = useUpdateWorkshopSpecialty();
  const seedSpecialties = useSeedWorkshopSpecialties();
  const appendRate = useAppendWorkshopSpecialtyRate();
  const updateProfile = useUpdateWorkerSpecialties();
  const updateSchedule = useUpdateWorkshopSchedule();
  const appendException = useAppendWorkshopShiftException();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [workerScope, setWorkerScope] = useState<'mechanics' | 'all' | null>(null);
  const [workerQuery, setWorkerQuery] = useState('');
  const submitting = useRef(false);
  const panelId = useId();
  const stateListener = useRef(onState);
  stateListener.current = onState;
  const busy = createSpecialty.isPending || updateSpecialty.isPending || seedSpecialties.isPending || appendRate.isPending || updateProfile.isPending || updateSchedule.isPending || appendException.isPending;
  useEffect(() => { stateListener.current?.(dirty, busy); }, [dirty, busy]);
  useEffect(() => () => { stateListener.current?.(false, false); }, []);
  const dialogAllowed = dialog?.kind === 'exception' ? canExcept : dialog?.kind === 'rate' ? canPrice : canManage;
  const open = (value: Dialog) => { setError(''); setDirty(false); setDialog(value); };
  const edit = (value: Dialog) => { setError(''); setDirty(true); setDialog(value); };
  const close = () => { if (!busy) { setDialog(null); setDirty(false); setError(''); } };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dialog || !dialogAllowed || busy || submitting.current) return;
    submitting.current = true;
    setError('');
    try {
      if (dialog.kind === 'specialty') {
        if (dialog.id) await updateSpecialty.mutateAsync({ id: dialog.id, input: parse(updateSpecialtySchema, { name: dialog.name, active: dialog.active }) });
        else await createSpecialty.mutateAsync(parse(createSpecialtySchema, { name: dialog.name }));
      } else if (dialog.kind === 'rate') {
        await appendRate.mutateAsync({ specialtyId: dialog.specialtyId, input: parse(createSpecialtyRateSchema, {
          validityFrom: dialog.validityFrom,
          costHourly: dialog.costHourly.trim() ? Number(dialog.costHourly) : Number.NaN,
          saleHourly: dialog.saleHourly.trim() ? Number(dialog.saleHourly) : Number.NaN,
        }) });
      } else if (dialog.kind === 'profile') {
        await updateProfile.mutateAsync({ userId: dialog.userId, input: parse(updateWorkerSpecialtiesSchema, {
          principalSpecialtyId: dialog.principalId,
          additionalSpecialtyIds: dialog.selectedIds.filter((id) => id !== dialog.principalId),
        }) });
      } else if (dialog.kind === 'schedule') {
        await updateSchedule.mutateAsync(parse(updateWorkshopScheduleSchema, { timezone: dialog.timezone, weekly: dialog.weekly }));
      } else {
        const userId = Number(dialog.userId);
        if (!Number.isInteger(userId) || userId <= 0) throw new Error('Selecciona un trabajador');
        await appendException.mutateAsync({ userId, input: parse(createWorkshopScheduleExceptionSchema, {
          date: dialog.date, dayOff: dialog.dayOff, start: dialog.dayOff ? null : dialog.start,
          end: dialog.dayOff ? null : dialog.end, reason: dialog.reason,
        }) });
      }
      setDialog(null); setDirty(false); notifySuccess('Configuración de personal guardada.');
    } catch (failure) {
      setError(getApiErrorMessage(failure, failure instanceof Error ? failure.message : 'No se pudo guardar.'));
    } finally { submitting.current = false; }
  };

  const seed = async () => {
    if (!canManage || busy || submitting.current) return;
    submitting.current = true;
    try { await seedSpecialties.mutateAsync(); notifySuccess('Especialidades sugeridas agregadas sin tarifas.'); }
    catch (failure) { notifyError(getApiErrorMessage(failure)); }
    finally { submitting.current = false; }
  };

  if (!canRead) return null;
  if (config.isPending) return <div role="status" className="administration-empty"><LoaderCircle className="animate-spin" aria-hidden="true" />Cargando personal del taller…</div>;
  if (config.isError || !config.data) return <div role="alert" className="administration-alert"><AlertCircle aria-hidden="true" />
    {getApiErrorMessage(config.error, 'No se pudo cargar la configuración de personal.')}
    <button type="button" onClick={() => void config.refetch()}>Reintentar</button>
  </div>;

  const data = config.data;
  const specialtyName = (id: number | null) => data.specialties.find((specialty) => specialty.id === id)?.name ?? 'Sin especialidad';
  const workerName = (id: number) => data.workers.find((worker) => worker.id === id)?.nombre ?? `Trabajador #${id}`;
  const workerRole = (id: number) => data.workers.find((worker) => worker.id === id)?.role ?? null;
  const profileOf = (userId: number) => data.profiles.find((row) => row.userId === userId);
  const ratesOf = (specialtyId: number) => data.rates.filter((rate) => rate.specialtyId === specialtyId)
    .sort((left, right) => right.validityFrom.localeCompare(left.validityFrom));
  const latestExceptions = new Map<string, number>();
  for (const exception of data.exceptions) {
    const key = `${exception.userId}:${exception.date}`;
    latestExceptions.set(key, Math.max(latestExceptions.get(key) ?? 0, exception.version));
  }

  const hasMechanics = data.workers.some((worker) => worker.role === 'mecanico');
  const scope = workerScope ?? (hasMechanics ? 'mechanics' : 'all');
  const normalizedQuery = workerQuery.trim().toLocaleLowerCase('es');
  const visibleWorkers = [...data.workers]
    .sort((left, right) => roleRank(left.role) - roleRank(right.role) || Number(right.activo) - Number(left.activo) || left.nombre.localeCompare(right.nombre, 'es'))
    .filter((worker) => (scope === 'all' || (worker.role === 'mecanico' && worker.activo)))
    .filter((worker) => !normalizedQuery || worker.nombre.toLocaleLowerCase('es').includes(normalizedQuery));
  const assignedWorkers = data.workers.filter((worker) => profileOf(worker.id)?.principalSpecialtyId != null).length;

  const profileDialog = dialog?.kind === 'profile' ? dialog : null;
  const profileQuery = profileDialog?.query.trim().toLocaleLowerCase('es') ?? '';
  const profileSpecialties = profileDialog ? data.specialties
    .filter((specialty) => (specialty.active || profileDialog.selectedIds.includes(specialty.id))
      && (!profileQuery || specialty.name.toLocaleLowerCase('es').includes(profileQuery)))
    .sort((left, right) => {
      const rank = (specialty: { id: number }) => (profileDialog.principalId === specialty.id ? 0 : profileDialog.selectedIds.includes(specialty.id) ? 1 : 2);
      return rank(left) - rank(right) || left.name.localeCompare(right.name, 'es');
    }) : [];
  const principalName = profileDialog?.principalId ? specialtyName(profileDialog.principalId) : null;
  const dialogContext = !dialog ? ''
    : dialog.kind === 'profile'
      ? `${workerName(dialog.userId)}${workerRole(dialog.userId) ? ` · ${getRoleLabel(workerRole(dialog.userId)!)}` : ''}`
      : dialog.kind === 'rate'
        ? specialtyName(dialog.specialtyId)
        : dialog.kind === 'schedule'
          ? data.schedule.timezone
          : dialog.kind === 'exception'
            ? (Number(dialog.userId) > 0 ? workerName(Number(dialog.userId)) : 'Nueva excepción')
            : 'Catálogo';

  const toggleProfileSpecialty = (specialtyId: number, assigned: boolean) => {
    if (!profileDialog) return;
    if (assigned) {
      const selectedIds = profileDialog.selectedIds.includes(specialtyId) ? profileDialog.selectedIds : [...profileDialog.selectedIds, specialtyId];
      edit({ ...profileDialog, selectedIds, principalId: profileDialog.principalId ?? specialtyId });
    } else {
      const selectedIds = profileDialog.selectedIds.filter((id) => id !== specialtyId);
      edit({ ...profileDialog, selectedIds, principalId: profileDialog.principalId === specialtyId ? selectedIds[0] ?? null : profileDialog.principalId });
    }
  };
  const setProfileQuery = (query: string) => {
    if (profileDialog) setDialog({ ...profileDialog, query });
  };
  const setProfilePrincipal = (specialtyId: number) => {
    if (profileDialog) edit({ ...profileDialog, principalId: specialtyId });
  };

  const scheduleActions = canManage && mode === 'settings' ? (
    <button type="button" className="administration-secondary" disabled={busy}
      onClick={() => open({ kind: 'schedule', timezone: data.schedule.timezone, weekly: data.schedule.weekly.map((day) => ({ ...day })) })}>
      <CalendarClock aria-hidden="true" />Configurar horario</button>
  ) : null;

  return <section className={`administration-page administration-settings-panel workshop-personnel-panel ${mode === 'chief' ? 'is-chief' : ''} ${className}`} aria-labelledby={`${panelId}-title`}>
    <header className="administration-panel-heading"><UsersRound aria-hidden="true" /><div>
      <h2 id={`${panelId}-title`}>Personal y jornadas del taller</h2>
      <p>{mode === 'chief' ? 'Horario vigente y excepciones del equipo.' : 'Especialidades, tarifas en CLP y jornadas por trabajador.'}</p>
    </div></header>
    {mode === 'settings' && !canManage && <p className="administration-notice">La configuración general es de solo lectura. {canExcept ? 'Puedes registrar excepciones de jornada con motivo.' : ''}</p>}

    <div className="workshop-personnel-body">
      <section className="workshop-personnel-card" aria-labelledby={`${panelId}-schedule`}>
        <header className="workshop-personnel-card-head">
          <div className="workshop-personnel-card-heading">
            <span className="workshop-personnel-icon"><CalendarClock aria-hidden="true" /></span>
            <div><h3 id={`${panelId}-schedule`}>Horario semanal del taller</h3><p>Zona horaria: {data.schedule.timezone}</p></div>
          </div>
          {scheduleActions}
        </header>
        {data.schedule.weekly.length === 0
          ? <p className="workshop-personnel-empty-note" role="status">Horario sin configurar. No se presupone una jornada ni una duración.</p>
          : <div className="workshop-schedule-grid">
            {[...data.schedule.weekly].sort((left, right) => left.weekday - right.weekday).map((day) =>
              <div key={day.weekday} className="workshop-schedule-day">
                <span>{DAYS[day.weekday]}</span>
                <strong className="workshop-schedule-hours">{day.start} – {day.end}</strong>
                {day.breakStart && day.breakEnd
                  ? <small className="workshop-schedule-lunch">Almuerzo {day.breakStart} – {day.breakEnd}</small>
                  : <small className="workshop-schedule-lunch">Sin almuerzo</small>}
              </div>)}
          </div>}
        <p className="workshop-personnel-note">Los cronómetros se pausan al almuerzo y al cierre. Después del almuerzo se reanudan desde el servicio.</p>
      </section>

      {mode === 'settings' && <section className="workshop-personnel-card" aria-labelledby={`${panelId}-catalog`}>
        <header className="workshop-personnel-card-head">
          <div className="workshop-personnel-card-heading">
            <span className="workshop-personnel-icon"><Wrench aria-hidden="true" /></span>
            <div><h3 id={`${panelId}-catalog`}>Catálogo de especialidades <span className="workshop-personnel-count">{data.specialties.length}</span></h3></div>
          </div>
          {canManage && <div className="workshop-personnel-actions">
            <button type="button" className="administration-primary" disabled={busy} onClick={() => open({ kind: 'specialty', name: '', active: true })}><Plus aria-hidden="true" />Nueva especialidad</button>
            <button type="button" className="administration-secondary" disabled={busy} onClick={() => void seed()} aria-label="Agregar especialidades sugeridas"><Sparkles aria-hidden="true" />Agregar sugeridas</button>
          </div>}
        </header>
        {data.specialties.length === 0
          ? <div className="workshop-personnel-empty"><Wrench aria-hidden="true" /><strong>No hay especialidades configuradas.</strong></div>
          : <ul className="workshop-specialty-list">
            {data.specialties.map((specialty) => {
              const rates = ratesOf(specialty.id);
              const latest = rates[0];
              return <li key={specialty.id}>
                <div className="workshop-specialty-row">
                  <div className="workshop-specialty-info">
                    <span className="workshop-specialty-title">{specialty.name}
                      {!specialty.active && <span className="workshop-badge is-off">Inactiva</span>}
                    </span>
                    {canPrice && <span className="workshop-specialty-meta">{latest
                      ? `Costo ${formatClp(latest.costHourly, 2)} · Venta ${formatClp(latest.saleHourly, 2)} por hora · vigente desde ${formatDate(latest.validityFrom)}`
                      : 'Sin tarifa configurada'}</span>}
                  </div>
                  {(canManage || canPrice) && <div className="workshop-personnel-actions">
                    {canManage && <button type="button" className="administration-secondary" disabled={busy} aria-label={`Editar ${specialty.name}`}
                      onClick={() => open({ kind: 'specialty', id: specialty.id, name: specialty.name, active: specialty.active })}><Pencil aria-hidden="true" />Editar</button>}
                    {canPrice && <button type="button" className="administration-secondary" disabled={busy || !specialty.active} aria-label={`Nueva tarifa de ${specialty.name}`}
                      onClick={() => open({ kind: 'rate', specialtyId: specialty.id, validityFrom: '', costHourly: '', saleHourly: '' })}><Plus aria-hidden="true" />Nueva tarifa</button>}
                  </div>}
                </div>
                {canPrice && rates.length > 1 && <details className="workshop-rate-history">
                  <summary>Historial de tarifas ({rates.length})</summary>
                  <table className="workshop-rate-table">
                    <caption className="sr-only">Historial de tarifas de {specialty.name}</caption>
                    <thead><tr><th scope="col">Vigente desde</th><th scope="col">Costo por hora</th><th scope="col">Venta por hora</th></tr></thead>
                    <tbody>{rates.map((rate) => <tr key={rate.id}>
                      <td>{formatDate(rate.validityFrom)}</td><td>{formatClp(rate.costHourly, 2)}</td><td>{formatClp(rate.saleHourly, 2)}</td>
                    </tr>)}</tbody>
                  </table>
                </details>}
              </li>;
            })}
          </ul>}
        {canManage && !canPrice && <p className="workshop-personnel-note">Las tarifas por hora las administra el área de administración.</p>}
      </section>}

      {mode === 'settings' && <section className="workshop-personnel-card" aria-labelledby={`${panelId}-team`}>
        <header className="workshop-personnel-card-head">
          <div className="workshop-personnel-card-heading">
            <span className="workshop-personnel-icon"><UsersRound aria-hidden="true" /></span>
            <div><h3 id={`${panelId}-team`}>Equipo y especialidades</h3><p>{assignedWorkers} de {data.workers.length} con especialidad principal asignada.</p></div>
          </div>
        </header>
        <div className="workshop-team-toolbar">
          <div className="workshop-team-search">
            <Search aria-hidden="true" />
            <input value={workerQuery} onChange={(event) => setWorkerQuery(event.target.value)} placeholder="Buscar trabajador" aria-label="Buscar trabajador" />
          </div>
          <div className="workshop-filter-pills" role="group" aria-label="Filtrar trabajadores">
            <button type="button" aria-pressed={scope === 'mechanics'} onClick={() => setWorkerScope('mechanics')}>Mecánicos</button>
            <button type="button" aria-pressed={scope === 'all'} onClick={() => setWorkerScope('all')}>Todos</button>
          </div>
        </div>
        {visibleWorkers.length === 0
          ? <p className="workshop-personnel-empty-note" role="status">{normalizedQuery ? 'Ningún trabajador coincide con la búsqueda.' : scope === 'mechanics' ? 'No hay mecánicos activos. Cambia a «Todos» para ver el resto del equipo.' : 'No hay trabajadores registrados.'}</p>
          : <ul className="workshop-worker-list">
            {visibleWorkers.map((worker) => {
              const profile = profileOf(worker.id);
              const additional = profile?.additionalSpecialtyIds ?? [];
              return <li key={worker.id} className="workshop-worker-row">
                <span className="workshop-worker-avatar" aria-hidden="true">{initials(worker.nombre)}</span>
                <div className="workshop-worker-identity">
                  <strong>{worker.nombre}</strong>
                  <small>{worker.role ? getRoleLabel(worker.role) : 'Usuario'}{!worker.activo ? ' · Inactivo' : ''}</small>
                </div>
                <div className="workshop-worker-specialties">
                  {profile?.principalSpecialtyId
                    ? <span className="workshop-badge is-principal"><Star aria-hidden="true" />{specialtyName(profile.principalSpecialtyId)}</span>
                    : <span className="workshop-worker-empty">Sin especialidad asignada</span>}
                  {additional.map((id) => <span key={id} className="workshop-badge is-muted">{specialtyName(id)}</span>)}
                </div>
                {canManage && <div className="workshop-personnel-actions">
                  <button type="button" className="administration-secondary" disabled={busy || !worker.activo}
                    aria-label={`Editar perfil de ${worker.nombre}`}
                    onClick={() => {
                      const principalId = profile?.principalSpecialtyId ?? null;
                      const selectedIds = principalId ? [principalId, ...additional] : [...additional];
                      open({ kind: 'profile', userId: worker.id, selectedIds, principalId: principalId ?? selectedIds[0] ?? null, query: '' });
                    }}>
                    <Pencil aria-hidden="true" />Asignar
                  </button>
                </div>}
              </li>;
            })}
          </ul>}
      </section>}

      <section className="workshop-personnel-card" aria-labelledby={`${panelId}-exceptions`}>
        <header className="workshop-personnel-card-head">
          <div className="workshop-personnel-card-heading">
            <span className="workshop-personnel-icon"><CalendarOff aria-hidden="true" /></span>
            <div><h3 id={`${panelId}-exceptions`}>Excepciones de jornada</h3></div>
          </div>
          {canExcept && <div className="workshop-personnel-actions">
            <button type="button" className="administration-primary" disabled={busy}
              onClick={() => open({ kind: 'exception', userId: '', date: '', dayOff: false, start: '', end: '', reason: '' })}><Plus aria-hidden="true" />Registrar excepción</button>
          </div>}
        </header>
        {!data.exceptions.length
          ? <p className="workshop-personnel-empty-note" role="status">No hay excepciones registradas.</p>
          : <ul className="workshop-exception-list">
            {data.exceptions.map((exception) => <li key={exception.id} className="workshop-exception-row">
              <div className="workshop-exception-main">
                <div className="workshop-exception-heading">
                  <strong>{workerName(exception.userId)}</strong>
                  <span className="workshop-badge is-muted">{formatDate(exception.date)}</span>
                  <span className={exception.dayOff ? 'workshop-badge is-off' : 'workshop-badge'}>{exception.dayOff ? 'Día libre' : `${exception.start} – ${exception.end}`}</span>
                  <span className="workshop-badge is-muted">v{exception.version} {latestExceptions.get(`${exception.userId}:${exception.date}`) === exception.version ? 'Vigente' : 'Histórica'}</span>
                </div>
                <p className="workshop-exception-reason">{exception.reason}</p>
                <small>{formatDateTime(exception.createdAt)} · {exception.createdBy ? workerName(exception.createdBy) : 'Sin autor'}</small>
              </div>
              {canExcept && <div className="workshop-personnel-actions">
                <button type="button" className="administration-secondary" disabled={busy || !data.workers.some((worker) => worker.id === exception.userId && worker.activo)}
                  onClick={() => open({ kind: 'exception', userId: String(exception.userId), date: exception.date,
                    dayOff: exception.dayOff, start: exception.start ?? '', end: exception.end ?? '', reason: '' })}>Nueva versión</button>
              </div>}
            </li>)}
          </ul>}
      </section>
    </div>

    {dialog && <FormDialog id={`${panelId}-dialog`} title={dialog.kind === 'specialty' && dialog.id ? 'Editar especialidad' : TITLES[dialog.kind]} code="Personal del taller"
      context={dialogContext}
      submitLabel={dialog.kind === 'rate' || dialog.kind === 'exception' ? 'Registrar nueva versión' : 'Guardar cambios'} dirty={dirty} pending={busy}
      onClose={close} onSubmit={(event) => void submit(event)} submitDisabled={!dialogAllowed} headerVariant="plain"
      className={`administration-form reference-form-dialog settings-reference-dialog workshop-personnel-dialog ${DIALOG_CLASS[dialog.kind]}`}>
      {error && <p role="alert" className="administration-alert">{error}</p>}
      {!dialogAllowed && <p role="status" className="administration-notice">No tienes permiso para guardar estos cambios.</p>}
      {dialog.kind === 'profile' && <>
        <div className="workshop-profile-summary">
          <div>
            <span>Especialidad principal</span>
            <strong>{principalName ?? 'Sin asignar'}</strong>
          </div>
          <span className="workshop-badge is-muted">{dialog.selectedIds.length} asignada{dialog.selectedIds.length === 1 ? '' : 's'}</span>
        </div>
        <div className="workshop-team-search workshop-profile-search">
          <Search aria-hidden="true" />
          <input value={dialog.query} onChange={(event) => setProfileQuery(event.target.value)} placeholder="Buscar especialidad" aria-label="Buscar especialidad" />
        </div>
        <div className="workshop-specialty-matrix">
          <div className="workshop-specialty-matrix-head" aria-hidden="true"><span>Especialidad</span><span>Asignar</span><span>Principal</span></div>
          {profileSpecialties.length === 0
            ? <p className="workshop-matrix-empty" role="status">{dialog.query ? 'Ninguna especialidad coincide con la búsqueda.' : 'Todavía no hay especialidades disponibles. Crea una en el catálogo.'}</p>
            : <ul>{profileSpecialties.map((specialty) => {
              const assigned = dialog.selectedIds.includes(specialty.id);
              return <li key={specialty.id} className={`workshop-specialty-option ${assigned ? 'is-assigned' : ''} ${specialty.active ? '' : 'is-inactive'}`}>
                <span className="workshop-specialty-option-name">{specialty.name}{!specialty.active && <span className="workshop-badge is-off">Inactiva</span>}</span>
                <label className="workshop-option-control">
                  <input type="checkbox" checked={assigned} onChange={(event) => toggleProfileSpecialty(specialty.id, event.target.checked)} aria-label={`Asignar ${specialty.name}`} />
                </label>
                <label className="workshop-option-control">
                  <input type="radio" name={`${panelId}-principal`} checked={dialog.principalId === specialty.id} disabled={!assigned}
                    onChange={() => setProfilePrincipal(specialty.id)} aria-label={`Principal ${specialty.name}`} />
                </label>
              </li>;
            })}</ul>}
        </div>
      </>}
      {dialog.kind !== 'profile' && <fieldset disabled={!dialogAllowed} className="administration-form-grid">
        {dialog.kind === 'specialty' && <>
          <label className="administration-wide"><span>Nombre de especialidad</span><input value={dialog.name} maxLength={100} onChange={(event) => edit({ ...dialog, name: event.target.value })} /></label>
          {dialog.id && <label className="workshop-inline-check"><input type="checkbox" checked={dialog.active} onChange={(event) => edit({ ...dialog, active: event.target.checked })} /><span>Especialidad activa</span></label>}
        </>}
        {dialog.kind === 'rate' && <>
          <p className="administration-wide workshop-dialog-note">{specialtyName(dialog.specialtyId)}. Se agregará una vigencia posterior a la última tarifa; las anteriores se conservan.</p>
          <label><span>Vigente desde</span><input type="date" value={dialog.validityFrom} onChange={(event) => edit({ ...dialog, validityFrom: event.target.value })} /></label>
          <label><span>Costo por hora (CLP)</span><input type="number" min="0" step="0.01" value={dialog.costHourly} onChange={(event) => edit({ ...dialog, costHourly: event.target.value })} /></label>
          <label><span>Venta por hora (CLP)</span><input type="number" min="0" step="0.01" value={dialog.saleHourly} onChange={(event) => edit({ ...dialog, saleHourly: event.target.value })} /></label>
        </>}
        {dialog.kind === 'schedule' && <>
          <label className="administration-wide"><span>Zona horaria IANA</span><input value={dialog.timezone} placeholder="America/Santiago" onChange={(event) => edit({ ...dialog, timezone: event.target.value })} /></label>
          <button type="button" className="administration-secondary administration-wide" onClick={() => edit({ ...dialog, weekly: DEFAULT_WORKSHOP_WEEKLY.map((day) => ({ ...day })) })}>Usar jornada de lunes a viernes y sábado</button>
          {DAYS.map((name, weekday) => {
            const day = dialog.weekly.find((entry) => entry.weekday === weekday);
            return <fieldset key={weekday} className="workshop-schedule-form-row"><legend className="sr-only">{name}</legend>
              <label className="workshop-inline-check"><input type="checkbox" checked={Boolean(day)} onChange={(event) => edit({ ...dialog, weekly: event.target.checked ? [...dialog.weekly, { weekday, start: '', end: '' }] : dialog.weekly.filter((entry) => entry.weekday !== weekday) })} /><span>{name}</span></label>
              {day && <div className="workshop-schedule-form-times">
                <label><span>Entrada {name}</span><input type="time" value={day.start} onChange={(event) => edit({ ...dialog, weekly: dialog.weekly.map((entry) => entry.weekday === weekday ? { ...entry, start: event.target.value } : entry) })} /></label>
                <label><span>Salida {name}</span><input type="time" value={day.end} onChange={(event) => edit({ ...dialog, weekly: dialog.weekly.map((entry) => entry.weekday === weekday ? { ...entry, end: event.target.value } : entry) })} /></label>
                <label className="workshop-inline-check"><input type="checkbox" checked={Boolean(day.breakStart || day.breakEnd)} onChange={(event) => edit({ ...dialog, weekly: dialog.weekly.map((entry) => {
                  if (entry.weekday !== weekday) return entry;
                  if (event.target.checked) return { ...entry, breakStart: '13:00', breakEnd: '14:00' };
                  const { breakStart: _start, breakEnd: _end, ...continuous } = entry;
                  return continuous;
                }) })} /><span>Almuerzo {name}</span></label>
                {(day.breakStart || day.breakEnd) && <>
                  <label><span>Inicio almuerzo {name}</span><input type="time" value={day.breakStart ?? ''} onChange={(event) => edit({ ...dialog, weekly: dialog.weekly.map((entry) => entry.weekday === weekday ? { ...entry, breakStart: event.target.value } : entry) })} /></label>
                  <label><span>Fin almuerzo {name}</span><input type="time" value={day.breakEnd ?? ''} onChange={(event) => edit({ ...dialog, weekly: dialog.weekly.map((entry) => entry.weekday === weekday ? { ...entry, breakEnd: event.target.value } : entry) })} /></label>
                </>}
              </div>}
            </fieldset>;
          })}
        </>}
        {dialog.kind === 'exception' && <>
          <label><span>Trabajador</span><select value={dialog.userId} onChange={(event) => edit({ ...dialog, userId: event.target.value })}><option value="">Selecciona un trabajador</option>{data.workers.filter((worker) => worker.activo).map((worker) => <option key={worker.id} value={worker.id}>{worker.nombre}</option>)}</select></label>
          <label><span>Fecha de jornada</span><input type="date" value={dialog.date} onChange={(event) => edit({ ...dialog, date: event.target.value })} /></label>
          <label className="administration-wide workshop-inline-check"><input type="checkbox" checked={dialog.dayOff} onChange={(event) => edit({ ...dialog, dayOff: event.target.checked })} /><span>Día libre</span></label>
          {!dialog.dayOff && <>
            <label><span>Entrada excepcional</span><input type="time" value={dialog.start} onChange={(event) => edit({ ...dialog, start: event.target.value })} /></label>
            <label><span>Salida excepcional</span><input type="time" value={dialog.end} onChange={(event) => edit({ ...dialog, end: event.target.value })} /></label>
          </>}
          <label className="administration-wide"><span>Motivo obligatorio</span><textarea value={dialog.reason} maxLength={1000} rows={3} onChange={(event) => edit({ ...dialog, reason: event.target.value })} /></label>
          {dialog.userId && dialog.date && <p className="administration-wide workshop-dialog-note">Se registrará la versión {(latestExceptions.get(`${dialog.userId}:${dialog.date}`) ?? 0) + 1}. El historial anterior se conserva.</p>}
        </>}
      </fieldset>}
    </FormDialog>}
  </section>;
}

export default WorkshopPersonnelPanel;
