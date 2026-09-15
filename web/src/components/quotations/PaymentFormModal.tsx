import { PAYMENT_METHODS, createPaymentSchema } from '@unithor/shared';
import { AlertCircle, Banknote, LoaderCircle, X } from 'lucide-react';
import { useState } from 'react';

import { useCreatePaymentMutation } from '../../hooks/usePayments';
import { getApiErrorMessage } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';
import { formatClp } from '../../lib/formatters';

import type { PaymentMethod } from '@unithor/shared';

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

export const PaymentFormModal = ({ quotationId, codigo, saldoPendiente, onClose }: PaymentFormModalProps) => {
  const createMutation = useCreatePaymentMutation();
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState<PaymentMethod>('efectivo');
  const [fecha, setFecha] = useState(toLocalDateTime(new Date()));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    createMutation.reset();
    const numericAmount = Number(monto);

    if (numericAmount > saldoPendiente) {
      setErrors({ monto: `El abono no puede superar el saldo pendiente de ${formatClp(saldoPendiente)}.` });
      return;
    }

    const result = createPaymentSchema.safeParse({
      quotationId,
      monto,
      metodo,
      fecha: fecha ? new Date(fecha).toISOString() : undefined,
    });

    if (!result.success) {
      setErrors(getFieldErrors(result.error.issues));
      return;
    }

    setErrors({});
    createMutation.mutate(result.data, { onSuccess: onClose });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button type="button" className="absolute inset-0 bg-slate-950/55" aria-label="Cerrar registro de abono" onClick={onClose} />
      <section className="relative w-full max-w-lg rounded-lg bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="payment-modal-title">
        <button type="button" className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Cerrar"><X className="h-4 w-4" aria-hidden="true" /></button>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-yellow text-brand-dark"><Banknote className="h-5 w-5" aria-hidden="true" /></div>
        <h2 id="payment-modal-title" className="mt-4 text-xl font-bold text-brand-blue">Registrar abono</h2>
        <p className="mt-1 text-sm text-slate-500">{codigo}</p>
        <div className="mt-4 border-l-4 border-brand-yellow bg-brand-light px-4 py-3"><p className="text-xs font-semibold uppercase text-slate-500">Saldo máximo permitido</p><p className="mt-1 text-xl font-bold text-brand-blue">{formatClp(saldoPendiente)}</p></div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block text-sm font-semibold text-slate-700">Monto del abono<input type="number" min="1" step="1" value={monto} onChange={(event) => setMonto(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15" placeholder="0" autoFocus />{errors.monto && <span className="mt-1 block text-xs font-normal text-red-700" role="alert">{errors.monto}</span>}</label>
          <label className="block text-sm font-semibold text-slate-700">Método de pago<select value={metodo} onChange={(event) => setMetodo(event.target.value as PaymentMethod)} className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal outline-none focus:border-brand-blue">{PAYMENT_METHODS.map((method) => <option key={method} value={method}>{PAYMENT_METHOD_LABELS[method]}</option>)}</select></label>
          <label className="block text-sm font-semibold text-slate-700">Fecha y hora<input type="datetime-local" value={fecha} onChange={(event) => setFecha(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-brand-blue" /></label>
          {createMutation.isError && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{getApiErrorMessage(createMutation.error)}</div>}
          <div className="flex justify-end gap-2 pt-2"><button type="button" className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700" onClick={onClose}>Cancelar</button><button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={createMutation.isPending}>{createMutation.isPending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}Registrar abono</button></div>
        </form>
      </section>
    </div>
  );
};

export default PaymentFormModal;
