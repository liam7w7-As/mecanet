import { completeExpressExpenseSchema, expressMinimumSale } from '@unithor/shared';
import { Link2, Paperclip } from 'lucide-react';
import { useState } from 'react';

import ExpressOrderPicker from './ExpressOrderPicker';
import { useCompleteExpressExpense } from '../../hooks/usePurchasesExpress';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';
import { notifySuccess } from '../../stores/toast.store';
import CurrencyInput from '../common/CurrencyInput';
import FormDialog from '../common/FormDialog';

import type { Purchase } from '../../types/entities';
import type { ExpressOrderOption } from '@unithor/shared';
import type { FormEvent } from 'react';

export default function CompleteExpressExpenseModal({
  purchase,
  onClose,
}: {
  purchase: Purchase;
  onClose: () => void;
}) {
  const user = useAuthStore((state) => state.user);
  const canUpdate = Boolean(
    user &&
    (user.role === 'admin' || user.id === purchase.createdBy) &&
    hasUserPermission(user, 'compras', 'update'),
  );
  const initialDetail = purchase.observaciones ?? '';
  const minimumSale = Math.ceil(expressMinimumSale(purchase.total));
  const [detail, setDetail] = useState(initialDetail);
  const [order, setOrder] = useState<ExpressOrderOption | null>(null);
  const [searching, setSearching] = useState(false);
  const [charge, setCharge] = useState(false);
  const [sale, setSale] = useState(String(minimumSale));
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const mutation = useCompleteExpressExpense();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canUpdate || mutation.isPending) return;
    setError('');
    if (charge && Number(sale) < minimumSale) {
      setError(`La venta mínima es ${formatClp(minimumSale)}.`);
      return;
    }
    const parsed = completeExpressExpenseSchema.safeParse({
      detalle: detail.trim() || null,
      workOrderId: order?.id,
      ventaUnitario: charge ? sale : undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los datos.');
      return;
    }
    mutation.mutate(
      { id: purchase.id, data: parsed.data, file },
      {
        onSuccess: () => {
          notifySuccess('Datos de la compra guardados.');
          onClose();
        },
        onError: (failure) =>
          setError(getApiErrorMessage(failure, 'No se pudieron guardar los datos.')),
      },
    );
  };

  return (
    <FormDialog
      id="complete-expense-title"
      title="Completar datos"
      code={purchase.codigo}
      context={formatClp(purchase.total)}
      headerVariant="plain"
      className="purchases-form-dialog"
      headerIcon={<Link2 aria-hidden="true" />}
      submitLabel="Guardar datos"
      pending={mutation.isPending}
      submitDisabled={!canUpdate || (detail.trim() === initialDetail.trim() && !order && !file)}
      dirty={detail !== initialDetail || Boolean(order || file)}
      onClose={onClose}
      onSubmit={submit}
    >
      <fieldset className="purchases-express" disabled={!canUpdate}>
        {!canUpdate && (
          <p role="alert" className="express-error">
            Ya no tienes permiso para actualizar esta compra.
          </p>
        )}
        <div className="grid gap-2">
          {order ? (
            <div className="express-selected-order">
              <div>
                <strong>{order.codigo}</strong>
                <span>
                  {order.patente} · {order.vehiculo}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOrder(null);
                  setCharge(false);
                }}
              >
                Quitar OT
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="secondary-button w-fit"
              onClick={() => setSearching(!searching)}
            >
              <Link2 className="h-4 w-4" aria-hidden="true" />
              {searching ? 'Cerrar búsqueda' : 'Vincular a una OT'}
            </button>
          )}
          {searching && !order && (
            <ExpressOrderPicker
              completion
              onSelect={(next) => {
                setOrder(next);
                setSearching(false);
              }}
            />
          )}
        </div>
        {order && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={charge}
              onChange={(event) => setCharge(event.target.checked)}
            />{' '}
            Agregar cobro a la OT y su cotización
          </label>
        )}
        {charge && (
          <label className="block text-sm">
            Precio de venta con IVA
            <CurrencyInput value={sale} onChange={setSale} allowDecimals />
            <small>Mínimo: {formatClp(minimumSale)}</small>
          </label>
        )}
        <label className="block text-sm">
          Detalle <span className="text-brand-muted">· Opcional</span>
          <textarea
            className="mt-1"
            value={detail}
            maxLength={1000}
            rows={3}
            onChange={(event) => setDetail(event.target.value)}
          />
        </label>
        <div className="express-expense-receipt">
          <label className="express-gallery">
            <Paperclip aria-hidden="true" />
            {purchase.comprobanteSizeBytes || file ? 'Cambiar comprobante' : 'Adjuntar comprobante'}
            <input
              type="file"
              className="sr-only"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(event) => {
                const next = event.target.files?.[0];
                event.target.value = '';
                if (!next) return;
                if (
                  !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(
                    next.type,
                  ) ||
                  next.size > 8 * 1024 * 1024 ||
                  next.size === 0
                ) {
                  setError('Usa una imagen JPG, PNG o WebP, o un PDF de hasta 8 MB.');
                  return;
                }
                setError('');
                setFile(next);
              }}
            />
          </label>
          {file && (
            <>
              <span>{file.name}</span>
              <button type="button" onClick={() => setFile(null)}>
                Quitar
              </button>
            </>
          )}
        </div>
        {error && (
          <p role="alert" className="express-error">
            {error}
          </p>
        )}
      </fieldset>
    </FormDialog>
  );
}
