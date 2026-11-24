import { calculateQuotationPricing, UNIT_MEASURE_LABELS } from '@unithor/shared';
import { Pencil, Trash2 } from 'lucide-react';

import { formatClp } from '../../lib/formatters';

import type { EditableWorkOrderItem } from './WorkOrderItemsEditor';

interface Props {
  item: EditableWorkOrderItem;
  index: number;
  editing: boolean;
  errors: Record<string, string>;
  onEdit: () => void;
  onRemove: () => void;
}

export default function AccItemSummary({ item, index, editing, errors, onEdit, onRemove }: Props) {
  let pricing: ReturnType<typeof calculateQuotationPricing> | null = null;
  try { pricing = calculateQuotationPricing([item]); } catch { /* Keep invalid historical data editable. */ }
  return <article className={`service-summary-card acc-summary-card${editing ? ' is-editing' : ''}`}
    aria-label={`Repuesto ACC ${index + 1}`} data-item-type="parte" data-item-division="ACC">
    <header>
      <div><span className="service-summary-kind">ACC · {index + 1}</span><h4>{item.descripcion || 'Repuesto libre'}</h4></div>
      <div className="service-summary-actions">
        <button type="button" className="service-icon-button" aria-label={`Editar repuesto ACC ${index + 1}`}
          title="Editar repuesto" onClick={onEdit}><Pencil aria-hidden="true" /></button>
        <button type="button" className="service-icon-button" aria-label={`Eliminar ítem ${index + 1}`}
          title="Quitar repuesto" onClick={onRemove}><Trash2 aria-hidden="true" /></button>
      </div>
    </header>
    <p className="acc-summary-unit">Unidad: {UNIT_MEASURE_LABELS[item.unidadMedida]}{item.esAPedido ? ' · A pedido' : ''}</p>
    <dl className="acc-summary-values">
      <div><dt>Cantidad</dt><dd>{item.cantidad}</dd></div>
      <div><dt>Descuento</dt><dd>{!pricing ? 'Revisar descuento' : pricing.descuentoLineas > 0
        ? `${item.descuentoTipo === 'porcentaje' ? `${item.descuentoValor}% · ` : ''}−${formatClp(pricing.descuentoLineas, 2)}` : 'Sin descuento'}</dd></div>
      <div><dt>Precio unitario neto</dt><dd>{formatClp(Number(item.precioUnitario), 2)}</dd></div>
    </dl>
    <footer><span className="acc-summary-editing">{editing ? 'Edición en el panel izquierdo' : 'Repuesto agregado'}</span>
      <div className="service-card-price"><small>Subtotal neto</small>
        <strong data-testid={`item-subtotal-${index}`}>{pricing ? formatClp(pricing.total, 2) : 'Revisa los importes'}</strong></div>
    </footer>
    {Object.entries(errors).filter(([path]) => path.startsWith(`items.${index}.`))
      .map(([path, message]) => <p role="alert" className="service-error" key={path}>{message}</p>)}
  </article>;
}
