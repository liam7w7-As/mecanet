import {
  createSpecialtySchema, updateSpecialtySchema, createSpecialtyRateSchema,
  updateWorkerSpecialtiesSchema, updateWorkshopScheduleSchema, createWorkshopScheduleExceptionSchema,
} from '@unithor/shared';
import { AlertCircle, CalendarClock, LoaderCircle, Plus, UsersRound, Wrench } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import {
  useWorkshopPersonnel, useCreateWorkshopSpecialty, useUpdateWorkshopSpecialty, useSeedWorkshopSpecialties,
  useAppendWorkshopSpecialtyRate, useUpdateWorkerSpecialties, useUpdateWorkshopSchedule, useAppendWorkshopShiftException,
} from '../../hooks/useWorkshopPersonnel';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDate, formatDateTime } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
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
  | { kind: 'profile'; userId: number; principalSpecialtyId: string; additionalSpecialtyIds: number[] }
  | { kind: 'schedule'; timezone: string; weekly: WorkshopWeeklyDay[] }
  | { kind: 'exception'; userId: string; date: string; dayOff: boolean; start: string; end: string; reason: string };

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const TITLES = { specialty: 'Especialidad', rate: 'Nueva tarifa', profile: 'Especialidades del trabajador', schedule: 'Horario semanal del taller', exception: 'Excepción de jornada' };
const parse = <T,>(schema: ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(result.error.issues.map((issue) => issue.message).join('. '));
  return result.data;
};

/** Embedded settings/chief workspace panel. The mode affects presentation; authorization always uses the session. */
export function WorkshopPersonnelPanel({ mode = 'settings', className = '', onState }: WorkshopPersonnelPanelProps) {
  const actor = useAuthStore((state) => state.user);
  const canRead = Boolean(actor && ['admin', 'desarrollador', 'jefe'].includes(actor.role) && hasUserPermission(actor, 'taller', 'read'));
  const canConfigure = Boolean(canRead && actor && ['admin', 'desarrollador'].includes(actor.role) && hasUserPermission(actor, 'admin', 'update'));
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
  const submitting = useRef(false);
  const panelId = useId();
  const stateListener = useRef(onState);
  stateListener.current = onState;
  const busy = createSpecialty.isPending || updateSpecialty.isPending || seedSpecialties.isPending || appendRate.isPending || updateProfile.isPending || updateSchedule.isPending || appendException.isPending;
  useEffect(() => { stateListener.current?.(dirty, busy); }, [dirty, busy]);
  useEffect(() => () => { stateListener.current?.(false, false); }, []);
  const dialogAllowed = dialog?.kind === 'exception' ? canExcept : canConfigure;
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
          principalSpecialtyId: dialog.principalSpecialtyId ? Number(dialog.principalSpecialtyId) : null,
          additionalSpecialtyIds: dialog.additionalSpecialtyIds,
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
    if (!canConfigure || busy || submitting.current) return;
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
  const latestExceptions = new Map<string, number>();
  for (const exception of data.exceptions) {
    const key = `${exception.userId}:${exception.date}`;
    latestExceptions.set(key, Math.max(latestExceptions.get(key) ?? 0, exception.version));
  }

  return <section className={`administration-page administration-settings-panel ${className}`} aria-labelledby={`${panelId}-title`}>
    <header className="administration-panel-heading"><UsersRound aria-hidden="true" /><div>
      <h2 id={`${panelId}-title`}>Personal y jornadas del taller</h2>
      <p>Especialidades, tarifas en CLP y jornadas por trabajador.</p>
    </div></header>
    {!canConfigure && <p className="administration-notice">La configuración general es de solo lectura. {canExcept ? 'Puedes registrar excepciones de jornada con motivo.' : ''}</p>}

    <div className="p-4 space-y-5">
      <details open={mode === 'settings'}>
        <summary className="administration-settings-subtitle cursor-pointer">Horario semanal del taller</summary>
        <div className="space-y-3 py-3">
          <p>Zona horaria: <strong>{data.schedule.timezone}</strong></p>
          {data.schedule.weekly.length === 0 ? <p role="status" className="administration-notice">Horario sin configurar. No se presupone una jornada ni una duración.</p> : <>
            <ul className="grid gap-2 sm:grid-cols-2">{[...data.schedule.weekly].sort((a, b) => a.weekday - b.weekday).map((day) =>
              <li key={day.weekday}>{DAYS[day.weekday]}: {day.start} – {day.end}</li>)}</ul>
            <p className="text-sm text-slate-500">Los días no incluidos son días libres.</p>
          </>}
          {canConfigure && <button type="button" className="administration-secondary" disabled={busy} onClick={() => open({ kind: 'schedule', timezone: data.schedule.timezone, weekly: data.schedule.weekly.map((day) => ({ ...day })) })}>
            <CalendarClock aria-hidden="true" />Configurar horario</button>}
        </div>
      </details>

      <details open={mode === 'settings'}>
        <summary className="administration-settings-subtitle cursor-pointer">Especialidades y tarifas históricas</summary>
        <div className="space-y-3 py-3">
          <p>Las especialidades describen el oficio y son independientes del rol de acceso.</p>
          {canConfigure && <div className="flex flex-wrap gap-2">
            <button type="button" className="administration-primary" disabled={busy} onClick={() => open({ kind: 'specialty', name: '', active: true })}><Plus aria-hidden="true" />Nueva especialidad</button>
            <button type="button" className="administration-secondary" disabled={busy} onClick={() => void seed()}>Agregar especialidades sugeridas</button>
          </div>}
          {data.specialties.length === 0 && <p className="administration-notice">No hay especialidades configuradas.</p>}
          {data.specialties.map((specialty) => <article key={specialty.id} className="rounded-lg border border-slate-200 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold"><Wrench className="inline h-4 w-4" aria-hidden="true" /> {specialty.name} {!specialty.active && '(Inactiva)'}</h3>
              {canConfigure && <div className="flex flex-wrap gap-2">
                <button type="button" className="administration-secondary" disabled={busy} onClick={() => open({ kind: 'specialty', id: specialty.id, name: specialty.name, active: specialty.active })}>Editar {specialty.name}</button>
                <button type="button" className="administration-secondary" disabled={busy || !specialty.active} onClick={() => open({ kind: 'rate', specialtyId: specialty.id, validityFrom: '', costHourly: '', saleHourly: '' })}>Nueva tarifa de {specialty.name}</button>
              </div>}
            </div>
            {!data.rates.some((rate) => rate.specialtyId === specialty.id) ? <p>Sin tarifa configurada</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm">
              <caption className="sr-only">Historial de tarifas de {specialty.name}</caption>
              <thead><tr><th scope="col" className="p-2">Vigente desde</th><th scope="col" className="p-2">Costo por hora</th><th scope="col" className="p-2">Venta por hora</th></tr></thead>
              <tbody>{data.rates.filter((rate) => rate.specialtyId === specialty.id).sort((a, b) => b.validityFrom.localeCompare(a.validityFrom)).map((rate) => <tr key={rate.id}>
                <td className="p-2">{formatDate(rate.validityFrom)}</td><td className="p-2">{formatClp(rate.costHourly, 2)}</td><td className="p-2">{formatClp(rate.saleHourly, 2)}</td>
              </tr>)}</tbody>
            </table></div>}
          </article>)}
        </div>
      </details>

      <details open={mode === 'settings'}>
        <summary className="administration-settings-subtitle cursor-pointer">Especialidades por trabajador</summary>
        <div className="overflow-x-auto py-3"><table className="w-full text-left text-sm">
          <caption className="sr-only">Perfiles de personal del taller</caption>
          <thead><tr><th scope="col" className="p-2">Trabajador</th><th scope="col" className="p-2">Principal</th><th scope="col" className="p-2">Adicionales</th>{canConfigure && <th scope="col" className="p-2">Acciones</th>}</tr></thead>
          <tbody>{data.workers.map((worker) => {
            const profile = data.profiles.find((row) => row.userId === worker.id);
            return <tr key={worker.id}><td className="p-2">{worker.nombre} {!worker.activo && '(Inactivo)'}</td>
              <td className="p-2">{specialtyName(profile?.principalSpecialtyId ?? null)}</td><td className="p-2">{profile?.additionalSpecialtyIds.map(specialtyName).join(', ') || 'Ninguna'}</td>
              {canConfigure && <td className="p-2"><button type="button" className="administration-secondary" disabled={busy || !worker.activo} onClick={() => open({ kind: 'profile', userId: worker.id,
                principalSpecialtyId: profile?.principalSpecialtyId?.toString() ?? '', additionalSpecialtyIds: [...(profile?.additionalSpecialtyIds ?? [])] })}>Editar perfil de {worker.nombre}</button></td>}
            </tr>;
          })}</tbody>
        </table></div>
      </details>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="administration-settings-subtitle">Excepciones por trabajador y fecha</h3>
          {canExcept && <button type="button" className="administration-primary" disabled={busy} onClick={() => open({ kind: 'exception', userId: '', date: '', dayOff: false, start: '', end: '', reason: '' })}><Plus aria-hidden="true" />Registrar excepción</button>}
        </div>
        <p>Cada cambio conserva la versión anterior y requiere un motivo. La última versión de cada fecha es la vigente.</p>
        {!data.exceptions.length ? <p className="administration-notice">No hay excepciones registradas.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <caption className="sr-only">Historial de excepciones de jornada</caption>
          <thead><tr><th scope="col" className="p-2">Trabajador / fecha</th><th scope="col" className="p-2">Jornada</th><th scope="col" className="p-2">Motivo</th><th scope="col" className="p-2">Versión</th>{canExcept && <th scope="col" className="p-2">Acciones</th>}</tr></thead>
          <tbody>{data.exceptions.map((exception) => <tr key={exception.id}>
            <td className="p-2">{workerName(exception.userId)}<br />{formatDate(exception.date)}</td><td className="p-2">{exception.dayOff ? 'Día libre' : `${exception.start} – ${exception.end}`}</td>
            <td className="p-2 whitespace-pre-wrap break-words max-w-sm">{exception.reason}<small className="block text-slate-500">{formatDateTime(exception.createdAt)} · {exception.createdBy ? workerName(exception.createdBy) : 'Sin autor'}</small></td>
            <td className="p-2">v{exception.version} {latestExceptions.get(`${exception.userId}:${exception.date}`) === exception.version ? '(Vigente)' : '(Histórica)'}</td>
            {canExcept && <td className="p-2"><button type="button" className="administration-secondary" disabled={busy || !data.workers.some((worker) => worker.id === exception.userId && worker.activo)} onClick={() => open({ kind: 'exception', userId: String(exception.userId), date: exception.date,
              dayOff: exception.dayOff, start: exception.start ?? '', end: exception.end ?? '', reason: '' })}>Nueva versión</button></td>}
          </tr>)}</tbody>
        </table></div>}
      </div>
    </div>

    {dialog && <FormDialog id={`${panelId}-dialog`} title={TITLES[dialog.kind]} code="Personal del taller" context={dialog.kind === 'profile' ? workerName(dialog.userId) : data.schedule.timezone}
      submitLabel={dialog.kind === 'rate' || dialog.kind === 'exception' ? 'Registrar nueva versión' : 'Guardar cambios'} dirty={dirty} pending={busy}
      onClose={close} onSubmit={(event) => void submit(event)} submitDisabled={!dialogAllowed} headerVariant="plain" className="administration-form settings-reference-dialog">
      {error && <p role="alert" className="administration-alert">{error}</p>}
      {!dialogAllowed && <p role="status" className="administration-notice">No tienes permiso para guardar estos cambios.</p>}
      <fieldset disabled={!dialogAllowed} className="administration-form-grid">
        {dialog.kind === 'specialty' && <>
          <label><span>Nombre de especialidad</span><input value={dialog.name} maxLength={100} onChange={(event) => edit({ ...dialog, name: event.target.value })} /></label>
          {dialog.id && <label><input type="checkbox" checked={dialog.active} onChange={(event) => edit({ ...dialog, active: event.target.checked })} /><span>Especialidad activa</span></label>}
        </>}
        {dialog.kind === 'rate' && <>
          <p className="administration-wide">{specialtyName(dialog.specialtyId)}. Se agregará una vigencia posterior a la última tarifa; las anteriores se conservan.</p>
          <label><span>Vigente desde</span><input type="date" value={dialog.validityFrom} onChange={(event) => edit({ ...dialog, validityFrom: event.target.value })} /></label>
          <label><span>Costo por hora (CLP)</span><input type="number" min="0" step="0.01" value={dialog.costHourly} onChange={(event) => edit({ ...dialog, costHourly: event.target.value })} /></label>
          <label><span>Venta por hora (CLP)</span><input type="number" min="0" step="0.01" value={dialog.saleHourly} onChange={(event) => edit({ ...dialog, saleHourly: event.target.value })} /></label>
        </>}
        {dialog.kind === 'profile' && <>
          <label className="administration-wide"><span>Especialidad principal</span><select value={dialog.principalSpecialtyId} onChange={(event) => edit({ ...dialog, principalSpecialtyId: event.target.value,
            additionalSpecialtyIds: event.target.value ? dialog.additionalSpecialtyIds.filter((id) => String(id) !== event.target.value) : [] })}>
            <option value="">Sin especialidad</option>{data.specialties.map((specialty) => <option key={specialty.id} value={specialty.id} disabled={!specialty.active}>{specialty.name}{!specialty.active ? ' (Inactiva)' : ''}</option>)}
          </select></label>
          <fieldset className="administration-wide space-y-2"><legend>Especialidades adicionales</legend>{data.specialties.filter((specialty) => String(specialty.id) !== dialog.principalSpecialtyId).map((specialty) => <label key={specialty.id} className="flex items-center gap-2">
            <input type="checkbox" checked={dialog.additionalSpecialtyIds.includes(specialty.id)} disabled={!dialog.principalSpecialtyId || (!specialty.active && !dialog.additionalSpecialtyIds.includes(specialty.id))} onChange={(event) => edit({ ...dialog,
              additionalSpecialtyIds: event.target.checked ? [...dialog.additionalSpecialtyIds, specialty.id] : dialog.additionalSpecialtyIds.filter((id) => id !== specialty.id) })} />
            <span>{specialty.name}{!specialty.active ? ' (Inactiva; retírala del perfil)' : ''}</span>
          </label>)}</fieldset>
        </>}
        {dialog.kind === 'schedule' && <>
          <label className="administration-wide"><span>Zona horaria IANA</span><input value={dialog.timezone} placeholder="America/Santiago" onChange={(event) => edit({ ...dialog, timezone: event.target.value })} /></label>
          <p className="administration-wide">Activa los días que se trabajan e ingresa sus horas. Sin días seleccionados, el horario queda sin configurar.</p>
          {DAYS.map((name, weekday) => {
            const day = dialog.weekly.find((entry) => entry.weekday === weekday);
            return <fieldset key={weekday} className="administration-wide flex flex-wrap gap-3 items-center"><legend className="sr-only">{name}</legend>
              <label><input type="checkbox" checked={Boolean(day)} onChange={(event) => edit({ ...dialog, weekly: event.target.checked ? [...dialog.weekly, { weekday, start: '', end: '' }] : dialog.weekly.filter((entry) => entry.weekday !== weekday) })} /><span>{name}</span></label>
              {day && <><label><span>Entrada {name}</span><input type="time" value={day.start} onChange={(event) => edit({ ...dialog, weekly: dialog.weekly.map((entry) => entry.weekday === weekday ? { ...entry, start: event.target.value } : entry) })} /></label>
                <label><span>Salida {name}</span><input type="time" value={day.end} onChange={(event) => edit({ ...dialog, weekly: dialog.weekly.map((entry) => entry.weekday === weekday ? { ...entry, end: event.target.value } : entry) })} /></label></>}
            </fieldset>;
          })}
        </>}
        {dialog.kind === 'exception' && <>
          <label><span>Trabajador</span><select value={dialog.userId} onChange={(event) => edit({ ...dialog, userId: event.target.value })}><option value="">Selecciona un trabajador</option>{data.workers.filter((worker) => worker.activo).map((worker) => <option key={worker.id} value={worker.id}>{worker.nombre}</option>)}</select></label>
          <label><span>Fecha de jornada</span><input type="date" value={dialog.date} onChange={(event) => edit({ ...dialog, date: event.target.value })} /></label>
          <label className="administration-wide"><input type="checkbox" checked={dialog.dayOff} onChange={(event) => edit({ ...dialog, dayOff: event.target.checked })} /><span>Día libre</span></label>
          {!dialog.dayOff && <><label><span>Entrada excepcional</span><input type="time" value={dialog.start} onChange={(event) => edit({ ...dialog, start: event.target.value })} /></label>
            <label><span>Salida excepcional</span><input type="time" value={dialog.end} onChange={(event) => edit({ ...dialog, end: event.target.value })} /></label></>}
          <label className="administration-wide"><span>Motivo obligatorio</span><textarea value={dialog.reason} maxLength={1000} rows={3} onChange={(event) => edit({ ...dialog, reason: event.target.value })} /></label>
          {dialog.userId && dialog.date && <p className="administration-wide">Se registrará la versión {(latestExceptions.get(`${dialog.userId}:${dialog.date}`) ?? 0) + 1}. El historial anterior se conserva.</p>}
        </>}
      </fieldset>
    </FormDialog>}
  </section>;
}

export default WorkshopPersonnelPanel;
