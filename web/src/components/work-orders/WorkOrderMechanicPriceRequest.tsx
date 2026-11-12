import { BadgeDollarSign, LoaderCircle, Send } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useCreateWorkOrderRequestMutation } from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';
import CurrencyInput from '../common/CurrencyInput';

import type { WorkOrder } from '../../types/entities';

interface Props {
  workOrder: WorkOrder;
  requestedItem?: { itemId: number };
  onDirtyChange: (dirty: boolean) => void;
  onPendingChange: (pending: boolean) => void;
}

/** A mechanic can request an increase; only a supervisor can apply it. */
export default function WorkOrderMechanicPriceRequest({ workOrder, requestedItem, onDirtyChange, onPendingChange }: Props) {
  const user = useAuthStore((state) => state.user);
  const mutation = useCreateWorkOrderRequestMutation();
  const [itemId, setItemId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, { price: string; reason: string }>>({});
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const draft = drafts[itemId] ?? { price: '', reason: '' };
  const services = (workOrder.items ?? []).filter((item) => item.tipoLinea !== 'parte'
    && (item.assignedUserId ?? workOrder.assignedMechanicId) === user?.id);
  const selected = services.find((item) => item.id === Number(itemId));
  const closed = ['entregada', 'cancelada'].includes(workOrder.estado);
  const allowed = user?.role === 'mecanico' && hasUserPermission(user, 'taller', 'update') && !closed;
  const valid = Boolean(selected && Number.isFinite(Number(draft.price)) && Number(draft.price) > 0
    && Number(draft.price) <= 999999999 && draft.reason.trim().length >= 2 && draft.reason.trim().length <= 2000);
  const dirty = Object.values(drafts).some((entry) => Boolean(entry.price || entry.reason.trim()));
  useEffect(() => { if (requestedItem) setItemId(String(requestedItem.itemId)); }, [requestedItem]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => onPendingChange(mutation.isPending), [mutation.isPending, onPendingChange]);
  const update = (change: Partial<typeof draft>): void => setDrafts((current) => ({ ...current, [itemId]: { ...(current[itemId] ?? { price: '', reason: '' }), ...change } }));
  const submit = (): void => {
    if (!allowed || !valid || mutation.isPending) return;
    const submittedId = itemId;
    setFeedback(null);
    mutation.mutate({ id: workOrder.id, data: { tipo: 'aumento_precio', workOrderItemId: Number(itemId), precioSugerido: Number(draft.price), motivo: draft.reason.trim() } }, {
      onError: (error) => setFeedback({ error: true, text: getApiErrorMessage(error, 'No se pudo enviar. Tu propuesta se conserva para reintentar.') }),
      onSuccess: () => {
        setDrafts((current) => { const next = { ...current }; delete next[submittedId]; return next; });
        setFeedback({ error: false, text: 'Sugerencia enviada al jefe de taller. El precio no cambia hasta que sea aprobada.' });
      },
    });
  };
  return <section className="workshop-price-review" aria-labelledby="mechanic-price-title">
    <header className="workshop-price-heading"><BadgeDollarSign aria-hidden="true" /><div><h2 id="mechanic-price-title">Sugerir precio de un servicio</h2><p>Describe la complejidad encontrada y propone el nuevo precio unitario. El jefe de taller debe aprobarlo.</p></div></header>
    {feedback && <div role={feedback.error ? 'alert' : 'status'} className={feedback.error ? 'workshop-labor-error' : 'workshop-labor-saved'}>{feedback.text}</div>}
    {allowed && services.length > 0 ? <form className="workshop-price-form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <label>Tu servicio<select aria-label="Servicio para sugerencia de precio" value={itemId} disabled={mutation.isPending} onChange={(event) => setItemId(event.target.value)}><option value="">Seleccionar servicio</option>{services.map((item) => <option key={item.id} value={item.id}>{item.descripcion}</option>)}</select></label>
      {selected && <><label>Nuevo precio unitario propuesto<CurrencyInput aria-label="Precio sugerido" value={draft.price} onChange={(price) => update({ price })} disabled={mutation.isPending} placeholder="$ 0" /></label>
        <label>Motivo de la propuesta<textarea aria-label="Motivo de la propuesta" rows={3} maxLength={2000} value={draft.reason} onChange={(event) => update({ reason: event.target.value })} disabled={mutation.isPending} placeholder="Explica la complejidad o trabajo adicional…" /></label>
        <div className="workshop-price-submit"><button className="primary-button" type="submit" disabled={!valid || mutation.isPending}>{mutation.isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}{mutation.isPending ? 'Enviando…' : 'Enviar al jefe de taller'}</button><span>La solicitud conserva los precios y totales actuales.</span></div></>}
    </form> : <p className="workshop-labor-help">{closed ? 'Orden cerrada: las sugerencias están disponibles solo para consulta.' : 'Solo puedes sugerir precios para tus servicios asignados.'}</p>}
    <div className="workshop-price-history"><h3>Tus sugerencias</h3>{(workOrder.requests ?? []).filter((request) => request.tipo === 'aumento_precio' && request.requester?.id === user?.id).map((request) => <article key={request.id} className="workshop-price-entry"><div className="workshop-price-entry-heading"><strong>{request.workOrderItem?.descripcion ?? 'Servicio'}</strong><span className={`status-chip ${request.estado === 'aprobada' ? 'green' : request.estado === 'rechazada' ? 'red' : 'gold'}`}>{request.estado}</span></div><p>{request.motivo}</p></article>)}</div>
  </section>;
}
