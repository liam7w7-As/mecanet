import { AlertTriangle, LoaderCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';

import { useModalOverlay } from '../../hooks/useModalOverlay';

import ModalHeader from '../common/ModalHeader';



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

  const setPanelNode = useModalOverlay({ isOpen: true, onClose });
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-4 sm:items-center sm:py-6">
      <button type="button" className="absolute inset-0 bg-brand-scrim/55" aria-label="Cerrar cancelación" onClick={onClose} />
      <motion.section
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="relative w-full max-w-[520px] rounded-lg bg-white p-6 shadow-2xl"
        role="dialog" ref={setPanelNode}
        aria-modal="true"
        aria-labelledby="cancel-work-order-title"
      >
        <ModalHeader
  id="cancel-work-order-title"
  badge={<AlertTriangle className="h-6 w-6" aria-hidden="true" />}
  tone="warning"
  title={`Cancelar ${codigo}`}
  description="Esta orden quedará en un estado terminal. El motivo se incorporará al registro operativo."
  onClose={onClose}
  closeLabel="Cerrar"
/>
        <label className="mt-5 block text-sm font-semibold text-brand-ink" htmlFor="cancellation-reason">Motivo de cancelación</label>
        <textarea
          id="cancellation-reason"
          value={motivo}
          onChange={(event) => setMotivo(event.target.value)}
          rows={4}
          maxLength={500}
          className="mt-2 w-full resize-none rounded-lg border border-brand-line px-3 py-2 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15"
          placeholder="Ej. Cliente desistió del trabajo solicitado"
          autoFocus
        />
        {(validationError || errorMessage) && <p className="mt-2 text-sm text-brand-coralInk" role="alert">{validationError ?? errorMessage}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="h-10 rounded-lg border border-brand-line px-4 text-sm font-semibold text-brand-ink hover:bg-brand-pale" onClick={onClose} disabled={isPending}>Volver</button>
          <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-coralInk px-4 text-sm font-semibold text-white hover:bg-brand-coralInk disabled:opacity-60" onClick={submit} disabled={isPending}>
            {isPending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Confirmar cancelación
          </button>
        </div>
      </motion.section>
    </div>
  );
};

export default CancelStatusModal;
