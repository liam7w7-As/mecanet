import { calculateQuotationPricing, UNIT_MEASURES, UNIT_MEASURE_LABELS, workOrderItemInputSchema } from '@unithor/shared';
import { Check, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { getFieldErrors } from '../../lib/form-errors';
import { formatClp } from '../../lib/formatters';
import CurrencyInput from '../common/CurrencyInput';

import type { EditableWorkOrderItem } from './WorkOrderItemsEditor';
import type { DiscountType, UnitMeasure } from '@unithor/shared';

interface Props {
  initial: EditableWorkOrderItem;
  editing: boolean;
  showDiscounts: boolean;
  priceReadOnly?: boolean;
  onApply: (item: EditableWorkOrderItem) => void;
  onCancel: () => void;
}

/** The specific service keeps its catalogue link, with $1 only as its initial OT price. */
export default function MecItemConfigurator({ initial, editing, showDiscounts, priceReadOnly, onApply, onCancel }: Props) {
  const [draft, setDraft] = useState(() => ({ ...initial }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const applied = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const specific = initial.subtipo === 'especifico' || initial.tipoLinea === 'especifico';
  const reference = specific && Number(initial.precioUnitario) === 1;
  const lockedPrice = specific || priceReadOnly;
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, []);
  const change = (patch: Partial<EditableWorkOrderItem>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setErrors({});
  };
  let pricing: ReturnType<typeof calculateQuotationPricing> | null = null;
  let pricingError = '';
  try { pricing = calculateQuotationPricing([draft]); }
  catch (error) { pricingError = error instanceof Error ? error.message : 'Revisa los importes.'; }
  const apply = () => {
    if (applied.current) return;
    const parsed = workOrderItemInputSchema.safeParse({ ...draft, id: draft.id ?? undefined });
    const nextErrors = parsed.success ? {} : getFieldErrors(parsed.error.issues);
    if (!draft.cantidad.trim()) nextErrors.cantidad = 'Indica una cantidad.';
    if (!draft.precioUnitario.trim()) nextErrors.precioUnitario = 'Indica el precio unitario.';
    if (draft.descuentoTipo && !draft.descuentoValor?.trim()) nextErrors.descuentoValor = 'Indica el descuento.';
    if (pricingError) nextErrors.descuentoValor = pricingError;
    setErrors(nextErrors);
    if (!parsed.success || Object.keys(nextErrors).length) return;
    applied.current = true;
    onApply({
      ...draft, descripcion: parsed.data.descripcion, cantidad: String(parsed.data.cantidad),
      precioUnitario: lockedPrice ? initial.precioUnitario : String(parsed.data.precioUnitario),
    });
  };
  return <section className="mec-item-builder" aria-label={editing ? 'Editar servicio MEC' : 'Preparar servicio MEC'}>
    <header><div><small>MEC · {specific ? 'Específico' : 'Estándar'}</small>
      <h4 ref={heading} tabIndex={-1}>{initial.descripcion || 'Servicio libre'}</h4></div>
      <button type="button" className="service-icon-button" aria-label={editing ? 'Cancelar edición MEC' : 'Cancelar selección MEC'}
        title="Volver al catálogo sin guardar" onClick={onCancel}><X aria-hidden="true" /></button>
    </header>
    <p className="mec-item-context"><span>Unidad: <strong>{UNIT_MEASURE_LABELS[draft.unidadMedida]}</strong></span>
      {draft.horasHombreEstimadas && <span>{draft.horasHombreEstimadas} h estimadas por unidad</span>}
    </p>
    {(specific || !draft.catalogItemId) && <label className="service-field"><span>Descripción del trabajo</span>
      <textarea aria-label="Descripción MEC" maxLength={255} value={draft.descripcion} aria-invalid={Boolean(errors.descripcion)}
        onChange={(event) => change({ descripcion: event.target.value })} placeholder="Describe el servicio y lo que se debe revisar" />
    </label>}
    {!draft.catalogItemId && !specific && <label className="service-field"><span>Unidad</span>
      <select aria-label="Unidad MEC" value={draft.unidadMedida} onChange={(event) => change({ unidadMedida: event.target.value as UnitMeasure })}>
        {UNIT_MEASURES.map((unit) => <option key={unit} value={unit}>{UNIT_MEASURE_LABELS[unit]}</option>)}
      </select></label>}
    <div className={specific ? 'mec-specific-price' : 'mec-item-fields'}>
      {!specific && <label className="service-field"><span>Cantidad</span>
        <input type="number" min="1" step="1" aria-label="Cantidad MEC" value={draft.cantidad} aria-invalid={Boolean(errors.cantidad)}
          onChange={(event) => change({ cantidad: event.target.value })} />
      </label>}
      <label className="service-field"><span>{reference ? 'Precio referencial' : 'Precio unitario neto'}</span>
        <CurrencyInput allowDecimals aria-label="Precio unitario MEC" value={draft.precioUnitario}
          disabled={lockedPrice} aria-invalid={Boolean(errors.precioUnitario)} onChange={(value) => change({ precioUnitario: value })} />
      </label>
    </div>
    {reference && <p className="mec-reference-notice">Pendiente de diagnóstico y valoración. $1 es referencial, no el precio definitivo del trabajo.</p>}
    {!specific && showDiscounts && <div className="mec-item-fields">
      <label className="service-field"><span>Descuento del servicio</span>
        <select aria-label="Tipo de descuento MEC" value={draft.descuentoTipo ?? ''} onChange={(event) => change({
          descuentoTipo: event.target.value ? event.target.value as DiscountType : null, descuentoValor: '0',
        })}>
          <option value="">Sin descuento</option><option value="porcentaje">Porcentaje (%)</option><option value="fijo">Monto fijo ($)</option>
        </select>
      </label>
      {draft.descuentoTipo && <label className="service-field"><span>{draft.descuentoTipo === 'porcentaje' ? 'Porcentaje' : 'Monto por servicio'}</span>
        {draft.descuentoTipo === 'porcentaje' ? <input type="number" min="0" max="100" step="0.01"
          aria-label="Descuento MEC" value={draft.descuentoValor ?? '0'} aria-invalid={Boolean(errors.descuentoValor)}
          onChange={(event) => change({ descuentoValor: event.target.value })} /> :
          <CurrencyInput allowDecimals aria-label="Descuento MEC" value={draft.descuentoValor ?? '0'}
            aria-invalid={Boolean(errors.descuentoValor)} onChange={(value) => change({ descuentoValor: value })} />}
      </label>}
    </div>}
    {!specific && draft.descuentoTipo === 'fijo' && <p className="mec-item-help">El monto fijo se descuenta una vez del importe del servicio, no por unidad.</p>}
    {!specific && <details className="mec-time-details"><summary>Tiempo estimado (opcional)</summary>
      <label className="service-field"><span>Horas por unidad</span><input type="number" min="0" step="0.25"
        aria-label="Horas hombre MEC" value={draft.horasHombreEstimadas} onChange={(event) => change({ horasHombreEstimadas: event.target.value })} /></label>
    </details>}
    {Object.keys(errors).length > 0 && <div role="alert" className="service-error"><ul>
      {[...new Set(Object.values(errors))].map((message) => <li key={message}>{message}</li>)}
    </ul></div>}
    <footer><div><small>{reference ? 'Importe referencial' : 'Subtotal neto'}</small>
      <strong aria-live="polite">{pricing ? formatClp(pricing.total, 2) : '—'}</strong>
      {pricing && pricing.descuentoLineas > 0 && <small>Descuento: −{formatClp(pricing.descuentoLineas, 2)}</small>}
    </div>
      <button type="button" className="service-primary-button" onClick={apply}>
        {editing ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}{editing ? 'Guardar cambios' : 'Agregar'}
      </button>
    </footer>
    <button type="button" className="mec-back-to-catalog" onClick={onCancel}>{editing ? 'Cancelar edición' : 'Volver al catálogo'}</button>
  </section>;
}
