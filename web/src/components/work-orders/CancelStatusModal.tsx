import { AlertTriangle, LoaderCircle, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';

import { AnimateIcon } from '../animate-ui';

interface CancelStatusModalProps {
  codigo: string;
  isPending: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onConfirm: (motivo: string) => void;
}

export const CancelStatusModal = ({
  codigo,
  isPending,
  errorMessage,
  onClose,
  onConfirm,
}: CancelStatusModalProps) => {
  const [motivo, setMotivo] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const submit = (): void => {
    const normalizedReason = motivo.trim();
    if (normalizedReason.length < 2) {
      setValidationError('Ingrese un motivo de al menos 2 caracteres.');
      return;
    }

    setValidationError(null);
    onConfirm(normalizedReason);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button type="button" className="absolute inset-0 bg-slate-950/55" aria-label="Cerrar cancelación" onClick={onClose} />
      <motion.section
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="relative w-full max-w-lg rounded-lg bg-white p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-work-order-title"
      >
        <button type="button" className="group absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Cerrar">
          <AnimateIcon icon={X} animation="spin" size={16} />
        </button>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-700">
          <AnimateIcon icon={AlertTriangle} animation="bounce" size={20} />
        </div>
        <h2 id="cancel-work-order-title" className="mt-4 text-xl font-bold text-brand-blue">Cancelar {codigo}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Esta orden quedará en un estado terminal. El motivo se incorporará al registro operativo.</p>
        <label className="mt-5 block text-sm font-semibold text-slate-700" htmlFor="cancellation-reason">Motivo de cancelación</label>
        <textarea
          id="cancellation-reason"
          value={motivo}
          onChange={(event) => setMotivo(event.target.value)}
          rows={4}
          maxLength={500}
          className="mt-2 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
          placeholder="Ej. Cliente desistió del trabajo solicitado"
          autoFocus
        />
        {(validationError || errorMessage) && <p className="mt-2 text-sm text-red-700" role="alert">{validationError ?? errorMessage}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={onClose} disabled={isPending}>Volver</button>
          <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60" onClick={submit} disabled={isPending}>
            {isPending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Confirmar cancelación
          </button>
        </div>
      </motion.section>
    </div>
  );
};

export default CancelStatusModal;
