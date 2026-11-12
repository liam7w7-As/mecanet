import { PAYMENT_METHODS, registerPurchasePaymentSchema } from '@unithor/shared';
import { WalletCards } from 'lucide-react';
import { useState } from 'react';

import { useRegisterPurchasePaymentMutation } from '../../hooks/usePurchases';
import { getApiErrorMessage, getApiFieldErrors } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';
import { formatClp } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { PAYMENT_METHOD_LABELS } from '../../lib/purchase-labels';
import { useAuthStore } from '../../stores/auth.store';
import { notifyError, notifySuccess } from '../../stores/toast.store';
import FormDialog from '../common/FormDialog';

import type { FieldErrors } from '../../lib/form-errors';
import type { Purchase } from '../../types/entities';
import type { PaymentMethod } from '@unithor/shared';

interface PurchasePaymentModalProps {
  purchase: Purchase;
  onClose: () => void;
  onPaid?: (purchase: Purchase) => void;
}

const fieldClassName =
  'mt-1.5 h-10 w-full rounded-lg border border-brand-line px-3 text-sm font-normal text-brand-ink outline-none focus:border-brand-primary';

export const PurchasePaymentModal = ({
  purchase,
  onClose,
  onPaid,
}: PurchasePaymentModalProps) => {
  const user = useAuthStore((state) => state.user);
  const canPay = Boolean(user && hasUserPermission(user, 'compras', 'update')) && purchase.estado === 'registrada' && purchase.formaPago === 'credito' && !purchase.pagadoAt && !purchase.cashMovementId;
  const mutation = useRegisterPurchasePaymentMutation();
  const [metodo, setMetodo] = useState<PaymentMethod>('transferencia');
  const [referencia, setReferencia] = useState('');
  const [banco, setBanco] = useState('');
  const [numeroOperacion, setNumeroOperacion] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!canPay || mutation.isPending) return;
    const parsed = registerPurchasePaymentSchema.safeParse({
      metodo,
      referencia: referencia.trim() || null,
      banco: banco.trim() || null,
      numeroOperacion: numeroOperacion.trim() || null,
    });

    if (!parsed.success) {
      setErrors(getFieldErrors(parsed.error.issues));
      return;
    }

    setErrors({});
    mutation.mutate(
      { purchaseId: purchase.id, data: parsed.data },
      {
        onSuccess: (updated) => {
          notifySuccess(`Pago de ${updated.codigo} registrado y egreso generado.`);
          onPaid?.(updated);
          onClose();
        },
        onError: (error) => {
          setErrors(getApiFieldErrors(error));
          notifyError(getApiErrorMessage(error, 'No fue posible registrar el pago.'));
        },
      },
    );
  };

  return (
    <FormDialog
      id="purchase-payment-title"
      title="Pagar compra a crédito"
      code={purchase.codigo}
      context={purchase.supplier.nombre}
      className="purchases-form-dialog purchases-payment-dialog"
      headerVariant="plain"
      headerIcon={<WalletCards className="h-5 w-5" aria-hidden="true" />}
      submitLabel="Registrar pago total"
      pending={mutation.isPending}
      submitDisabled={!canPay}
      dirty={metodo !== 'transferencia' || Boolean(referencia || banco || numeroOperacion)}
      statusText="El pago es total y genera un egreso de caja."
      onClose={onClose}
      onSubmit={submit}
    >
      {!canPay && <p role="status" className="mb-3 text-sm text-brand-muted">El pago no está disponible con el estado o los permisos actuales. Conservamos los datos ingresados.</p>}
      <fieldset disabled={!canPay || mutation.isPending} className="min-w-0">
          <div className="rounded-lg border border-brand-line bg-brand-pale/60 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">
              Total a pagar
            </p>
            <p className="mt-1 text-2xl font-bold text-brand-primaryInk">
              {formatClp(purchase.total)}
            </p>
            <p className="mt-1 text-xs text-brand-muted">
              El pago es total y genera un egreso de caja por este monto.
            </p>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-brand-ink">
              Método de pago
              <select
                value={metodo}
                onChange={(event) => setMetodo(event.target.value as PaymentMethod)}
                className={fieldClassName}
                aria-invalid={Boolean(errors.metodo)}
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {PAYMENT_METHOD_LABELS[method]}
                  </option>
                ))}
              </select>
              {errors.metodo && (
                <span className="mt-1 block text-xs font-normal text-brand-coralInk">
                  {errors.metodo}
                </span>
              )}
            </label>

            <label className="block text-sm font-semibold text-brand-ink">
              Referencia
              <input
                value={referencia}
                onChange={(event) => setReferencia(event.target.value)}
                className={fieldClassName}
                placeholder="N.º de transferencia o cheque"
                maxLength={120}
              />
            </label>

            <label className="block text-sm font-semibold text-brand-ink">
              Banco
              <input
                value={banco}
                onChange={(event) => setBanco(event.target.value)}
                className={fieldClassName}
                placeholder="Banco de la operación"
                maxLength={80}
              />
            </label>

            <label className="block text-sm font-semibold text-brand-ink">
              N.º de operación
              <input
                value={numeroOperacion}
                onChange={(event) => setNumeroOperacion(event.target.value)}
                className={fieldClassName}
                placeholder="N.º de depósito u operación"
                maxLength={80}
              />
            </label>
          </div>

          {mutation.isError && (
            <p className="mt-3 text-sm text-brand-coralInk" role="alert">
              {getApiErrorMessage(mutation.error, 'No fue posible registrar el pago.')}
            </p>
          )}
      </fieldset>
    </FormDialog>
  );
};

export default PurchasePaymentModal;
