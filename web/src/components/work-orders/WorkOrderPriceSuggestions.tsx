import { BadgeDollarSign, CheckCircle2, LoaderCircle, MessageCircle, Send } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useCreatePriceSuggestionMutation, usePriceSuggestions, useReviewPriceSuggestionMutation, useUpdateWorkOrderPricePolicyMutation, useWorkOrderPricePolicy } from '../../hooks/useWorkOrderLabor';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDateTime } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { normalizeWhatsAppPhone } from '../../lib/whatsapp';
import { useAuthStore } from '../../stores/auth.store';
import CurrencyInput from '../common/CurrencyInput';

import type { WorkOrder, WorkOrderPriceSuggestion } from '../../types/entities';
import type { WorkOrderPriceSuggestionScope } from '@unithor/shared';

interface Props {
  workOrder: WorkOrder;
  requestedItem?: { itemId: number };
  onDirtyChange: (dirty: boolean) => void;
  onPendingChange: (pending: boolean) => void;
}
interface Draft { price: string; scope: WorkOrderPriceSuggestionScope; reason: string }
const emptyDraft: Draft = { price: '', scope: 'ot', reason: '' };
const scopeLabels = { ot: 'Solo esta OT', catalogo: 'Solo catálogo', ambos: 'OT y catálogo' } as const;
const statusLabels = { pendiente: 'Pendiente de aprobación', aprobada: 'Aprobada', rechazada: 'Rechazada' } as const;

export default function WorkOrderPriceSuggestions({ workOrder, requestedItem, onDirtyChange, onPendingChange }: Props) {
  const user = useAuthStore((state) => state.user);
  const supervisor = Boolean(user && ['admin', 'desarrollador', 'jefe'].includes(user.role));
  const canApprove = Boolean(user && ['admin', 'desarrollador'].includes(user.role) && hasUserPermission(user, 'taller', 'update'));
  const canPropose = Boolean(user && supervisor && hasUserPermission(user, 'taller', 'update'));
  const closed = ['entregada', 'cancelada'].includes(workOrder.estado);
  const canRead = Boolean(user && supervisor && hasUserPermission(user, 'taller', 'read'));
  const query = usePriceSuggestions(workOrder.id, canRead);
  const policy = useWorkOrderPricePolicy(workOrder.id, canRead);
  const updatePolicy = useUpdateWorkOrderPricePolicyMutation();
  const create = useCreatePriceSuggestionMutation();
  const review = useReviewPriceSuggestionMutation();
  const [itemId, setItemId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const [policyDraft, setPolicyDraft] = useState<boolean | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [latestApplied, setLatestApplied] = useState<WorkOrderPriceSuggestion | null>(null);
  const draft = drafts[itemId] ?? emptyDraft;
  const services = (workOrder.items ?? []).filter((item) => item.tipoLinea !== 'parte');
  const selected = services.find((item) => item.id === Number(itemId));
  const approvalRequired = policy.data?.approvalRequired ?? workOrder.priceApprovalRequired ?? true;
  const policyDirty = policyDraft !== null && policyDraft !== approvalRequired;
  const dirty = policyDirty || Object.values(drafts).some((value) => Boolean(value.price || value.reason || value.scope !== 'ot')) || Object.values(reviewNotes).some((value) => Boolean(value.trim()));
  const pending = create.isPending || review.isPending || updatePolicy.isPending;
  const policyReady = Boolean(policy.data) && !policy.isError;
  const direct = policyReady && !approvalRequired && draft.scope === 'ot';
  const canConfigure = canPropose && policyReady && policy.data?.canConfigure === true && !closed;
  useEffect(() => { if (requestedItem) setItemId(String(requestedItem.itemId)); }, [requestedItem]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => onPendingChange(pending), [pending, onPendingChange]);
  if (!canRead) return null;
  const updateDraft = (value: Partial<Draft>): void => setDrafts((current) => ({ ...current, [itemId]: { ...(current[itemId] ?? emptyDraft), ...value } }));
  const valid = Boolean(selected && draft.price !== '' && Number.isFinite(Number(draft.price)) && Number(draft.price) > 0 && Number(draft.price) <= 999999999 && draft.reason.trim().length >= 2 && draft.reason.trim().length <= 2000 && (draft.scope === 'ot' || selected.catalogItemId));
  const difference = Number(draft.price) - Number(selected?.precioUnitario ?? 0);
  const submit = (): void => {
    if (!valid || pending || closed || !canPropose || !policyReady) return;
    const submittedItemId = itemId;
    setFeedback(null);
    setLatestApplied(null);
    create.mutate({ id: workOrder.id, data: { workOrderItemId: Number(itemId), precioSugerido: Number(draft.price), alcance: draft.scope, motivo: draft.reason.trim() } }, {
      onError: (error) => setFeedback({ error: true, text: getApiErrorMessage(error, 'No se pudo enviar. Tu propuesta sigue disponible para reintentar.') }),
      onSuccess: (saved) => {
        setDrafts((current) => { const remaining = { ...current }; delete remaining[submittedItemId]; return remaining; });
        const applied = saved.estado === 'aprobada';
        setLatestApplied(applied ? saved : null);
        setFeedback({ error: false, text: applied ? saved.alcance === 'ot' ? 'Precio aplicado en esta OT. El catálogo se mantuvo.' : 'Ajuste aplicado según el alcance aprobado.' : 'Propuesta enviada a administración. El precio se mantendrá hasta su aprobación.' });
      },
    });
  };
  const decide = (suggestion: WorkOrderPriceSuggestion, decision: 'aprobar' | 'rechazar'): void => {
    if (!canApprove || pending || closed || suggestion.estado !== 'pendiente') return;
    setFeedback(null);
    setLatestApplied(null);
    review.mutate({ id: workOrder.id, suggestionId: suggestion.id, data: { decision, comentario: reviewNotes[suggestion.id]?.trim() || undefined } }, {
      onError: (error) => setFeedback({ error: true, text: getApiErrorMessage(error) }),
      onSuccess: (saved) => {
        setReviewNotes((current) => ({ ...current, [suggestion.id]: '' }));
        setLatestApplied(saved.estado === 'aprobada' ? saved : null);
        setFeedback({ error: false, text: decision === 'aprobar' ? 'Propuesta aprobada. Los importes se actualizaron según el alcance elegido.' : 'Propuesta rechazada. Los precios se conservaron.' });
      },
    });
  };
  const savePolicy = (): void => {
    if (!canConfigure || !policyDirty || pending || policyDraft === null) return;
    setPolicyError(null);
    updatePolicy.mutate({ id: workOrder.id, approvalRequired: policyDraft }, {
      onSuccess: () => setPolicyDraft(null),
      onError: (error) => setPolicyError(getApiErrorMessage(error, 'No se pudo guardar la política. Tu selección se conserva para reintentar.')),
    });
  };
  const whatsAppAction = (suggestion: WorkOrderPriceSuggestion) => {
    if (suggestion.estado !== 'aprobada' || suggestion.alcance === 'catalogo') return null;
    const contact = workOrder.contact ?? workOrder.contactClient ?? workOrder.client;
    const phone = normalizeWhatsAppPhone(contact?.telefono);
    if (!phone) return <p className="workshop-labor-help">El contacto de esta OT no tiene teléfono para preparar el aviso por WhatsApp.</p>;
    const text = `Hola${contact?.nombre?.trim() ? ` ${contact.nombre.trim()}` : ''}, se actualizó el precio unitario de ${suggestion.itemDescripcion ?? 'un servicio'} en la orden ${workOrder.codigo} ${suggestion.precioActualOt === null ? '' : `de ${formatClp(suggestion.precioActualOt)} `}a ${formatClp(suggestion.precioSugerido)} netos (IVA no incluido). Motivo: ${suggestion.motivo}`;
    return <a className="secondary-button" href={`https://wa.me/${phone}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden="true" />Preparar aviso por WhatsApp</a>;
  };
  const suggestions = query.data ?? [];
  const waiting = suggestions.filter((suggestion) => suggestion.estado === 'pendiente');
  const reviewed = suggestions.filter((suggestion) => suggestion.estado !== 'pendiente');
  const renderSuggestion = (suggestion: WorkOrderPriceSuggestion) => <article key={suggestion.id} className="workshop-price-entry">
    <div className="workshop-price-entry-heading"><strong>{suggestion.itemDescripcion ?? 'Servicio'}</strong><span className={`status-chip ${suggestion.estado === 'aprobada' ? 'green' : suggestion.estado === 'rechazada' ? 'red' : 'gold'}`}>{suggestion.appliedDirectly && suggestion.estado === 'aprobada' ? 'Aplicado directamente en esta OT' : statusLabels[suggestion.estado]}</span></div>
    <div className="workshop-price-comparison"><span>{suggestion.alcance === 'catalogo' ? 'Catálogo al solicitar' : 'OT al solicitar'}<strong>{formatClp((suggestion.alcance === 'catalogo' ? suggestion.precioActualCatalogo : suggestion.precioActualOt) ?? 0)}</strong></span><span>Precio propuesto<strong>{formatClp(suggestion.precioSugerido)}</strong></span><span>Aplicar en<strong>{scopeLabels[suggestion.alcance]}</strong></span></div>
    <p>{suggestion.motivo}</p><small>{suggestion.createdByName ?? 'Taller'} · {formatDateTime(suggestion.createdAt)}</small>
    {suggestion.reviewNote && <p className="workshop-labor-help">Administración: {suggestion.reviewNote}</p>}
    {latestApplied?.id !== suggestion.id && whatsAppAction(suggestion)}
    {canApprove && !closed && suggestion.estado === 'pendiente' && <div className="workshop-price-decision"><label>Comentario de revisión (opcional)<input aria-label={`Comentario para ${suggestion.itemDescripcion ?? suggestion.id}`} maxLength={2000} disabled={pending} value={reviewNotes[suggestion.id] ?? ''} onChange={(event) => setReviewNotes((current) => ({ ...current, [suggestion.id]: event.target.value }))} /></label><div className="workshop-labor-actions"><button className="primary-button" type="button" disabled={pending} onClick={() => decide(suggestion, 'aprobar')}>Aprobar propuesta</button><button className="secondary-button" type="button" disabled={pending} onClick={() => decide(suggestion, 'rechazar')}>Rechazar propuesta</button></div></div>}
  </article>;
  return <section className="workshop-price-review" aria-labelledby="workshop-price-title">
    <header className="workshop-price-heading"><BadgeDollarSign aria-hidden="true" /><div><h2 id="workshop-price-title">Propuestas de precio</h2><p>Precios unitarios de esta OT. {approvalRequired ? 'Administración debe aprobar las propuestas antes de aplicarlas.' : 'Puedes aplicar ajustes solo en esta OT. Los cambios de catálogo requieren aprobación de administración.'}</p></div><span className="status-chip gold">{waiting.length} pendiente(s)</span></header>
    {policy.isPending && <p role="status" className="workshop-labor-help">Cargando política de precios de esta OT…</p>}
    {policy.isError && <div role="alert" className="workshop-labor-error"><span>No se pudo cargar la política de precios. Tus propuestas se conservan.</span><button type="button" disabled={pending} onClick={() => void policy.refetch()}>Reintentar política de precios</button></div>}
    {(canConfigure || policyDraft !== null) && <details className="workshop-labor-details"><summary>Política de precios de esta OT</summary><div className="workshop-labor-detail-body"><label>Aprobación de precios<select aria-label="Aprobación de precios de esta OT" value={String(policyDraft ?? approvalRequired)} disabled={!canConfigure || pending} onChange={(event) => setPolicyDraft(event.target.value === 'true')}><option value="true">Requiere aprobación de administración</option><option value="false">Permite aplicar ajustes solo en esta OT</option></select></label><p className="workshop-labor-help">Esta configuración corresponde únicamente a {workOrder.codigo}. Los cambios en el catálogo siguen su aprobación habitual.</p><button type="button" disabled={!canConfigure || !policyDirty || pending} onClick={savePolicy}>Guardar política de esta OT</button>{policyError && <p className="workshop-labor-error" role="alert">{policyError}</p>}</div></details>}
    {feedback && <div role={feedback.error ? 'alert' : 'status'} className={feedback.error ? 'workshop-labor-error' : 'workshop-labor-saved'}>{!feedback.error && <CheckCircle2 aria-hidden="true" />}<span>{feedback.text}</span>{!feedback.error && latestApplied && whatsAppAction(latestApplied)}</div>}
    {!closed && canPropose && services.length > 0 && <form className="workshop-price-form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <label>Servicio<select aria-label="Servicio para sugerencia de precio" value={itemId} disabled={pending} onChange={(event) => setItemId(event.target.value)}><option value="">Seleccionar servicio</option>{services.map((item) => <option key={item.id} value={item.id}>{item.descripcion}</option>)}</select></label>
      {selected && <>
        <div className="workshop-price-comparison"><span>Precio actual por unidad<strong>{formatClp(selected.precioUnitario)}</strong></span><span>Horas registradas<strong>{selected.horasHombreReales === null ? 'Sin registro' : `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(selected.horasHombreReales)} h`}</strong></span><span>Cantidad<strong>{selected.cantidad}</strong></span></div>
        <div className="workshop-price-fields"><label>Nuevo precio unitario<CurrencyInput aria-label="Precio sugerido" value={draft.price} onChange={(price) => updateDraft({ price })} disabled={pending} placeholder="$ 0" /></label><label>Aplicar en<select aria-label="Alcance de la propuesta" value={draft.scope} disabled={pending} onChange={(event) => updateDraft({ scope: event.target.value as WorkOrderPriceSuggestionScope })}>{Object.entries(scopeLabels).map(([value, label]) => <option key={value} value={value} disabled={value !== 'ot' && !selected.catalogItemId}>{label}</option>)}</select></label></div>
        {!selected.catalogItemId && <p className="workshop-labor-help">Servicio libre: la propuesta se aplica únicamente a esta OT.</p>}
        {draft.price !== '' && <p className="workshop-price-preview">{draft.scope === 'catalogo' ? <>Nuevo precio de catálogo: <strong>{formatClp(Number(draft.price))} por unidad</strong> · La OT mantendrá su precio.</> : <>Diferencia en esta OT: <strong>{difference > 0 ? '+' : ''}{formatClp(difference)} por unidad</strong>{` · Subtotal propuesto: ${formatClp(Number(draft.price) * Number(selected.cantidad))}`}</>}</p>}
        <label>Motivo de la propuesta (visible para el cliente)<textarea aria-label="Motivo de la propuesta" aria-describedby="price-client-reason-hint" placeholder="Describe la complejidad o el trabajo adicional encontrado…" maxLength={2000} rows={3} value={draft.reason} disabled={pending} onChange={(event) => updateDraft({ reason: event.target.value })} /></label>
        <p id="price-client-reason-hint" className="workshop-labor-help">El motivo se incluye en el correo al cliente cuando se aplica el ajuste. Una propuesta pendiente no envía ese aviso. WhatsApp se prepara solo si eliges esa acción.</p>
        <div className="workshop-price-submit"><button className="primary-button" type="submit" disabled={!valid || pending || !policyReady}>{create.isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}{create.isPending ? direct ? 'Aplicando…' : 'Enviando…' : direct ? 'Aplicar precio en esta OT' : 'Enviar a administración'}</button><span>{direct ? 'El ajuste actualiza esta OT y conserva el catálogo.' : 'Enviar la propuesta conserva los precios actuales.'}</span></div>
      </>}
    </form>}
    {!services.length && <p className="workshop-labor-empty">Esta orden no tiene servicios para proponer precios.</p>}
    {closed && <p className="workshop-labor-help">Las propuestas de esta orden cerrada están disponibles solo para consulta.</p>}
    <div className="workshop-price-history"><h3>Pendientes de aprobación</h3>{query.isPending ? <p role="status">Cargando propuestas…</p> : query.isError ? <div role="alert" className="workshop-labor-error"><span>{getApiErrorMessage(query.error)}</span><button type="button" onClick={() => void query.refetch()}>Reintentar</button></div> : waiting.length ? waiting.map(renderSuggestion) : <p className="workshop-labor-help">No hay propuestas pendientes.</p>}
      {reviewed.length > 0 && <details className="workshop-labor-details"><summary>Ver propuestas revisadas<span>{reviewed.length} registro(s)</span></summary>{reviewed.map(renderSuggestion)}</details>}
    </div>
  </section>;
}
