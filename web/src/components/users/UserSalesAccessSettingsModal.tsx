import { AlertCircle, Check, ChevronLeft, ChevronRight, FileText, Globe2, ListChecks, LoaderCircle, Search, ShieldCheck, UserRound, Wrench, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useSalesAccessRecords, useUpdateUserSalesAccess, useUserSalesAccessSettings } from '../../hooks/useSalesAccess';
import { getApiErrorMessage } from '../../lib/api-error';
import { useAuthStore } from '../../stores/auth.store';
import { notifySuccess } from '../../stores/toast.store';
import FormDialog from '../common/FormDialog';

import type { SalesAccessRecord, SalesAccessRecordRef, UserSalesAccessSettings } from '../../hooks/useSalesAccess';
import type { AdminUser } from '../../hooks/useUsers';
import type { SalesAccessMode, SalesAccessScopeType } from '@unithor/shared';
import type { FormEvent } from 'react';

interface Props { user: AdminUser; onClose: () => void }
type Selection = Pick<SalesAccessRecord, 'scopeType' | 'targetId' | 'codigo' | 'clientName' | 'patente' | 'linkedRecord'>;
interface Draft { mode: SalesAccessMode; records: Record<string, Selection> }

const MODES = [
  { value: 'own', label: 'Solo propias', description: 'Sus OT y cotizaciones', icon: UserRound },
  { value: 'all', label: 'Todas', description: 'De todos los vendedores', icon: Globe2 },
  { value: 'selected', label: 'Seleccionar algunas', description: 'Elegir registros concretos', icon: ListChecks },
] as const;

// A linked OT/COT is one selection in either search tab.
const recordKey = (record: SalesAccessRecordRef & { linkedRecord?: SalesAccessRecordRef | null }): string =>
  record.scopeType === 'quotation' && record.linkedRecord?.scopeType === 'work_order'
    ? `work_order:${record.linkedRecord.targetId}` : `${record.scopeType}:${record.targetId}`;

const initialDraft = (settings?: UserSalesAccessSettings): Draft => {
  const records: Record<string, Selection> = {};
  for (const grant of settings?.grants ?? []) {
    if (grant.expired) continue;
    const record: Selection = {
      scopeType: grant.scopeType, targetId: grant.targetId,
      codigo: grant.targetCodigo ?? `Registro #${grant.targetId}`,
      clientName: grant.clientName ?? null, patente: grant.patente ?? null,
      linkedRecord: grant.linkedRecord ?? null,
    };
    records[recordKey(record)] = record;
  }
  return { mode: settings?.mode ?? 'own', records };
};

const signature = ({ mode, records }: Draft): string => `${mode}:${mode === 'selected' ? Object.keys(records).sort().join('|') : ''}`;
const detailText = (record: Selection): string => [record.clientName, record.patente].filter(Boolean).join(' · ');

export default function UserSalesAccessSettingsModal({ user, onClose }: Props) {
  const actor = useAuthStore((state) => state.user);
  const canManage = Boolean(actor && ['admin', 'desarrollador'].includes(actor.role) && user.activo && user.role.nombre === 'vendedor');
  const submission = useRef(false);
  const settings = useUserSalesAccessSettings(user.id, canManage);
  const update = useUpdateUserSalesAccess(user.id);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [scopeType, setScopeType] = useState<SalesAccessScopeType>('work_order');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showSelected, setShowSelected] = useState(false);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const saved = initialDraft(settings.data);
  const current = draft ?? saved;
  const selections = Object.entries(current.records);
  const dirty = signature(current) !== signature(saved);
  const searchPending = search.trim() !== debouncedSearch;
  const records = useSalesAccessRecords(user.id, { scopeType, search: debouncedSearch || undefined, page, pageSize: 10 },
    canManage && current.mode === 'selected' && Boolean(settings.data) && !settings.isError && !showSelected && !searchPending);
  const loadingRecords = searchPending || records.isPending || records.isPlaceholderData;
  const selectionQuery = search.trim().toLocaleLowerCase('es');
  const visibleSelections = selections.filter(([, record]) =>
    [record.codigo, record.linkedRecord?.codigo, detailText(record)].join(' ').toLocaleLowerCase('es').includes(selectionQuery));
  const selectedCount = selections.length;
  const effectiveIds = new Set(selections.flatMap(([, record]) => [
    `${record.scopeType}:${record.targetId}`,
    ...(record.linkedRecord ? [`${record.linkedRecord.scopeType}:${record.linkedRecord.targetId}`] : []),
  ]));

  useEffect(() => setPage(1), [debouncedSearch, scopeType]);

  const changeMode = (mode: SalesAccessMode) => { if (!canManage) return; update.reset(); setDraft({ ...current, mode }); };
  const toggleRecord = (record: Selection) => {
    if (!canManage) return;
    const next = { ...current.records };
    const key = recordKey(record);
    if (next[key]) delete next[key];
    else if (selectedCount < 500) next[key] = record;
    update.reset();
    setDraft({ ...current, records: next });
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage || submission.current || update.isPending || !settings.data || settings.isError || !dirty || (current.mode === 'selected' && selectedCount === 0)) return;
    submission.current = true;
    update.mutate({ mode: current.mode, records: current.mode === 'selected'
      ? selections.map(([, record]) => ({ scopeType: record.scopeType, targetId: record.targetId })) : [] }, {
      onSuccess: () => { notifySuccess(`Acceso actualizado para ${user.nombre}`); onClose(); },
      onSettled: () => { submission.current = false; },
    });
  };

  return <FormDialog id="user-sales-access-title" title="Acceso a OT y COT" code={user.nombre} context={`@${user.username}`}
    headerVariant="plain" className="administration-form reference-form-dialog users-reference-form sales-access-dialog sales-access-settings"
    submitLabel="Guardar acceso" pending={update.isPending} dirty={dirty} onClose={onClose} onSubmit={submit}
    submitDisabled={!canManage || !settings.data || settings.isError || !dirty || (current.mode === 'selected' && selectedCount === 0)}
    statusText={settings.isPending ? 'Cargando acceso…' : current.mode === 'selected' ? `${selectedCount} selecciones · ${effectiveIds.size} registros` : dirty ? 'Cambios sin guardar' : 'Sin cambios pendientes'}>
    {!canManage && <p role="status" className="administration-notice">Ya no puedes guardar estos accesos. La selección se conserva para que puedas revisarla o cerrar.</p>}
    {canManage && settings.isPending && <p className="sales-access-feedback" role="status"><LoaderCircle className="animate-spin" aria-hidden="true" />Cargando la configuración actual…</p>}
    {settings.isError && <div className="administration-alert" role="alert"><AlertCircle aria-hidden="true" />
      <span>{getApiErrorMessage(settings.error, 'No se pudo cargar el acceso actual.')}</span><button type="button" onClick={() => void settings.refetch()}>Reintentar</button></div>}
    {update.isError && <div className="administration-alert" role="alert"><AlertCircle aria-hidden="true" />{getApiErrorMessage(update.error, 'No se pudo guardar el acceso. La selección sigue disponible para reintentar.')}</div>}

    <fieldset className="sales-access-modes" disabled={!canManage || !settings.data || settings.isError}>
      <legend>¿Qué OT y cotizaciones puede ver?</legend>
      <div>{MODES.map(({ value, label, description, icon: Icon }) => <label key={value} data-selected={current.mode === value}>
        <input type="radio" name="sales-access-mode" value={value} checked={current.mode === value} onChange={() => changeMode(value)} />
        <Icon aria-hidden="true" /><span><strong>{label}</strong><small>{description}</small></span>
        {current.mode === value && <Check className="sales-access-mode-check" aria-hidden="true" />}
      </label>)}</div>
    </fieldset>

    {current.mode === 'own' && <div className="sales-access-explanation"><UserRound aria-hidden="true" /><div><strong>Solo sus propios registros</strong>
      <p>Verá las OT que creó y las cotizaciones a su nombre, junto con sus pagos. Al guardar se retirarán los accesos compartidos anteriores.</p></div></div>}
    {current.mode === 'all' && <div className="sales-access-explanation is-all"><Globe2 aria-hidden="true" /><div><strong>Todas las OT y cotizaciones</strong>
      <p>Incluye los registros de otros vendedores y los que se creen en adelante. El propietario de cada registro se mantiene.</p></div></div>}

    {current.mode === 'selected' && <fieldset disabled={!canManage} className="sales-access-picker" aria-label="Seleccionar OT y cotizaciones">
      <div className="sales-access-picker-intro"><strong>Agrega los registros que necesita</strong><p>Sus registros siempre están incluidos. Cada OT y su COT vinculada se comparten juntas.</p></div>
      <div className="sales-access-picker-toolbar">
        <div className="sales-access-record-tabs" role="tablist" aria-label="Buscar o revisar selección">
          <button type="button" role="tab" aria-selected={!showSelected} aria-controls="sales-access-records" id="sales-access-search-tab" onClick={() => setShowSelected(false)}>Buscar registros</button>
          <button type="button" role="tab" aria-selected={showSelected} aria-controls="sales-access-records" id="sales-access-selected-tab" onClick={() => setShowSelected(true)}>Seleccionadas <b>{selectedCount}</b></button>
        </div>
        {selectedCount > 0 && <button type="button" className="sales-access-clear" onClick={() => { update.reset(); setDraft({ ...current, records: {} }); }}>Quitar selección</button>}
      </div>
      <label className="sales-access-search-field"><Search aria-hidden="true" /><span className="sr-only">Buscar OT o cotización</span>
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Código, cliente o patente" maxLength={100} />
        {search && <button type="button" aria-label="Limpiar búsqueda de registros" onClick={() => setSearch('')}><X aria-hidden="true" /></button>}
      </label>
      {!showSelected && <div className="sales-access-type-filter" role="group" aria-label="Tipo de registro">
        <button type="button" aria-pressed={scopeType === 'work_order'} onClick={() => setScopeType('work_order')}><Wrench aria-hidden="true" />Órdenes de trabajo</button>
        <button type="button" aria-pressed={scopeType === 'quotation'} onClick={() => setScopeType('quotation')}><FileText aria-hidden="true" />Cotizaciones</button>
      </div>}
      <div id="sales-access-records" role="tabpanel" aria-labelledby={showSelected ? 'sales-access-selected-tab' : 'sales-access-search-tab'} className="sales-access-record-list" aria-busy={!showSelected && loadingRecords}>
        {showSelected ? <>
          {visibleSelections.map(([key, record]) => <div key={key} className="sales-access-selected-row"><Check aria-hidden="true" /><div>
            <strong>{record.codigo}{record.linkedRecord && <span> + {record.linkedRecord.codigo}</span>}</strong><small>{detailText(record) || 'Acceso compartido'}</small>
          </div><button type="button" aria-label={`Quitar ${record.codigo} de la selección`} onClick={() => toggleRecord(record)}><X aria-hidden="true" /></button></div>)}
          {!visibleSelections.length && <p className="sales-access-feedback">{selectedCount ? 'Ninguna selección coincide con tu búsqueda.' : 'Selecciona una o varias OT o cotizaciones desde Buscar registros.'}</p>}
        </> : loadingRecords ? <p className="sales-access-feedback" role="status"><LoaderCircle className="animate-spin" aria-hidden="true" />Buscando registros…</p> : records.isError ?
          <div className="sales-access-feedback" role="alert"><span>{getApiErrorMessage(records.error, 'No se pudieron cargar los registros.')}</span><button type="button" onClick={() => void records.refetch()}>Reintentar</button></div> : <>
            {records.data?.items.map((record) => <label key={`${record.scopeType}:${record.targetId}`} className="sales-access-record-row" data-selected={Boolean(current.records[recordKey(record)])} data-owned={record.owned}>
              <input type="checkbox" aria-label={`Compartir ${record.codigo}`} checked={record.owned || Boolean(current.records[recordKey(record)])}
                disabled={record.owned || (selectedCount >= 500 && !current.records[recordKey(record)])} onChange={() => toggleRecord(record)} />
              <span className="sales-access-record-icon">{record.scopeType === 'work_order' ? <Wrench aria-hidden="true" /> : <FileText aria-hidden="true" />}</span>
              <span className="sales-access-record-info"><strong>{record.codigo}{record.linkedRecord && <small> + {record.linkedRecord.codigo}</small>}</strong>
                <span>{detailText(record) || 'Sin datos de cliente'}</span>{record.ownerName && <small>Registrado por: {record.ownerName}</small>}</span>
              {record.owned && <em>Propia</em>}
            </label>)}
            {!records.data?.items.length && <p className="sales-access-feedback">No se encontraron registros. Prueba otro código, cliente o patente.</p>}
          </>}
      </div>
      {!showSelected && records.data && !loadingRecords && !records.isError && <div className="sales-access-picker-pagination">
        <span>{records.data.total} registros encontrados</span><div><button type="button" aria-label="Página anterior de registros" disabled={page <= 1 || records.isFetching} onClick={() => setPage((value) => value - 1)}><ChevronLeft aria-hidden="true" /></button>
          <span>{page} / {Math.max(1, records.data.totalPages)}</span><button type="button" aria-label="Página siguiente de registros" disabled={page >= records.data.totalPages || records.isFetching} onClick={() => setPage((value) => value + 1)}><ChevronRight aria-hidden="true" /></button></div>
      </div>}
      {selectedCount === 0 && <p className="sales-access-selection-hint">Elige al menos un registro para guardar esta opción.</p>}
      {selectedCount >= 500 && <p className="sales-access-selection-hint">Llegaste a 500 selecciones. Usa Todas si necesita acceso completo.</p>}
    </fieldset>}

    <p className="sales-access-role-note"><ShieldCheck aria-hidden="true" /><span>Editar, registrar pagos y las demás acciones siguen dependiendo de los permisos de su rol.</span></p>
  </FormDialog>;
}
