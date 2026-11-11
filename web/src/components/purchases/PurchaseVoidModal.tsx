import { voidPurchaseSchema } from '@unithor/shared';
import { Ban } from 'lucide-react';
import { useState } from 'react';

import { useVoidPurchaseMutation } from '../../hooks/usePurchases';
import { getApiErrorMessage, getApiFieldErrors } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';
import { formatClp } from '../../lib/formatters';
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
  const mutation = useVoidPurchaseMutation();
  const [motivo, setMotivo] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
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
      dirty={motivo !== ''}
      statusText="Esta acción no se puede deshacer."
      onClose={onClose}
      onSubmit={submit}
    >
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
    </FormDialog>
  );
};

export default PurchaseVoidModal;
