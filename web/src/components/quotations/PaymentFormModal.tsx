import { PAYMENT_BANKS, PAYMENT_METHODS, createPaymentSchema } from '@unithor/shared';
import { AlertCircle, Banknote, LoaderCircle, Pencil, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';

import PaymentWorkSummary from './PaymentWorkSummary';
import { useCreatePaymentMutation, useQuotationPayments } from '../../hooks/usePayments';
import { useQuotation } from '../../hooks/useQuotations';
import { getApiErrorMessage } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';
import { formatClp, formatDateTime } from '../../lib/formatters';
import { notifyError, notifySuccess } from '../../stores/toast.store';
import { AnimateIcon } from '../animate-ui';
import CurrencyInput from '../common/CurrencyInput';

import type { PaymentBank, PaymentMethod } from '@unithor/shared';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta_debito: 'Tarjeta de débito',
  tarjeta_credito: 'Tarjeta de crédito',
  cheque: 'Cheque',
  otro: 'Otro',
};

const toLocalDateTime = (date: Date): string => {
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 16);
};

interface PaymentFormModalProps {
  quotationId: number;
  codigo: string;
  saldoPendiente: number;
  onClose: () => void;
}

export const PaymentFormModal = ({
  quotationId,
  codigo,
  saldoPendiente,
  onClose,
}: PaymentFormModalProps) => {
  const createMutation = useCreatePaymentMutation();
  const quotationQuery = useQuotation(quotationId);
  const paymentsQuery = useQuotationPayments(quotationId);
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState<PaymentMethod>('efectivo');
  const [fecha, setFecha] = useState(() => toLocalDateTime(new Date()));
  const [editingDate, setEditingDate] = useState(false);
  const [referencia, setReferencia] = useState('');
  const [bancoOrigen, setBancoOrigen] = useState<PaymentBank>('Banco de Chile');
  const [numeroTransaccion, setNumeroTransaccion] = useState('');
  const [comprobantePago, setComprobantePago] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const summary = paymentsQuery.data;
  const pendingAmount = (summary?.payments ?? []).reduce(
    (total, payment) =>
      payment.estado === 'por_verificar' ? total + Number(payment.monto) : total,
    0,
  );
  const availableBalance = summary
    ? Math.max(0, summary.saldoPendiente - pendingAmount)
    : saldoPendiente;
  const numericAmount = Number(monto) || 0;
  const validAmount = numericAmount > 0 && numericAmount <= availableBalance;
  const projectedBalance = Math.max(0, (summary?.saldoPendiente ?? saldoPendiente) - numericAmount);
  const loadingSummary = quotationQuery.isPending || paymentsQuery.isPending;
  const summaryError = quotationQuery.isError || paymentsQuery.isError;

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (loadingSummary || summaryError || createMutation.isPending) return;
    createMutation.reset();
    const numericAmount = Number(monto);

    if (numericAmount > availableBalance) {
      setErrors({
        monto: `El abono no puede superar el saldo pendiente de ${formatClp(availableBalance)}.`,
      });
      return;
    }

    const paymentDate = new Date(fecha);
    if (Number.isNaN(paymentDate.getTime())) {
      setErrors({ fecha: 'Ingrese una fecha y hora válidas.' });
      return;
    }

    const result = createPaymentSchema.safeParse({
      quotationId,
      monto,
      metodo,
      referencia: metodo === 'transferencia' ? referencia : undefined,
      bancoOrigen: metodo === 'transferencia' ? bancoOrigen : undefined,
      numeroTransaccion: numeroTransaccion || undefined,
      comprobantePago: comprobantePago || undefined,
      fecha: paymentDate.toISOString(),
    });

    if (!result.success) {
      setErrors(getFieldErrors(result.error.issues));
      return;
    }

    setErrors({});
    const paymentPayload = receiptFile ? new FormData() : result.data;

    if (paymentPayload instanceof FormData && receiptFile) {
      Object.entries(result.data).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          paymentPayload.append(key, String(value));
        }
      });
      paymentPayload.set('comprobantePago', receiptFile);
    }

    createMutation.mutate(paymentPayload, {
      onSuccess: () => {
        notifySuccess(
          metodo === 'transferencia'
            ? `Transferencia de ${formatClp(numericAmount)} enviada a verificación.`
            : `Abono de ${formatClp(numericAmount)} registrado.`,
        );
        onClose();
      },
      onError: (error) => notifyError(getApiErrorMessage(error, 'No se pudo registrar el abono.')),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-4 sm:items-center sm:py-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/55"
        aria-label="Cerrar registro de abono"
        onClick={onClose}
      />
      <motion.section
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-5xl overflow-y-auto rounded-lg bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-modal-title"
      >
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <button
            type="button"
            className="group absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <AnimateIcon icon={X} animation="spin" size={16} />
          </button>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-yellow text-brand-dark">
            <AnimateIcon icon={Banknote} animation="bounce" size={20} />
          </div>
          <div className="min-w-0 pr-8">
            <h2 id="payment-modal-title" className="text-xl font-bold text-brand-blue">
              Registrar abono
            </h2>
            <p className="mt-1 font-mono text-xs text-slate-500">{codigo}</p>
          </div>
        </header>

        <div className="grid min-w-0 md:grid-cols-2">
          <div className="min-w-0 border-b border-slate-200 bg-slate-50/60 p-5 sm:p-6 md:border-b-0 md:border-r">
            {loadingSummary ? (
              <div role="status" className="min-h-48 animate-pulse space-y-4">
                <span className="sr-only">Cargando trabajos y saldo</span>
                <div className="h-5 w-2/3 rounded bg-slate-200" />
                <div className="h-20 rounded bg-slate-200" />
                <div className="h-24 rounded bg-slate-200" />
              </div>
            ) : summaryError ? (
              <div role="alert" className="text-sm text-red-700">
                <p>No se pudieron cargar los trabajos y el saldo actualizado.</p>
                <button
                  type="button"
                  className="mt-3 font-semibold underline"
                  onClick={() => {
                    void quotationQuery.refetch();
                    void paymentsQuery.refetch();
                  }}
                >
                  Reintentar
                </button>
              </div>
            ) : (
              quotationQuery.data &&
              summary && (
                <PaymentWorkSummary
                  quotation={quotationQuery.data}
                  summary={summary}
                  pendingAmount={pendingAmount}
                />
              )
            )}
          </div>

          <form onSubmit={submit} className="min-w-0 space-y-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-brand-yellow bg-brand-light px-4 py-3">
              <div>
                <p className="text-xs font-semibold text-slate-500">Disponible para abonar</p>
                <p
                  className="mt-1 text-xl font-bold text-brand-blue"
                  data-testid="payment-available-balance"
                >
                  {loadingSummary || summaryError ? '—' : formatClp(availableBalance)}
                </p>
              </div>
              <button
                type="button"
                disabled={loadingSummary || summaryError || availableBalance <= 0}
                className="text-xs font-bold text-brand-blue underline underline-offset-4 disabled:opacity-40"
                onClick={() => {
                  setMonto(String(availableBalance));
                  setErrors({});
                }}
              >
                Completar saldo
              </button>
            </div>
            <label className="block text-sm font-semibold text-slate-700">
              Monto del abono
              <CurrencyInput
                value={monto}
                onChange={setMonto}
                className="mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
                placeholder="0"
                autoFocus
                aria-invalid={Boolean(errors.monto)}
              />
              {errors.monto && (
                <span className="mt-1 block text-xs font-normal text-red-700" role="alert">
                  {errors.monto}
                </span>
              )}
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Método de pago
              <select
                value={metodo}
                onChange={(event) => setMetodo(event.target.value as PaymentMethod)}
                className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal outline-none focus:border-brand-blue"
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {PAYMENT_METHOD_LABELS[method]}
                  </option>
                ))}
              </select>
            </label>
            {validAmount && summary && (
              <div
                className="flex flex-wrap items-center justify-between gap-2 border-y border-slate-200 py-3"
                aria-live="polite"
              >
                <span className="text-xs text-slate-500">
                  {metodo === 'transferencia'
                    ? 'Saldo al confirmar esta transferencia'
                    : 'Saldo tras este abono'}
                </span>
                <strong
                  className="text-base text-brand-blue"
                  data-testid="payment-projected-balance"
                >
                  {formatClp(projectedBalance)}
                </strong>
              </div>
            )}
            {metodo === 'transferencia' && (
              <div className="space-y-3 border-l-4 border-amber-400 bg-amber-50 px-4 py-3">
                <p className="text-sm text-amber-900">
                  La transferencia quedará pendiente hasta que Finanzas confirme su recepción.
                </p>
                <label className="block text-sm font-semibold text-slate-700">
                  Banco de origen
                  <select
                    value={bancoOrigen}
                    onChange={(event) => setBancoOrigen(event.target.value as PaymentBank)}
                    className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal outline-none focus:border-brand-blue"
                  >
                    {PAYMENT_BANKS.map((bank) => (
                      <option key={bank} value={bank}>
                        {bank}
                      </option>
                    ))}
                  </select>
                  {errors.bancoOrigen && (
                    <span className="mt-1 block text-xs font-normal text-red-700" role="alert">
                      {errors.bancoOrigen}
                    </span>
                  )}
                </label>
              </div>
            )}
            <div className="space-y-3 border-t border-slate-200 pt-4">
              <label className="block text-sm font-semibold text-slate-700">
                Número de transacción
                <input
                  value={numeroTransaccion}
                  onChange={(event) => setNumeroTransaccion(event.target.value)}
                  maxLength={80}
                  aria-required={metodo === 'transferencia'}
                  className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal outline-none focus:border-brand-blue"
                  placeholder="Ej. TRX-123456"
                />
                {errors.numeroTransaccion && (
                  <span className="mt-1 block text-xs font-normal text-red-700" role="alert">
                    {errors.numeroTransaccion}
                  </span>
                )}
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Comprobante de pago
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  aria-required={metodo === 'transferencia'}
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setReceiptFile(file);
                    setComprobantePago(file?.name ?? '');
                  }}
                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-blue file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-dark"
                />
                {comprobantePago && (
                  <span className="mt-1 block text-xs font-normal text-slate-600">
                    {comprobantePago}
                  </span>
                )}
                {errors.comprobantePago && (
                  <span className="mt-1 block text-xs font-normal text-red-700" role="alert">
                    {errors.comprobantePago}
                  </span>
                )}
              </label>
              {metodo !== 'transferencia' && (
                <p className="text-xs text-slate-500">
                  Número y comprobante opcionales para este método de pago.
                </p>
              )}
            </div>
            {metodo === 'transferencia' && (
              <label className="block text-sm font-semibold text-slate-700">
                Referencia interna opcional
                <input
                  value={referencia}
                  onChange={(event) => setReferencia(event.target.value)}
                  maxLength={120}
                  className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal outline-none focus:border-brand-blue"
                  placeholder="Observación corta para caja o finanzas"
                />
              </label>
            )}
            {editingDate ? (
              <label className="block text-sm font-semibold text-slate-700">
                Fecha del abono
                <input
                  type="datetime-local"
                  value={fecha}
                  onChange={(event) => setFecha(event.target.value)}
                  required
                  aria-invalid={Boolean(errors.fecha)}
                  className="mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-brand-blue"
                />
                {errors.fecha && (
                  <span className="mt-1 block text-xs text-red-700" role="alert">
                    {errors.fecha}
                  </span>
                )}
              </label>
            ) : (
              <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500">Fecha del abono</p>
                  <time dateTime={fecha} className="text-sm font-semibold text-slate-700">
                    {formatDateTime(fecha)}
                  </time>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingDate(true)}
                  title="Cambiar fecha del abono"
                  aria-label="Cambiar fecha del abono"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
            {createMutation.isError && (
              <div
                className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                role="alert"
              >
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {getApiErrorMessage(createMutation.error)}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700"
                onClick={onClose}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white disabled:opacity-60"
                disabled={
                  createMutation.isPending ||
                  loadingSummary ||
                  summaryError ||
                  availableBalance <= 0
                }
              >
                {createMutation.isPending && (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                )}
                Registrar abono
              </button>
            </div>
          </form>
        </div>
      </motion.section>
    </div>
  );
};

export default PaymentFormModal;
