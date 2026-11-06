import { useEffect, useState } from 'react';

import { useCreatePriceSuggestionMutation, usePriceSuggestions, useReviewPriceSuggestionMutation } from '../../hooks/useWorkOrderLabor';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp } from '../../lib/formatters';
import { useAuthStore } from '../../stores/auth.store';
import { notifyError, notifySuccess } from '../../stores/toast.store';

import type { WorkOrder } from '../../types/entities';
import type { WorkOrderPriceSuggestionScope } from '@unithor/shared';

export default function WorkOrderPriceSuggestions({ workOrder, onDirtyChange, onPendingChange }: { workOrder: WorkOrder; onDirtyChange: (dirty: boolean) => void; onPendingChange: (pending: boolean) => void }) {
  const user = useAuthStore((state) => state.user);
  const supervisor = Boolean(user && ['admin', 'desarrollador', 'jefe'].includes(user.role));
  const canApprove = Boolean(user && ['admin', 'desarrollador'].includes(user.role));
  const closed = ['entregada', 'cancelada'].includes(workOrder.estado);
  const query = usePriceSuggestions(workOrder.id, supervisor);
  const create = useCreatePriceSuggestionMutation();
  const review = useReviewPriceSuggestionMutation();
  const [itemId, setItemId] = useState('');
  const [price, setPrice] = useState('');
  const [scope, setScope] = useState<WorkOrderPriceSuggestionScope>('ot');
  const [reason, setReason] = useState('');
  const dirty = Boolean(itemId || price || reason || scope !== 'ot');
  const pending = create.isPending || review.isPending;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => onPendingChange(pending), [pending, onPendingChange]);
  if (!supervisor) return null;
  const fail = (error: unknown) => notifyError(getApiErrorMessage(error));
  return <details className="workshop-price-review"><summary>Revisión de precios y catálogo<span>La aprobación final corresponde a administración</span></summary>
    {!closed && <div className="workshop-labor-admin">
      <label>Servicio<select aria-label="Servicio para sugerencia de precio" value={itemId} onChange={(event) => setItemId(event.target.value)}><option value="">Seleccionar servicio</option>{workOrder.items?.filter((item) => item.tipoLinea !== 'parte').map((item) => <option key={item.id} value={item.id}>{item.descripcion}</option>)}</select></label>
      <label>Precio sugerido<input type="number" min="0" aria-label="Precio de revisión" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
      <label>Aplicar en<select value={scope} onChange={(event) => setScope(event.target.value as WorkOrderPriceSuggestionScope)}><option value="ot">Solo esta OT</option><option value="catalogo">Solo catálogo</option><option value="ambos">OT y catálogo</option></select></label>
      <label>Motivo<input aria-label="Motivo de revisión de precio" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <button type="button" disabled={pending || !itemId || !price || !Number.isFinite(Number(price)) || Number(price) < 0 || reason.trim().length < 2} onClick={() => create.mutate({ id: workOrder.id, data: { workOrderItemId: Number(itemId), precioSugerido: Number(price), alcance: scope, motivo: reason } }, { onError: fail, onSuccess: () => { setItemId(''); setPrice(''); setScope('ot'); setReason(''); notifySuccess('Revisión enviada a administración.'); } })}>Enviar revisión</button>
    </div>}
    {query.isError && <p role="alert">{getApiErrorMessage(query.error)}</p>}
    {(query.data ?? []).length === 0 && <p>Sin revisiones registradas.</p>}
    {(query.data ?? []).map((suggestion) => <article key={suggestion.id} className="workshop-labor-observation"><strong>{suggestion.itemDescripcion ?? 'Servicio'} · {formatClp(suggestion.precioSugerido)}</strong><p>{suggestion.motivo}</p><small>{suggestion.estado} · {suggestion.createdByName ?? 'Taller'}</small>{canApprove && !closed && suggestion.estado === 'pendiente' && <div className="workshop-labor-actions">{(['aprobar', 'rechazar'] as const).map((decision) => <button key={decision} type="button" disabled={pending} onClick={() => review.mutate({ id: workOrder.id, suggestionId: suggestion.id, data: { decision } }, { onError: fail })}>{decision === 'aprobar' ? 'Aprobar revisión' : 'Rechazar revisión'}</button>)}</div>}</article>)}
  </details>;
}
