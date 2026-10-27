import { voidPurchaseSchema } from '@unithor/shared';
import { Ban, LoaderCircle } from 'lucide-react';
import { useState } from 'react';

import { useModalOverlay } from '../../hooks/useModalOverlay';
import { useVoidPurchaseMutation } from '../../hooks/usePurchases';
import { getApiErrorMessage, getApiFieldErrors } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';
import { formatClp } from '../../lib/formatters';
import { notifyError, notifySuccess } from '../../stores/toast.store';
import ModalHeader from '../common/ModalHeader';

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
  const panelRef = useModalOverlay({
    isOpen: true,
    onClose,
    isPending: mutation.isPending,
  });

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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-4 sm:items-center sm:py-6">
      <button
        type="button"
        className="fixed inset-0 bg-brand-scrim/60"
        aria-label="Cerrar anulación"
        onClick={onClose}
      />
      <section
        ref={panelRef}
        className="relative w-full max-w-lg rounded-xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchase-void-title"
      >
        <ModalHeader
          id="purchase-void-title"
          title="Anular compra"
          description={`${purchase.codigo} · ${formatClp(purchase.total)}`}
          onClose={onClose}
          badge={<Ban className="h-6 w-6" aria-hidden="true" />}
          tone="warning"
        />

        <form onSubmit={submit} className="px-7 pb-7">
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

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-coralInk px-4 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-60"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Ban className="h-4 w-4" aria-hidden="true" />
              )}
              Anular compra
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

export default PurchaseVoidModal;
