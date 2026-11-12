import { calculateQuotationPricing, getQuotationTaxBreakdown } from '@unithor/shared';
import { BadgePercent } from 'lucide-react';

import { formatClp } from '../../lib/formatters';
import CurrencyInput from '../common/CurrencyInput';

import type { EditableWorkOrderItem } from '../work-orders/WorkOrderItemsEditor';
import type { DiscountType } from '@unithor/shared';

export interface DiscountDraft { descuentoTipo: DiscountType | null; descuentoValor: string }

export default function QuotationDiscountSummary<T extends DiscountDraft>({ items, value, onChange, testId = 'quotation-total', readOnly = false }: {
  items: EditableWorkOrderItem[];
  value: T;
  onChange: (value: T) => void;
  testId?: string;
  readOnly?: boolean;
}) {
  let pricing: ReturnType<typeof calculateQuotationPricing> | null = null;
  let error = '';
  try { pricing = calculateQuotationPricing(items, value); } catch (cause) { error = cause instanceof Error ? cause.message : 'Descuento inválido'; }
  const tax = pricing ? getQuotationTaxBreakdown(pricing.total) : null;
  return <section className="quotation-pricing-summary mt-5 grid gap-5 border-t border-brand-line pt-5 md:grid-cols-2" aria-label="Resumen de importes">
    <div className="quotation-discount-controls min-w-0">
      <h3 className="quotation-section-title mb-2 text-sm font-bold text-brand-primaryInk"><BadgePercent aria-hidden="true" />Descuento general</h3>
      <fieldset disabled={readOnly} className="quotation-discount-inputs grid grid-cols-2 gap-3">
        <select aria-label="Tipo de descuento general" value={value.descuentoTipo ?? ''} className="h-10 min-w-0 rounded-lg border border-brand-line px-3 text-sm" onChange={(event) => onChange({ ...value, descuentoTipo: event.target.value ? event.target.value as DiscountType : null, descuentoValor: '0' })}>
          <option value="">Sin descuento</option><option value="porcentaje">Porcentaje (%)</option><option value="fijo">Monto fijo ($)</option>
        </select>
        {value.descuentoTipo === 'porcentaje' ? <input type="number" min={0} max={100} step="0.01" aria-label="Descuento general" value={value.descuentoValor} onChange={(event) => onChange({ ...value, descuentoValor: event.target.value })} className="h-10 min-w-0 rounded-lg border border-brand-line px-3 text-sm" />
          : <CurrencyInput aria-label="Descuento general" value={value.descuentoValor} disabled={!value.descuentoTipo} onChange={(next) => onChange({ ...value, descuentoValor: next })} className="h-10 min-w-0 rounded-lg border border-brand-line px-3 text-sm disabled:bg-brand-pale" />}
      </fieldset>
      {error && <p role="alert" className="mt-2 text-sm text-brand-coralInk">{error}</p>}
    </div>
    <dl className="quotation-pricing-breakdown space-y-2 text-sm tabular-nums">
      <div className="flex justify-between gap-3"><dt>Importe sin descuentos</dt><dd>{pricing ? formatClp(pricing.subtotal) : '-'}</dd></div>
      <div className="flex justify-between gap-3 text-brand-mintInk"><dt>Descuentos por ítem</dt><dd>{pricing ? `- ${formatClp(pricing.descuentoLineas)}` : '-'}</dd></div>
      <div className="flex justify-between gap-3 text-brand-mintInk"><dt>Descuento general</dt><dd>{pricing ? `- ${formatClp(pricing.descuentoGeneral)}` : '-'}</dd></div>
      <div className="flex justify-between gap-3"><dt>Subtotal neto</dt><dd>{tax ? formatClp(tax.neto) : '-'}</dd></div>
      <div className="flex justify-between gap-3"><dt>IVA (19%)</dt><dd>{tax ? formatClp(tax.iva) : '-'}</dd></div>
      <div className="quotation-pricing-total flex justify-between gap-3 border-t-2 border-brand-primaryInk pt-3 text-lg font-bold text-brand-primaryInk"><dt>Total con IVA</dt><dd data-testid={testId}>{tax ? formatClp(tax.total) : '-'}</dd></div>
    </dl>
  </section>;
}
