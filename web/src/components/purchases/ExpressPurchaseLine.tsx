import { expressMinimumSale, expressNetSale, getQuotationGrossTotal } from '@unithor/shared';
import { X } from 'lucide-react';

import { formatClp } from '../../lib/formatters';
import CurrencyInput from '../common/CurrencyInput';

import type { ExpressRecoveryLine } from '../../lib/purchase-express-recovery';
import type { ExpressOrderOption } from '@unithor/shared';

export const expressLineTotals = (item: ExpressRecoveryLine) => {
  const cost = Number(item.costoUnitario) || 0;
  const quantity = Number(item.cantidad) || 0;
  const sale = Number(item.ventaUnitario) || 0;
  return {
    cost: cost * quantity,
    sale:
      sale > 0 && quantity > 0
        ? getQuotationGrossTotal(expressNetSale(sale, quantity) * quantity)
        : 0,
  };
};

export default function ExpressPurchaseLine({
  item,
  index,
  headerOrder,
  orderOptions,
  errors,
  canRemove,
  onChange,
  onRemove,
}: {
  item: ExpressRecoveryLine;
  index: number;
  headerOrder: ExpressOrderOption | null;
  orderOptions?: ExpressOrderOption[];
  errors: Record<string, string>;
  canRemove: boolean;
  onChange: (changes: Partial<ExpressRecoveryLine>) => void;
  onRemove: () => void;
}) {
  const prefix = index === 0 ? 'express' : `express-${item.id}`;
  const cost = Number(item.costoUnitario) || 0;
  const minimum = Math.ceil(expressMinimumSale(cost));
  const invalidSale = cost > 0 && Number(item.ventaUnitario) < expressMinimumSale(cost);
  const order = item.order ?? headerOrder;
  const totals = expressLineTotals(item);
  const fieldError = (name: string) =>
    errors[`items.${index}.${name}`] && (
      <small className="express-field-error" role="alert">
        {errors[`items.${index}.${name}`]}
      </small>
    );
  return (
    <section className="express-line" role="group" aria-label={`Producto ${index + 1}`}>
      <div className="express-line-heading">
        <h3>
          Producto {index + 1}
          {item.requestId ? ` · Solicitud #${item.requestId}` : ''}
        </h3>
        <button
          type="button"
          aria-label={`Quitar producto ${index + 1}`}
          disabled={!canRemove}
          onClick={onRemove}
        >
          <X aria-hidden="true" />
        </button>
      </div>
      <div className="express-line-fields">
        <div className="express-line-description">
          <label htmlFor={`${prefix}-description`}>Accesorio</label>
          <input
            id={`${prefix}-description`}
            value={item.descripcion}
            maxLength={255}
            readOnly={Boolean(item.requestId)}
            aria-invalid={Boolean(errors[`items.${index}.descripcion`])}
            onChange={(event) => onChange({ descripcion: event.target.value })}
            placeholder="Nombre del accesorio o repuesto"
          />
          {fieldError('descripcion')}
        </div>
        <div>
          <label htmlFor={`${prefix}-quantity`}>Cantidad</label>
          <input
            id={`${prefix}-quantity`}
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            value={item.cantidad}
            readOnly={Boolean(item.requestId)}
            aria-invalid={Boolean(errors[`items.${index}.cantidad`])}
            onChange={(event) => onChange({ cantidad: event.target.value })}
          />
          {item.requestId && <small>Cantidad completa</small>}
          {fieldError('cantidad')}
        </div>
        <div>
          <label htmlFor={`${prefix}-cost`}>Compra por unidad</label>
          <CurrencyInput
            id={`${prefix}-cost`}
            value={item.costoUnitario}
            allowDecimals
            aria-invalid={Boolean(errors[`items.${index}.costoUnitario`])}
            placeholder="0"
            onChange={(value) => onChange({ costoUnitario: value })}
          />
          {fieldError('costoUnitario')}
        </div>
        <div>
          <label htmlFor={`${prefix}-sale`}>Venta por unidad al cliente</label>
          <CurrencyInput
            id={`${prefix}-sale`}
            value={item.ventaUnitario}
            allowDecimals
            aria-invalid={invalidSale || Boolean(errors[`items.${index}.ventaUnitario`])}
            placeholder="0"
            onChange={(value) => onChange({ ventaUnitario: value, saleEdited: true })}
          />
          <div className="express-line-minimum">
            <small>Mín. +25%: {formatClp(minimum)}</small>
            <button
              type="button"
              disabled={cost <= 0}
              onClick={() => onChange({ ventaUnitario: String(minimum), saleEdited: false })}
            >
              Usar sugerido
            </button>
          </div>
          {invalidSale && (
            <small role="alert" className="express-field-error">
              La venta no puede ser menor al 125% del precio de compra.
            </small>
          )}
          {fieldError('ventaUnitario')}
        </div>
      </div>
      <div className="express-line-footer">
        {item.requestId && <span className="express-line-order">OT de la solicitud: {order?.codigo}</span>}
        {!item.requestId && orderOptions && (
          <select aria-label={`OT del producto ${index + 1}`} value={item.order?.id ?? ''}
            onChange={(event) => onChange({ order: orderOptions.find((option) => option.id === Number(event.target.value)) ?? null })}>
            <option value="">OT principal · {headerOrder?.codigo}</option>
            {orderOptions.map((option) => <option key={option.id} value={option.id}>{option.codigo} · {option.patente}</option>)}
          </select>
        )}
        <div className="express-line-review" aria-label={`Resumen producto ${index + 1}`}>
          <span>
            Compra: <strong>{formatClp(totals.cost, 2)}</strong>
          </span>
          <span>
            Venta: <strong>{formatClp(totals.sale, 2)}</strong>
          </span>
        </div>
      </div>
      {fieldError('workOrderId')}
      <details
        className="express-line-note"
        open={errors[`items.${index}.detalle`] ? true : undefined}
      >
        <summary>Detalle del producto · Opcional</summary>
        <label htmlFor={`${prefix}-detail`}>Detalle</label>
        <textarea
          id={`${prefix}-detail`}
          rows={2}
          maxLength={1000}
          value={item.detalle}
          onChange={(event) => onChange({ detalle: event.target.value })}
        />
        {fieldError('detalle')}
      </details>
    </section>
  );
}
