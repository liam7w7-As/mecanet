import { calculateDpWorkQuote, dpQuoteInputSchema } from '@unithor/shared';
import { Check, LoaderCircle, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useDpConfiguration, useDpQuotePreview } from '../../hooks/useDpConfiguration';
import { getApiErrorMessage, isApiConflict } from '../../lib/api-error';
import { formatClp } from '../../lib/formatters';

import type { DpQuoteInput, DpWorkQuote } from '@unithor/shared';

export interface DpVehicleClassification {
  dpBodyTypeId?: string | null;
  dpSizeId?: string | null;
}

interface Props {
  vehicle: DpVehicleClassification;
  scope: 'piece' | 'global';
  initial?: DpQuoteInput;
  editing?: boolean;
  onApply: (quote: DpWorkQuote) => void;
  onCancel?: () => void;
}

/** Inline service builder. Vehicle classification is never defaulted or changed here. */
export default function DpServiceConfigurator({ vehicle, scope, initial, editing, onApply, onCancel }: Props) {
  const query = useDpConfiguration('catalog');
  const pricing = useDpQuotePreview();
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const [location, setLocation] = useState(initial?.pieceId && initial.positionId
    ? JSON.stringify([initial.pieceId, initial.positionId]) : '');
  const [operations, setOperations] = useState<DpQuoteInput['operations']>(initial?.operations ?? []);
  const [damage, setDamage] = useState(initial?.damageLevelId ?? '');
  const [error, setError] = useState('');
  const config = query.data?.configuration;
  const body = config?.bodyTypes.find((entry) => entry.id === vehicle.dpBodyTypeId && entry.active);
  const size = body?.sizes.find((entry) => entry.id === vehicle.dpSizeId && entry.active);
  const pieces = new Map(config?.pieces.filter((entry) => entry.active).map((entry) => [entry.id, entry.label]));
  const rates = config?.rates.filter((entry) => entry.active && entry.bodyTypeId === body?.id && pieces.has(entry.pieceId)) ?? [];
  const rate = rates.find((entry) => JSON.stringify([entry.pieceId, entry.positionId]) === location);
  const available = config?.operations.filter((entry) => entry.active && (entry.scope === scope || entry.scope === 'additional')) ?? [];
  const formula = (tableId: string) => config?.tables.find((entry) => entry.id === tableId)?.formula;
  const repair = available.filter((entry) => formula(entry.tableId) === 'repair');
  const painting = available.filter((entry) => formula(entry.tableId) === 'painting');
  const replacement = available.filter((entry) => entry.tableId === 'replacement' || entry.id === 'replacement_piece');
  const grouped = new Set([...repair, ...painting, ...replacement].map((entry) => entry.id));
  const additional = available.filter((entry) => !grouped.has(entry.id));
  const needsDamage = operations.some((selection) => available.some((entry) =>
    entry.id === selection.operationId && entry.requiresDamage));
  const pending = (entry: typeof available[number]) => {
    const table = config?.tables.find((candidate) => candidate.id === entry.tableId);
    return !table?.active || table.basePrice === null || entry.multiplier === null;
  };
  const input = {
    configurationRevision: query.data?.revision,
    bodyTypeId: body?.id, sizeId: size?.id, scope,
    ...(scope === 'piece' ? { pieceId: rate?.pieceId, positionId: rate?.positionId } : {}),
    ...(needsDamage && damage ? { damageLevelId: damage } : {}),
    operations,
  };
  let estimate: DpWorkQuote | null = null;
  if (config && query.data) {
    try { estimate = calculateDpWorkQuote(config, dpQuoteInputSchema.parse(input), query.data.revision); }
    catch { /* Incomplete selections are normal while configuring. */ }
  }

  const changeGroup = (entries: typeof available, id: string) => {
    const next = operations.filter((entry) => !entries.some((candidate) => candidate.id === entry.operationId));
    if (id) next.push(operations.find((entry) => entry.operationId === id) ?? { operationId: id });
    setOperations(next);
    if (entries === repair) setDamage('');
    setError(''); pricing.reset();
  };
  const apply = async () => {
    if (locked.current || pricing.isPending) return;
    const parsed = dpQuoteInputSchema.safeParse(input);
    if (!parsed.success || !estimate) { setError('Selecciona la pieza, las operaciones y el nivel de daño requerido.'); return; }
    locked.current = true;
    setError('');
    try {
      const quote = await pricing.mutateAsync(parsed.data);
      if (mounted.current) onApply(quote);
    }
    catch { /* Keep the draft; display the API error below. */ }
    finally { locked.current = false; }
  };
  const groupSelect = (label: string, entries: typeof available) => <label className="service-field">
    <span>{label}</span>
    <select aria-label={label} value={operations.find((entry) => entries.some((candidate) => candidate.id === entry.operationId))?.operationId ?? ''}
      onChange={(event) => changeGroup(entries, event.target.value)}>
      <option value="">Sin {label.toLocaleLowerCase('es')}</option>
      {entries.map((entry) => <option key={entry.id} value={entry.id} disabled={pending(entry)}>
        {entry.label}{pending(entry) ? ' · Tarifa pendiente' : ''}
      </option>)}
    </select>
  </label>;

  return <section className="dp-service-builder" aria-label={editing ? 'Editar servicio D&P' : 'Configurar servicio D&P'}>
    <header><div><small>{scope === 'piece' ? 'D&P · Por pieza' : 'D&P · Completo / Global'}</small>
      <h4>{body && size ? `${body.label} · ${size.label}` : 'Clasificación del vehículo'}</h4></div>
      {onCancel && <button type="button" className="service-icon-button" aria-label="Cancelar edición D&P" onClick={onCancel}><X aria-hidden="true" /></button>}
    </header>
    {query.isPending ? <p role="status"><LoaderCircle className="animate-spin" aria-hidden="true" />Cargando catálogo D&P…</p> :
      query.isError ? <div role="alert">{getApiErrorMessage(query.error)} <button type="button" onClick={() => void query.refetch()}>Reintentar</button></div> :
        !body || !size ? <p role="alert">Completa la carrocería y el tamaño del vehículo antes de agregar D&P.</p> :
          <fieldset disabled={pricing.isPending}>
            {scope === 'piece' && <label className="service-field"><span>Pieza y ubicación</span>
              <select aria-label="Pieza y ubicación" value={rate ? location : ''} onChange={(event) => {
                setLocation(event.target.value); setError(''); pricing.reset();
              }}>
                <option value="">Seleccionar pieza del catálogo</option>
                {rates.map((entry) => <option key={JSON.stringify([entry.pieceId, entry.positionId])} value={JSON.stringify([entry.pieceId, entry.positionId])}>
                  {pieces.get(entry.pieceId)} · {entry.positionLabel}
                </option>)}
              </select>
            </label>}
            {(scope === 'global' || rate) && <>
              {scope === 'piece' && <div className="dp-service-operation-grid">
                {groupSelect('Reparación', repair)}
                {groupSelect('Pintura', painting)}
                {groupSelect('Reemplazo', replacement)}
                {needsDamage && <label className="service-field"><span>Nivel de daño</span>
                  <select aria-label="Nivel de daño" value={damage} onChange={(event) => { setDamage(event.target.value); setError(''); }}>
                    <option value="">Seleccionar daño</option>
                    {config?.damageLevels.filter((entry) => entry.active).map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                  </select>
                </label>}
              </div>}
              <details className="dp-service-additional" open={scope === 'global' ? true : undefined}>
                <summary>{scope === 'global' ? 'Servicios globales y adicionales' : 'Servicios adicionales'}
                  <span>{operations.filter((entry) => !grouped.has(entry.operationId)).length} seleccionados</span>
                </summary>
                <div>{additional.map((entry) => <label key={entry.id}>
                  <input type="checkbox" checked={operations.some((selection) => selection.operationId === entry.id)}
                    disabled={pending(entry)} onChange={(event) => {
                      setOperations((current) => event.target.checked ? [...current, { operationId: entry.id }] : current.filter((selection) => selection.operationId !== entry.id));
                      setError(''); pricing.reset();
                    }} />
                  <span>{entry.label}{pending(entry) && <small>Tarifa pendiente de configuración</small>}</span>
                </label>)}</div>
              </details>
              <footer>
                <div><small>Precio neto</small><strong aria-live="polite">{estimate ? formatClp(estimate.precioUnitario, 2) : '—'}</strong></div>
                <button type="button" className="service-primary-button" disabled={!estimate || pricing.isPending} onClick={() => void apply()}>
                  {pricing.isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : editing ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
                  {editing ? 'Guardar cambios' : 'Agregar'}
                </button>
              </footer>
            </>}
            {(error || pricing.isError) && <div role="alert" className="service-error">
              {error || getApiErrorMessage(pricing.error)}
              {isApiConflict(pricing.error) && <button type="button" onClick={() => { pricing.reset(); void query.refetch(); }}>Actualizar tarifas</button>}
            </div>}
          </fieldset>}
  </section>;
}
