import { returnExpressPurchaseSchema } from '@unithor/shared';
import { Boxes } from 'lucide-react';
import { useState } from 'react';

import { useReturnPurchaseToStockMutation } from '../../hooks/usePurchases';
import { getApiErrorMessage } from '../../lib/api-error';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';
import { notifySuccess } from '../../stores/toast.store';
import FormDialog from '../common/FormDialog';

import type { Purchase } from '../../types/entities';
import type { FormEvent } from 'react';

export default function PurchaseReturnToStockModal({ purchase, onClose }: { purchase: Purchase; onClose: () => void }) {
  const user = useAuthStore((state) => state.user);
  const mutation = useReturnPurchaseToStockMutation();
  const [motivo, setMotivo] = useState('');
  const [validation, setValidation] = useState('');
  const pendingItems = purchase.items.filter((item) => !item.stockReturnedAt);
  const [selectedIds, setSelectedIds] = useState(() => pendingItems.map((item) => item.id));
  const selectedItems = pendingItems.filter((item) => selectedIds.includes(item.id));
  const allowed = Boolean(user && ['jefe', 'admin', 'desarrollador'].includes(user.role) && hasUserPermission(user, 'compras', 'update'))
    && Boolean(purchase.express) && purchase.estado === 'registrada' && pendingItems.length > 0;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!allowed || mutation.isPending) return;
    if (!selectedItems.length) { setValidation('Selecciona al menos un producto para enviar a stock.'); return; }
    const parsed = returnExpressPurchaseSchema.safeParse({ motivo,
      ...(purchase.items.length > 1 ? { itemIds: selectedItems.map((item) => item.id) } : {}),
    });
    if (!parsed.success) { setValidation(parsed.error.issues[0].message); return; }
    setValidation('');
    mutation.mutate({ purchaseId: purchase.id, ...parsed.data }, {
      onSuccess: () => { notifySuccess('Productos enviados al stock general. La compra y su egreso se conservan.'); onClose(); },
    });
  };
  return <FormDialog id="purchase-stock-return-title" title="Enviar a stock general" code={purchase.codigo}
    headerVariant="plain" headerIcon={<Boxes className="h-5 w-5" aria-hidden="true" />}
    submitLabel="Enviar a stock general" pending={mutation.isPending} submitDisabled={!allowed || !selectedItems.length}
    dirty={motivo !== '' || selectedItems.length !== pendingItems.length} onClose={onClose} onSubmit={submit} className="purchases-form-dialog">
    <p className="mb-4 text-sm text-brand-muted">Los productos seleccionados sin usar ingresarán al stock general y se retirarán del cobro de sus OT/COT. La compra, su egreso y el historial se conservan.</p>
    <fieldset disabled={!allowed || mutation.isPending}>
      {pendingItems.length > 1 && <fieldset className="mb-4 space-y-2">
        <legend className="mb-2 text-sm font-semibold text-brand-ink">Productos a enviar a stock</legend>
        {pendingItems.map((item) => {
          const orderId = item.workOrderId ?? purchase.workOrderId;
          const order = item.workOrder ?? (purchase.workOrder?.id === orderId ? purchase.workOrder : null);
          return <label key={item.id} className="flex items-start gap-2 rounded-lg border border-brand-line p-3 text-sm text-brand-ink">
            <input type="checkbox" checked={selectedIds.includes(item.id)} className="mt-0.5"
              onChange={(event) => {
                setSelectedIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id));
                setValidation('');
              }} />
            <span>{item.descripcion}<span className="mt-1 block text-xs text-brand-muted">
              Cantidad: {item.cantidad} · {order?.codigo ?? (orderId ? `OT #${orderId}` : 'Sin OT asociada')}
            </span></span>
          </label>;
        })}
        <p role="status" className="text-xs text-brand-muted">{selectedItems.length} de {pendingItems.length} productos seleccionados.</p>
      </fieldset>}
      <label className="block text-sm font-semibold text-brand-ink">Motivo
        <textarea value={motivo} onChange={(event) => setMotivo(event.target.value)} rows={3} maxLength={500}
          className="mt-2 w-full rounded-lg border border-brand-line px-3 py-2 text-sm" aria-invalid={Boolean(validation)} autoFocus />
      </label>
      {validation && <p role="alert" className="mt-2 text-sm text-brand-coralInk">{validation}</p>}
      {mutation.isError && <p role="alert" className="mt-2 text-sm text-brand-coralInk">{getApiErrorMessage(mutation.error, 'No se pudo enviar a stock. La compra sigue sin cambios.')}</p>}
      {!allowed && <p role="status" className="mt-2 text-sm text-brand-muted">La acción no está disponible con el estado o los permisos actuales.</p>}
    </fieldset>
  </FormDialog>;
}
