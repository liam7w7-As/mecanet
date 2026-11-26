import { voidPurchaseSchema } from '@unithor/shared';
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
  const allowed = Boolean(user && ['jefe', 'admin', 'desarrollador'].includes(user.role) && hasUserPermission(user, 'compras', 'update'))
    && Boolean(purchase.express) && purchase.estado === 'registrada' && purchase.items.some((item) => !item.stockReturnedAt);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!allowed || mutation.isPending) return;
    const parsed = voidPurchaseSchema.safeParse({ motivo });
    if (!parsed.success) { setValidation(parsed.error.issues[0].message); return; }
    setValidation('');
    mutation.mutate({ purchaseId: purchase.id, motivo: parsed.data.motivo }, {
      onSuccess: () => { notifySuccess('Accesorio enviado al stock general. La compra y su egreso se conservan.'); onClose(); },
    });
  };
  return <FormDialog id="purchase-stock-return-title" title="Enviar a stock general" code={purchase.codigo}
    headerVariant="plain" headerIcon={<Boxes className="h-5 w-5" aria-hidden="true" />}
    submitLabel="Enviar a stock general" pending={mutation.isPending} submitDisabled={!allowed}
    dirty={motivo !== ''} onClose={onClose} onSubmit={submit} className="purchases-form-dialog">
    <p className="mb-4 text-sm text-brand-muted">El accesorio sin usar ingresará al stock general y se retirará del cobro de la OT/COT. La compra, su egreso y el historial se conservan.</p>
    <fieldset disabled={!allowed || mutation.isPending}>
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
