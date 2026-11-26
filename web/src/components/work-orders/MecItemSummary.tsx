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

export default function MecItemSummary({ item, index, editing, errors, onEdit, onRemove }: Props) {
  const specific = item.subtipo === 'especifico' || item.tipoLinea === 'especifico';
  const reference = specific && Number(item.precioUnitario) === 1;
  const divisionLabel = item.division === 'DP' ? 'D&P' : 'MEC';
  let pricing: ReturnType<typeof calculateQuotationPricing> | null = null;
  try { pricing = calculateQuotationPricing([item]); } catch { /* Historical data remains editable. */ }
  return <article className={`service-summary-card mec-summary-card${editing ? ' is-editing' : ''}`}
    aria-label={`Servicio ${divisionLabel} ${index + 1}`} data-item-type={item.tipoLinea} data-item-division={item.division ?? 'MEC'}>
    <header><div><span className="service-summary-kind">{divisionLabel} · {item.division === 'DP' ? 'Ítem libre' : specific ? 'Específico' : 'Estándar'}</span>
      <h4>{item.descripcion || 'Servicio libre'}</h4></div>
      <div className="service-summary-actions">
        <button type="button" className="service-icon-button" aria-label={`Editar servicio ${divisionLabel} ${index + 1}`}
          title="Editar servicio" onClick={onEdit}><Pencil aria-hidden="true" /></button>
        <button type="button" className="service-icon-button" aria-label={`Eliminar ítem ${index + 1}`}
          title="Quitar servicio" onClick={onRemove}><Trash2 aria-hidden="true" /></button>
      </div>
    </header>
    <p className="mec-summary-unit">Unidad: {UNIT_MEASURE_LABELS[item.unidadMedida]}
      {item.horasHombreEstimadas && <span> · {item.horasHombreEstimadas} h estimadas por unidad</span>}
    </p>
    {reference && <p className="mec-reference-notice">Pendiente de diagnóstico y valoración · $1 referencial</p>}
    <dl className="mec-summary-values">
      <div><dt>Cantidad</dt><dd>{item.cantidad}</dd></div>
      <div><dt>Descuento</dt><dd>{!pricing ? 'Revisar descuento' : pricing.descuentoLineas > 0
        ? `${item.descuentoTipo === 'porcentaje' ? `${item.descuentoValor}% · ` : ''}−${formatClp(pricing.descuentoLineas, 2)}` : 'Sin descuento'}</dd></div>
      <div><dt>{reference ? 'Precio referencial' : 'Precio unitario neto'}</dt><dd>{formatClp(Number(item.precioUnitario), 2)}</dd></div>
    </dl>
    <footer><span className="mec-summary-editing">{editing ? 'Edición en el panel izquierdo' : 'Servicio agregado'}</span>
      <div className="service-card-price"><small>{reference ? 'Importe referencial' : 'Subtotal neto'}</small>
        <strong data-testid={`item-subtotal-${index}`}>{pricing ? formatClp(pricing.total, 2) : 'Revisa los importes'}</strong>
      </div>
    </footer>
    {Object.entries(errors).filter(([path]) => path.startsWith(`items.${index}.`))
      .map(([path, message]) => <p role="alert" className="service-error" key={path}>{message}</p>)}
  </article>;
}
