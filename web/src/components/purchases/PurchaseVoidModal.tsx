import { voidPurchaseSchema } from '@unithor/shared';
import { Ban } from 'lucide-react';
import { useState } from 'react';

import { useVoidPurchaseMutation } from '../../hooks/usePurchases';
import { getApiErrorMessage, getApiFieldErrors } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';
import { formatClp } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';
import { notifyError, notifySuccess } from '../../stores/toast.store';
import FormDialog from '../common/FormDialog';

import type { FieldErrors } from '../../lib/form-errors';
import type { Purchase } from '../../types/entities';

interface PurchaseVoidModalProps {
  purchase: Purchase;
  onClose: () => void;
  onVoided?: (purchase: Purchase) => void;
}

export const PurchaseVoidModal = ({ purchase, onClose, onVoided }: PurchaseVoidModalProps) => {
  const user = useAuthStore((state) => state.user);
  const canVoid = Boolean(user && (user.role === 'admin' || user.role === 'desarrollador') && hasUserPermission(user, 'compras', 'delete')) && purchase.estado === 'registrada';
  const mutation = useVoidPurchaseMutation();
  const [motivo, setMotivo] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!canVoid || mutation.isPending) return;
    const parsed = voidPurchaseSchema.safeParse({ motivo });
    if (!parsed.success) {
      setErrors(getFieldErrors(parsed.error.issues));
      return;
    }

    setErrors({});
    mutation.mutate(
      { purchaseId: purchase.id, motivo: parsed.data.motivo },
      {
        onSuccess: (updated) => {
          notifySuccess(`Compra ${updated.codigo} anulada correctamente.`);
          onVoided?.(updated);
          onClose();
        },
        onError: (error) => {
          setErrors(getApiFieldErrors(error));
          notifyError(getApiErrorMessage(error, 'No fue posible anular la compra.'));
        },
      },
    );
  };

  return (
    <FormDialog
      id="purchase-void-title"
      title="Anular compra"
      code={purchase.codigo}
      context={formatClp(purchase.total)}
      className="purchases-form-dialog purchases-void-dialog"
      headerVariant="plain"
      headerIcon={<Ban className="h-5 w-5" aria-hidden="true" />}
      submitLabel="Anular compra"
      pending={mutation.isPending}
      submitDisabled={!canVoid}
      dirty={motivo !== ''}
      statusText="Esta acción no se puede deshacer."
      onClose={onClose}
      onSubmit={submit}
    >
      {!canVoid && <p role="status" className="mb-3 text-sm text-brand-muted">La anulación no está disponible con el estado o los permisos actuales. Conservamos el motivo ingresado.</p>}
      <fieldset disabled={!canVoid || mutation.isPending} className="min-w-0">
          <div className="rounded-lg border border-brand-coral/30 bg-brand-coralPale px-4 py-3 text-sm text-brand-coralInk">
            <p className="font-semibold">Esta acción no se puede deshacer.</p>
            <p className="mt-1 text-xs">
              Se anulará el egreso de caja si aún está vigente. Si la compra ingresó stock, se
              intentará revertir; si ese stock ya fue consumido, la anulación fallará completa y la
              compra seguirá registrada.
            </p>
          </div>

          <label className="mt-4 block text-sm font-semibold text-brand-ink">
            Motivo de la anulación
            <textarea
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
              rows={3}
              maxLength={500}
              className="mt-2 w-full resize-y rounded-lg border border-brand-line px-3 py-2 text-sm font-normal text-brand-ink outline-none focus:border-brand-primary"
              placeholder="Explica por qué se anula la compra"
              aria-invalid={Boolean(errors.motivo)}
              autoFocus
            />
            {errors.motivo && (
              <span className="mt-1 block text-xs font-normal text-brand-coralInk">
                {errors.motivo}
              </span>
            )}
          </label>

          {mutation.isError && (
            <p className="mt-3 text-sm text-brand-coralInk" role="alert">
              {getApiErrorMessage(mutation.error, 'No fue posible anular la compra.')}
            </p>
          )}
      </fieldset>
    </FormDialog>
  );
};

export default PurchaseVoidModal;
