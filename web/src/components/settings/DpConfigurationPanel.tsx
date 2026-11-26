import { dpConfigurationSchema } from '@unithor/shared';
import { AlertCircle, History, LoaderCircle, RotateCcw, Settings2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { canEditDpSettings, canReadDpSettings, DP_SETTINGS_TABS, dpIssueLabel } from './dp-configuration-ui';
import { DpDamageEditor, DpPricesEditor, DpStagesEditor, DpVehiclesEditor } from './DpConfigurationFields';
import DpPiecesEditor from './DpPiecesEditor';
import { useDpConfiguration, useDpConfigurationHistory, useUpdateDpConfiguration } from '../../hooks/useDpConfiguration';
import { getApiErrorMessage, isApiConflict } from '../../lib/api-error';
import { formatDateTime } from '../../lib/formatters';
import { useAuthStore } from '../../stores/auth.store';
import { notifySuccess } from '../../stores/toast.store';
import FormDialog from '../common/FormDialog';

import type { DpConfigurationTab } from './dp-configuration-ui';
import type { DpConfiguration, DpConfigurationRecord } from '@unithor/shared';
import type { FormEvent } from 'react';

import './dp-configuration.css';

export interface DpConfigurationPanelProps { onClose: () => void }

export default function DpConfigurationPanel({ onClose }: DpConfigurationPanelProps) {
  const actor = useAuthStore((state) => state.user);
  const canRead = canReadDpSettings(actor);
  const canEdit = canRead && canEditDpSettings(actor);
  const query = useDpConfiguration('settings', canRead);
  const save = useUpdateDpConfiguration();
  const [tab, setTab] = useState<DpConfigurationTab>('prices');
  const history = useDpConfigurationHistory(canRead && tab === 'history');
  const [draft, setDraft] = useState<DpConfigurationRecord | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmReload, setConfirmReload] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [message, setMessage] = useState('');
  const submitting = useRef(false);
  const contentScroll = useRef<HTMLDivElement>(null);
  const record = draft ?? query.data;
  const dirty = draft !== null;
  const busy = save.isPending || reloading;
  const conflict = isApiConflict(save.error);

  useEffect(() => {
    if (!save.isError && !conflict && !errors.length && !confirmReload) return;
    const scroller = contentScroll.current;
    if (scroller) scroller.scrollTop = 0;
  }, [save.isError, conflict, errors.length, confirmReload]);

  const edit = (update: (configuration: DpConfiguration) => void) => {
    if (!canEdit || busy || !record) return;
    setDraft((current) => {
      const next = structuredClone(current ?? record);
      update(next.configuration);
      return next;
    });
    setErrors([]); setMessage('');
    // A conflict remains visible until the user explicitly reloads the saved version.
    if (!conflict) save.reset();
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit || !record || !dirty || busy || conflict || submitting.current) return;
    const parsed = dpConfigurationSchema.safeParse(record.configuration);
    if (!parsed.success) {
      setErrors(parsed.error.issues.map((issue) => `${dpIssueLabel(issue.path, record.configuration)}: ${issue.message}`));
      return;
    }
    submitting.current = true;
    setErrors([]); setMessage('');
    try {
      await save.mutateAsync({ expectedRevision: record.revision, configuration: parsed.data });
      setDraft(null); setMessage('Configuración D&P guardada.');
      notifySuccess('Configuración D&P actualizada.');
    } catch { /* Mutation error is displayed without discarding the draft. */ }
    finally { submitting.current = false; }
  };
  const reload = async () => {
    if (busy) return;
    setReloading(true); setMessage('');
    try {
      const result = await query.refetch();
      if (result.isError) { setMessage('No se pudo cargar la versión actual. El borrador se conserva.'); return; }
      setDraft(null); setErrors([]); setConfirmReload(false); save.reset();
    } finally { setReloading(false); }
  };
  const selectTab = (next: DpConfigurationTab) => {
    setTab(next);
    const scroller = contentScroll.current;
    if (scroller) scroller.scrollTop = 0;
  };
  const requestReload = () => {
    setConfirmReload(true);
    const scroller = contentScroll.current;
    if (scroller) scroller.scrollTop = 0;
  };

  return <FormDialog id="dp-configuration-title" title="Configuración D&P" code="Desabolladura y pintura"
    context={record ? `Versión ${record.revision} · Tarifas y catálogo` : 'Tarifas y catálogo'} headerVariant="brand" headerIcon={<Settings2 aria-hidden="true" />}
    className="dp-dialog dp-settings-dialog" submitLabel="Guardar configuración" dirty={dirty} pending={busy}
    submitDisabled={!canEdit || !dirty || !record || conflict} onClose={onClose} onSubmit={(event) => void submit(event)}
    statusText={message || (dirty ? 'Cambios sin guardar' : 'Tarifas netas · IVA al calcular')}>
    <div className="dp-workspace dp-settings-workspace">
      {!canRead ? <div className="dp-state"><p role="alert" className="dp-alert">No tienes permiso para consultar la configuración D&P.</p></div> :
        query.isPending ? <div role="status" className="dp-state"><LoaderCircle className="animate-spin" aria-hidden="true" />Cargando configuración D&P…</div> :
          !record ? <div className="dp-state"><div role="alert" className="dp-alert"><span>{getApiErrorMessage(query.error, 'No se pudo cargar la configuración D&P.')}</span><button type="button" onClick={() => void query.refetch()}>Reintentar</button></div></div> : <>
            <div className="dp-settings-head">
              <div className="dp-settings-meta">
                <strong>{record.lastEditor ? `Última edición: ${record.lastEditor.nombre}` : `Versión ${record.revision} · Configuración inicial`}</strong>
                {record.lastEditor && <span>{formatDateTime(record.updatedAt)}</span>}
              </div>
              {tab !== 'vehicles' && <button type="button" className="dp-secondary" disabled={!dirty || busy} onClick={requestReload}><RotateCcw aria-hidden="true" />Descartar edición</button>}
            </div>
            <div className="dp-tabs" role="tablist" aria-label="Secciones de configuración D&P">{DP_SETTINGS_TABS.map((entry) =>
              <button key={entry.id} id={`dp-settings-tab-${entry.id}`} type="button" role="tab" aria-selected={tab === entry.id} aria-controls={`dp-settings-panel-${entry.id}`}
                onClick={() => selectTab(entry.id)}>{entry.label}</button>)}</div>
            <div className="dp-settings-scroll" ref={contentScroll}>
              {!canEdit && <p className="dp-notice" role="status">Solo lectura. La edición está reservada a Administración y Desarrollador.</p>}
              {conflict && <div role="alert" className="dp-alert"><AlertCircle aria-hidden="true" /><div><strong>Otra persona actualizó esta configuración.</strong>
                <p>Tu borrador se conserva y no se sobrescribió la versión del servidor. Revisa tus cambios antes de cargar la versión actual.</p>
                <button type="button" className="dp-secondary" disabled={busy} onClick={requestReload}>Cargar versión actual</button>
              </div></div>}
              {save.isError && !conflict && <p role="alert" className="dp-alert">{getApiErrorMessage(save.error, 'No se pudo guardar. Tus cambios se conservan; puedes reintentar.')}</p>}
              {confirmReload && <div role="alertdialog" aria-label="Descartar configuración D&P" className="dp-confirm">
                <p>Se descartará tu borrador y se cargará la configuración guardada más reciente.</p>
                <button type="button" className="dp-secondary" disabled={busy} onClick={() => setConfirmReload(false)}>Seguir editando</button>
                <button type="button" className="dp-primary" disabled={busy} onClick={() => void reload()}>Descartar y cargar</button>
              </div>}
              {errors.length > 0 && <div role="alert" className="dp-alert"><div><strong>Revisa estos campos antes de guardar:</strong><ul>{errors.map((error, index) => <li key={index}>{error}</li>)}</ul></div></div>}
              <section role="tabpanel" aria-labelledby={`dp-settings-tab-${tab}`} id={`dp-settings-panel-${tab}`}>
                {tab === 'prices' && <DpPricesEditor configuration={record.configuration} edit={edit} disabled={!canEdit || busy} />}
                {tab === 'vehicles' && <DpVehiclesEditor configuration={record.configuration} edit={edit} disabled={!canEdit || busy} onCancel={requestReload} cancelDisabled={!dirty || busy} />}
                {tab === 'pieces' && <DpPiecesEditor configuration={record.configuration} edit={edit} disabled={!canEdit || busy} />}
                {tab === 'damage' && <DpDamageEditor configuration={record.configuration} edit={edit} disabled={!canEdit || busy} />}
                {tab === 'stages' && <DpStagesEditor configuration={record.configuration} edit={edit} disabled={!canEdit || busy} />}
                {tab === 'history' && <div className="dp-editor-fields"><h3><History aria-hidden="true" />Historial de versiones</h3>
                  {history.isPending ? <p role="status">Cargando historial…</p> : history.isError ? <div role="alert" className="dp-alert">{getApiErrorMessage(history.error, 'No se pudo cargar el historial.')}<button type="button" onClick={() => void history.refetch()}>Reintentar</button></div> :
                    <ol className="dp-history">{history.data?.map((entry) => <li key={entry.revision}><strong>Versión {entry.revision}</strong><span>{entry.editor?.nombre ?? 'Configuración inicial'}</span><time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time></li>)}</ol>}
                  {history.data?.length === 0 && <p className="dp-empty">No hay cambios registrados.</p>}
                </div>}
              </section>
            </div>
          </>}
    </div>
  </FormDialog>;
}
