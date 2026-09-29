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
      <button
        type="button"
        className="fixed inset-0 bg-[#18273c55] backdrop-blur-sm transition-opacity"
        aria-label="Cerrar cancelación"
        onClick={onClose}
      />
      <motion.section
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="relative w-full max-w-[520px] overflow-hidden rounded-2xl border border-brand-line bg-white shadow-2xl"
        role="dialog"
        ref={setPanelNode}
        aria-modal="true"
        aria-labelledby="cancel-work-order-title"
      >
        <ModalHeader
          id="cancel-work-order-title"
          badge={<AlertTriangle className="h-6 w-6 stroke-[2.5]" aria-hidden="true" />}
          tone="warning"
          title={`Cancelar ${codigo}`}
          description="Esta orden quedará en un estado terminal. El motivo se incorporará al registro operativo."
          onClose={onClose}
          closeLabel="Cerrar"
        />
        <div className="px-7 pb-7 pt-2">
          <label className="block text-sm font-semibold text-brand-ink" htmlFor="cancellation-reason">
            Motivo de cancelación
          </label>
          <textarea
            id="cancellation-reason"
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            rows={4}
            maxLength={500}
            className="form-control mt-2 resize-none"
            placeholder="Ej. Cliente desistió del trabajo solicitado"
            autoFocus
          />
          {(validationError || errorMessage) && (
            <p className="mt-2 text-sm text-brand-coralInk" role="alert">
              {validationError ?? errorMessage}
            </p>
          )}
          <div className="dialog-buttons mt-6">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={isPending}
            >
              Volver
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={submit}
              disabled={isPending}
            >
              {isPending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Confirmar cancelación
            </button>
          </div>
        </div>
      </motion.section>
    </div>
  );
};

export default CancelStatusModal;
