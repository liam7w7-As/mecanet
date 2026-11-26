import { dpQuoteInputSchema } from '@unithor/shared';
import { Calculator, LoaderCircle, Plus, Search, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useDpConfiguration, useDpQuotePreview } from '../../hooks/useDpConfiguration';
import { getApiErrorMessage, isApiConflict } from '../../lib/api-error';
import { formatClp } from '../../lib/formatters';
import { useAuthStore } from '../../stores/auth.store';
import FormDialog from '../common/FormDialog';
import { canReadDpCatalog, DP_SCOPE_LABELS } from '../settings/dp-configuration-ui';
import { DpField } from '../settings/DpConfigurationFields';

import type { DpConfiguration, DpQuoteLine, DpWorkQuote } from '@unithor/shared';

import '../settings/dp-configuration.css';

interface OperationSelection {
  id: string;
  discountType: '' | 'porcentaje' | 'fijo';
  discount: string;
}
const factorLabel = (value: number) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 6 }).format(value);

function FormulaBreakdown({ line }: { line: DpQuoteLine }) {
  return <div className="dp-quote-line"><strong>{line.label} · {formatClp(line.subtotal, 2)}</strong>
    <p>{line.formula === 'fixed' ? `${formatClp(line.basePrice, 2)} × ${factorLabel(line.multiplier)}` :
      `${formatClp(line.basePrice, 2)} × ${line.damageIncrement ? `(${factorLabel(line.vehicleFactor)} + ${factorLabel(line.damageIncrement)} de daño)` : factorLabel(line.vehicleFactor)} de tamaño × ${factorLabel(line.pieceFactor)} de pieza × ${factorLabel(line.multiplier)}`} = {formatClp(line.bruto, 2)}</p>
    {line.descuentoMonto > 0 && <p>Descuento manual: −{formatClp(line.descuentoMonto, 2)}</p>}
  </div>;
}

interface DpCatalogPanelProps {
  onClose: () => void;
  /** When provided, the calculated quote can be added to the caller's selection. */
  onAdd?: (quote: DpWorkQuote) => void;
  initialSelection?: {
    bodyId?: string;
    sizeId?: string;
    pieceId?: string;
    positionId?: string;
    damageId?: string;
  };
}

/** Configurable D&P catalogue. In sandbox mode it never writes work-order items. */
export default function DpCatalogPanel({ onClose, onAdd, initialSelection }: DpCatalogPanelProps) {
  const user = useAuthStore((state) => state.user);
  const allowed = canReadDpCatalog(user);
  const query = useDpConfiguration('catalog', allowed);
  const preview = useDpQuotePreview();
  const [bodyId, setBodyId] = useState(initialSelection?.bodyId ?? '');
  const [sizeId, setSizeId] = useState(initialSelection?.sizeId ?? '');
  const [pieceId, setPieceId] = useState(initialSelection?.pieceId ?? '');
  const [positionId, setPositionId] = useState(initialSelection?.positionId ?? '');
  const [damageId, setDamageId] = useState(initialSelection?.damageId ?? '');
  const [scope, setScope] = useState<'piece' | 'global'>('piece');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<OperationSelection[]>([]);
  const [error, setError] = useState('');
  const [calculated, setCalculated] = useState<{ signature: string; quote: DpWorkQuote } | null>(null);
  const inFlight = useRef(false);
  const calculatorScroll = useRef<HTMLDivElement>(null);
  const config = query.data?.configuration;
  const bodies = config?.bodyTypes.filter((body) => body.active) ?? [];
  const body = bodies.find((entry) => entry.id === bodyId) ?? bodies[0];
  const sizes = body?.sizes.filter((size) => size.active) ?? [];
  const size = sizes.find((entry) => entry.id === sizeId) ?? sizes[0];
  const pieceMap = new Map(config?.pieces.filter((piece) => piece.active).map((piece) => [piece.id, piece]));
  const rates = config?.rates.filter((rate) => rate.active && rate.bodyTypeId === body?.id && pieceMap.has(rate.pieceId)) ?? [];
  const pieces = config?.pieces.filter((piece) => piece.active && rates.some((rate) => rate.pieceId === piece.id)) ?? [];
  const positions = rates.filter((rate) => rate.pieceId === pieceId);
  const term = search.trim().toLocaleLowerCase('es');
  const filteredRates = rates.filter((rate) => !term || `${pieceMap.get(rate.pieceId)?.label} ${rate.positionLabel}`.toLocaleLowerCase('es').includes(term));
  const filteredServices = config?.operations.filter((operation) => operation.active && (!term || operation.label.toLocaleLowerCase('es').includes(term))) ?? [];
  const operations = config?.operations.filter((operation) => operation.active && (operation.scope === scope || operation.scope === 'additional')) ?? [];
  const needsDamage = selected.some((selection) => {
    const operation = operations.find((entry) => entry.id === selection.id);
    return config?.tables.some((table) => table.id === operation?.tableId && table.formula === 'repair');
  });
  const signature = JSON.stringify({ revision: query.data?.revision, body: body?.id, size: size?.id, pieceId, positionId, damageId, scope, selected });
  const quote = calculated?.signature === signature ? calculated.quote : null;
  const conflict = isApiConflict(preview.error);
  const reset = () => { setCalculated(null); setError(''); preview.reset(); };

  useEffect(() => {
    if (!quote) return;
    const scroller = calculatorScroll.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [quote]);

  const toggleOperation = (operation: DpConfiguration['operations'][number]) => {
    reset();
    const chosen = selected.some((entry) => entry.id === operation.id);
    const formula = config?.tables.find((table) => table.id === operation.tableId)?.formula;
    let next = selected.filter((entry) => entry.id !== operation.id);
    // A piece has one painting modality and one repair variant, not duplicate charges.
    if (!chosen && (formula === 'painting' || formula === 'repair')) {
      next = next.filter((entry) => {
        const other = operations.find((candidate) => candidate.id === entry.id);
        return config?.tables.find((table) => table.id === other?.tableId)?.formula !== formula;
      });
    }
    if (!chosen) next.push({ id: operation.id, discountType: '', discount: '' });
    setSelected(next);
    if (!next.some((entry) => {
      const other = operations.find((candidate) => candidate.id === entry.id);
      return config?.tables.find((table) => table.id === other?.tableId)?.formula === 'repair';
    })) setDamageId('');
  };

  const calculate = async () => {
    if (!allowed || !query.data || !body || !size || preview.isPending || inFlight.current) return;
    setError(''); setCalculated(null);
    const result = dpQuoteInputSchema.safeParse({
      configurationRevision: query.data.revision, bodyTypeId: body.id, sizeId: size.id, scope,
      ...(scope === 'piece' ? { pieceId, positionId } : {}),
      ...(needsDamage && damageId ? { damageLevelId: damageId } : {}),
      operations: selected.map((selection) => ({ operationId: selection.id,
        ...(selection.discountType ? { descuentoTipo: selection.discountType, descuentoValor: selection.discount.trim() ? Number(selection.discount) : Number.NaN } : {}),
      })),
    });
    if (!result.success) { setError(result.error.issues.map((issue) => issue.message).join('. ')); return; }
    inFlight.current = true;
    try { setCalculated({ signature, quote: await preview.mutateAsync(result.data) }); }
    catch { /* The API error is shown below, with the selection preserved. */ }
    finally { inFlight.current = false; }
  };

  return <FormDialog id="dp-catalog-title" title="Catálogo D&P" code="Desabolladura y pintura"
    context={query.data ? `${onAdd ? 'Selección de servicio' : 'Tarifas netas'} · versión ${query.data.revision}` : 'Consulta y cálculo'}
    headerVariant="brand" headerIcon={<Calculator aria-hidden="true" />} className="dp-dialog dp-catalog-dialog"
    dirty={false} pending={preview.isPending} submitLabel="Listo" onClose={onClose}
    onSubmit={(event) => { event.preventDefault(); onClose(); }}
    statusText={onAdd ? 'Calcula un servicio para agregarlo a la selección' : 'Calculadora de prueba · No crea ni modifica OT/COT'}>
    <div className="dp-workspace dp-catalog-workspace">
      {!allowed ? <div className="dp-state"><p role="alert" className="dp-alert">No tienes permiso para consultar el catálogo D&P.</p></div> :
        query.isPending ? <div role="status" className="dp-state"><LoaderCircle className="animate-spin" aria-hidden="true" />Cargando catálogo D&P…</div> :
          !config ? <div className="dp-state"><div role="alert" className="dp-alert"><span>{getApiErrorMessage(query.error, 'No se pudo cargar el catálogo D&P.')}</span><button type="button" onClick={() => void query.refetch()}>Reintentar</button></div></div> : <>
            <fieldset disabled={preview.isPending} className="dp-catalog-fields">
              <div className="dp-catalog-toolbar">
                <div className="dp-filter-grid">
                  <DpField label="Carrocería"><select value={body?.id ?? ''} onChange={(e) => { setBodyId(e.target.value); setSizeId(''); setPieceId(''); setPositionId(''); reset(); }}>
                    {!bodies.length && <option value="">Sin carrocerías activas</option>}{bodies.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                  </select></DpField>
                  <DpField label="Tamaño del vehículo"><select value={size?.id ?? ''} onChange={(e) => { setSizeId(e.target.value); reset(); }}>
                    {!sizes.length && <option value="">Sin tamaños activos</option>}{sizes.map((entry) => <option key={entry.id} value={entry.id}>{entry.label} · factor {factorLabel(entry.factor)}</option>)}
                  </select></DpField>
                  <DpField label="Buscar pieza o servicio"><span className="dp-search"><Search aria-hidden="true" /><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Parachoque, pintura…" /></span></DpField>
                </div>
              </div>
              <div className="dp-catalog-layout">
                <section className="dp-catalog-browser" aria-label="Piezas y servicios disponibles">
                  <header className="dp-panel-heading">
                    <div><h3><Sparkles aria-hidden="true" />Piezas y ubicaciones</h3><p>{body?.label ?? 'Sin carrocería'} · {filteredRates.length} {filteredRates.length === 1 ? 'resultado' : 'resultados'}</p></div>
                  </header>
                  <div className="dp-catalog-scroll">
                    <div className="dp-catalog-grid">
                      {filteredRates.map((rate) => <article className="dp-catalog-card" key={`${rate.pieceId}:${rate.positionId}`}>
                        <header><strong>{pieceMap.get(rate.pieceId)?.label} · {rate.positionLabel}</strong></header>
                        <div className="dp-catalog-factor-list"><span>Pintura × {factorLabel(rate.paintingFactor)}</span><span>Reparación × {factorLabel(rate.repairFactor)}</span><span>Desmontaje / montaje × {factorLabel(rate.dismantlingFactor)}</span></div>
                        <button type="button" className="dp-secondary" onClick={() => { setScope('piece'); setSelected([]); setDamageId(''); setPieceId(rate.pieceId); setPositionId(rate.positionId); reset(); }}>Probar tarifa</button>
                      </article>)}
                    </div>
                    {!filteredRates.length && <p className="dp-empty">No se encontraron piezas con estos filtros.</p>}
                    <h3 className="dp-subheading">Servicios</h3>
                    <div className="dp-service-grid">
                      {filteredServices.map((operation) => {
                        const table = config.tables.find((entry) => entry.id === operation.tableId);
                        const pending = !table?.active || table.basePrice === null || operation.multiplier === null;
                        return <article className="dp-service-card" key={operation.id}><strong>{operation.label}</strong><small>{DP_SCOPE_LABELS[operation.scope]} · {pending ? 'Tarifa pendiente' : `Base ${formatClp(table.basePrice!, 2)} netos · multiplicador ${factorLabel(operation.multiplier!)}`}</small></article>;
                      })}
                      {!filteredServices.length && <p className="dp-empty">No se encontraron servicios con este filtro.</p>}
                    </div>
                  </div>
                </section>
                <section className="dp-calculator" aria-labelledby="dp-calculator-title">
                  <header className="dp-panel-heading">
                    <div><h3 id="dp-calculator-title"><Calculator aria-hidden="true" />Calculadora de prueba</h3><p>No guarda documentos ni modifica OT/COT</p></div>
                  </header>
                  <div className="dp-calculator-scroll" ref={calculatorScroll}>
                    <div className="dp-calculator-card">
                      <div className="dp-calculator-block">
                        <div className="dp-block-heading"><span>Vehículo y pieza</span></div>
                        <DpField label="Alcance del trabajo"><select value={scope} onChange={(e) => { setScope(e.target.value as 'piece' | 'global'); setSelected([]); setDamageId(''); reset(); }}><option value="piece">Por pieza</option><option value="global">Vehículo completo</option></select></DpField>
                        {scope === 'piece' && <div className="dp-inline-fields">
                          <DpField label="Pieza"><select value={pieces.some((piece) => piece.id === pieceId) ? pieceId : ''} onChange={(e) => { setPieceId(e.target.value); setPositionId(''); reset(); }}><option value="">Seleccionar pieza</option>{pieces.map((piece) => <option key={piece.id} value={piece.id}>{piece.label}</option>)}</select></DpField>
                          <DpField label="Ubicación"><select value={positions.some((rate) => rate.positionId === positionId) ? positionId : ''} disabled={!pieceId} onChange={(e) => { setPositionId(e.target.value); reset(); }}><option value="">Seleccionar ubicación</option>{positions.map((rate) => <option key={rate.positionId} value={rate.positionId}>{rate.positionLabel}</option>)}</select></DpField>
                        </div>}
                      </div>
                      <div className="dp-calculator-block">
                        <div className="dp-block-heading"><span>Operaciones</span><small>{selected.length} {selected.length === 1 ? 'seleccionada' : 'seleccionadas'}</small></div>
                        <div className="dp-catalog-operations">{operations.map((operation) => {
                          const table = config.tables.find((entry) => entry.id === operation.tableId);
                          const pending = !table?.active || table.basePrice === null || operation.multiplier === null;
                          const selection = selected.find((entry) => entry.id === operation.id);
                          return <div className={`dp-catalog-operation${selection ? ' is-selected' : ''}`} key={operation.id}>
                            <label><span><input type="checkbox" disabled={pending} checked={Boolean(selection)} onChange={() => toggleOperation(operation)} /> {operation.label}</span></label>
                            {pending && <small>Tarifa pendiente de configuración</small>}
                            {selection && <div className="dp-inline-fields">
                              <DpField label={`Descuento de ${operation.label}`}><select value={selection.discountType} onChange={(e) => { setSelected((current) => current.map((entry) => entry.id === operation.id ? { ...entry, discountType: e.target.value as OperationSelection['discountType'], discount: '' } : entry)); reset(); }}>
                                <option value="">Sin descuento</option><option value="porcentaje">Porcentaje</option><option value="fijo">Monto fijo</option>
                              </select></DpField>
                              {selection.discountType && <DpField label={`Valor del descuento de ${operation.label}`}><input type="number" min="0" step="0.01" max={selection.discountType === 'porcentaje' ? 100 : undefined} value={selection.discount}
                                onChange={(e) => { setSelected((current) => current.map((entry) => entry.id === operation.id ? { ...entry, discount: e.target.value } : entry)); reset(); }} /></DpField>}
                            </div>}
                          </div>;
                        })}</div>
                      </div>
                      {needsDamage && <DpField label="Nivel de daño"><select value={damageId} onChange={(e) => { setDamageId(e.target.value); reset(); }}><option value="">Seleccionar nivel</option>
                        {config.damageLevels.filter((level) => level.active).map((level) => <option key={level.id} value={level.id}>{level.label} · suma {factorLabel(level.increment)} al tamaño</option>)}
                      </select></DpField>}
                      <button type="button" className="dp-primary dp-calculate-button" disabled={!body || !size || !selected.length || preview.isPending} onClick={() => void calculate()}>
                        {preview.isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Calculator aria-hidden="true" />}Calcular prueba
                      </button>
                      {error && <p role="alert" className="dp-alert">{error}</p>}
                      {preview.isError && <div role="alert" className="dp-alert"><div>{getApiErrorMessage(preview.error, 'No se pudo calcular. Revisa la selección y vuelve a intentar.')}
                        {conflict && <button type="button" className="dp-secondary" onClick={() => { reset(); void query.refetch(); }}>Actualizar tarifas</button>}
                      </div></div>}
                    </div>
                    {quote && <section aria-label="Resultado del cálculo" aria-live="polite" className="dp-result">
                      <header><strong>{quote.bodyTypeLabel} {quote.sizeLabel}{quote.pieceLabel ? ` · ${quote.pieceLabel} ${quote.positionLabel ?? ''}` : ''}</strong><span>{quote.lines.length} {quote.lines.length === 1 ? 'operación' : 'operaciones'}</span></header>
                      <div className="dp-result-lines">{quote.lines.map((line) => <FormulaBreakdown key={line.operationId} line={line} />)}</div>
                      <dl className="dp-totals"><div><dt>Subtotal neto</dt><dd>{formatClp(quote.subtotal, 2)}</dd></div><div><dt>Descuentos manuales</dt><dd>−{formatClp(quote.descuentoOperaciones, 2)}</dd></div>
                        <div><dt>Neto</dt><dd>{formatClp(quote.neto, 2)}</dd></div><div><dt>IVA (19%)</dt><dd>{formatClp(quote.iva, 2)}</dd></div><div><dt>Total con IVA</dt><dd>{formatClp(quote.total, 2)}</dd></div></dl>
                      {onAdd ? <>
                        <button type="button" className="dp-primary dp-add-button" onClick={() => onAdd(quote)}>
                          <Plus aria-hidden="true" />Agregar servicio
                        </button>
                        <p className="dp-notice">Se agregará con su tarifa calculada y las cinco etapas D&P.</p>
                      </> : <p className="dp-notice">Este resultado no registra servicios ni modifica órdenes o cotizaciones.</p>}
                    </section>}
                  </div>
                </section>
              </div>
            </fieldset>
          </>}
    </div>
  </FormDialog>;
}
