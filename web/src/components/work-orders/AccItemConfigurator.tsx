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

/** Local draft only: selecting a catalogue row never changes the order or its totals. */
export default function AccItemConfigurator({ initial, editing, showDiscounts, priceReadOnly, onApply, onCancel }: Props) {
  const [draft, setDraft] = useState(() => ({ ...initial }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const applied = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
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
      ...draft,
      descripcion: parsed.data.descripcion,
      cantidad: String(parsed.data.cantidad),
      precioUnitario: priceReadOnly ? initial.precioUnitario : String(parsed.data.precioUnitario),
    });
  };
  return <section className="acc-item-builder" aria-label={editing ? 'Editar repuesto ACC' : 'Preparar repuesto ACC'}>
    <header>
      <div><small>ACC · {editing ? 'Editar selección' : 'Preparar selección'}</small>
        <h4 ref={heading} tabIndex={-1}>{draft.catalogItemId ? draft.descripcion : 'Repuesto libre'}</h4>
      </div>
      <button type="button" className="service-icon-button" aria-label={editing ? 'Cancelar edición ACC' : 'Cancelar selección ACC'}
        title="Volver al catálogo sin guardar" onClick={onCancel}><X aria-hidden="true" /></button>
    </header>
    <div className="acc-item-context">
      <span>Unidad: <strong>{UNIT_MEASURE_LABELS[draft.unidadMedida]}</strong></span>
      <span>{draft.esAPedido ? 'A pedido' : draft.catalogStock !== null ? `Stock: ${draft.catalogStock}` : 'Sin vínculo de catálogo'}</span>
    </div>
    {!draft.catalogItemId && <div className="acc-free-fields">
      <label className="service-field"><span>Descripción</span><input aria-label="Descripción ACC" maxLength={255}
        value={draft.descripcion} onChange={(event) => change({ descripcion: event.target.value })} /></label>
      <label className="service-field"><span>Unidad</span><select aria-label="Unidad ACC" value={draft.unidadMedida}
        onChange={(event) => change({ unidadMedida: event.target.value as UnitMeasure })}>
        {UNIT_MEASURES.map((unit) => <option key={unit} value={unit}>{UNIT_MEASURE_LABELS[unit]}</option>)}
      </select></label>
    </div>}
    <div className="acc-item-fields">
      <label className="service-field"><span>Cantidad</span><input type="number" min="1" step="1" aria-label="Cantidad ACC"
        aria-invalid={Boolean(errors.cantidad)} value={draft.cantidad} onChange={(event) => change({ cantidad: event.target.value })} /></label>
      <label className="service-field"><span>Precio unitario neto</span><CurrencyInput allowDecimals aria-label="Precio unitario ACC"
        aria-invalid={Boolean(errors.precioUnitario)} disabled={priceReadOnly} value={draft.precioUnitario}
        onChange={(value) => change({ precioUnitario: value })} /></label>
    </div>
    {showDiscounts && <div className="acc-item-fields">
      <label className="service-field"><span>Descuento del ítem</span><select aria-label="Tipo de descuento ACC"
        value={draft.descuentoTipo ?? ''} onChange={(event) => change({
          descuentoTipo: event.target.value ? event.target.value as DiscountType : null, descuentoValor: '0',
        })}>
        <option value="">Sin descuento</option><option value="porcentaje">Porcentaje (%)</option><option value="fijo">Monto fijo ($)</option>
      </select></label>
      {draft.descuentoTipo && <label className="service-field">
        <span>{draft.descuentoTipo === 'porcentaje' ? 'Porcentaje' : 'Monto por ítem'}</span>
        {draft.descuentoTipo === 'porcentaje' ? <input type="number" min="0" max="100" step="0.01"
          aria-label="Descuento ACC" aria-invalid={Boolean(errors.descuentoValor)} value={draft.descuentoValor ?? '0'}
          onChange={(event) => change({ descuentoValor: event.target.value })} /> :
          <CurrencyInput allowDecimals aria-label="Descuento ACC" aria-invalid={Boolean(errors.descuentoValor)}
            value={draft.descuentoValor ?? '0'} onChange={(value) => change({ descuentoValor: value })} />}
      </label>}
    </div>}
    {draft.descuentoTipo === 'fijo' && <p className="acc-item-help">El monto fijo se descuenta una sola vez del importe de este ítem, no por unidad.</p>}
    {!draft.esAPedido && draft.catalogStock !== null && Number(draft.cantidad) > draft.catalogStock &&
      <p className="acc-item-help">La cantidad supera el stock disponible. El stock se verifica al entregar el repuesto.</p>}
    {Object.keys(errors).length > 0 && <div role="alert" className="service-error"><ul>
      {[...new Set(Object.values(errors))].map((message) => <li key={message}>{message}</li>)}
    </ul></div>}
    <footer>
      <div><small>Subtotal neto</small><strong aria-live="polite">{pricing ? formatClp(pricing.total, 2) : '—'}</strong>
        {pricing && pricing.descuentoLineas > 0 && <small>Descuento: −{formatClp(pricing.descuentoLineas, 2)}</small>}
      </div>
      <button type="button" className="service-primary-button" onClick={apply}>
        {editing ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}{editing ? 'Guardar cambios' : 'Agregar'}
      </button>
    </footer>
    <button type="button" className="acc-back-to-catalog" onClick={onCancel}>{editing ? 'Cancelar edición' : 'Volver al catálogo'}</button>
  </section>;
}
