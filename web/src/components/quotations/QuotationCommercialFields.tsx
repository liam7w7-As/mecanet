import { QUOTATION_PAYMENT_LABELS, QUOTATION_PAYMENT_METHODS } from '@unithor/shared';

import type { Quotation } from '../../types/entities';
import type { DiscountType, QuotationPaymentMethod } from '@unithor/shared';

export interface CommercialDraft {
  formaPago: QuotationPaymentMethod;
  disponibilidadTrabajo: string;
  validezDias: string;
  descuentoTipo: DiscountType | null;
  descuentoValor: string;
}

export const createCommercialDraft = (quotation?: Quotation): CommercialDraft => ({
  formaPago: quotation?.formaPago ?? 'transferencia',
  disponibilidadTrabajo: quotation?.disponibilidadTrabajo ?? '',
  validezDias: String(quotation?.validezDias ?? 5),
  descuentoTipo: quotation?.descuentoTipo ?? null,
  descuentoValor: String(quotation?.descuentoValor ?? 0),
});

const fieldClass = 'mt-1 h-10 w-full min-w-0 rounded-lg border border-brand-line bg-white px-3 text-sm font-normal outline-none focus:border-brand-primary';

export default function QuotationCommercialFields({ value, onChange, errors = {} }: {
  value: CommercialDraft;
  onChange: (value: CommercialDraft) => void;
  errors?: Record<string, string>;
}) {
  return <section className="space-y-3" aria-label="Condiciones de la cotización">
    <h2 className="font-bold text-brand-primaryInk">Condiciones de la cotización</h2>
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1.5fr_0.65fr]">
      <label className="min-w-0 text-sm font-semibold text-brand-ink">Forma de pago
        <select className={fieldClass} value={value.formaPago} onChange={(event) => onChange({ ...value, formaPago: event.target.value as QuotationPaymentMethod })}>
          {QUOTATION_PAYMENT_METHODS.map((method) => <option key={method} value={method}>{QUOTATION_PAYMENT_LABELS[method]}</option>)}
        </select>
      </label>
      <label className="min-w-0 text-sm font-semibold text-brand-ink">Disponibilidad del trabajo
        <input className={fieldClass} value={value.disponibilidadTrabajo} maxLength={200} placeholder="Ej. Desde el lunes, previa coordinación" onChange={(event) => onChange({ ...value, disponibilidadTrabajo: event.target.value })} />
      </label>
      <label className="min-w-0 text-sm font-semibold text-brand-ink">Validez (días)
        <input type="number" min={1} max={365} step={1} className={fieldClass} value={value.validezDias} onChange={(event) => onChange({ ...value, validezDias: event.target.value })} />
      </label>
    </div>
    {['formaPago', 'disponibilidadTrabajo', 'validezDias'].map((key) => errors[key] && <p key={key} role="alert" className="text-sm text-brand-coralInk">{errors[key]}</p>)}
  </section>;
}
