import { AlertTriangle, LoaderCircle, RotateCcw } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';

import { useModalOverlay } from '../../hooks/useModalOverlay';
import ModalHeader from '../common/ModalHeader';
import { WORK_ORDER_STATUS_LABELS } from './WorkOrderStatusBadge';

import type { WorkOrderStatus } from '@unithor/shared';

interface RevertStatusModalProps {
  codigo: string;
  fromStatus: WorkOrderStatus;
  toStatus: WorkOrderStatus;
  isPending: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onConfirm: (motivo: string) => void;
}

export const RevertStatusModal = ({
  codigo,
  fromStatus,
  toStatus,
  isPending,
  errorMessage,
  onClose,
  onConfirm,
}: RevertStatusModalProps) => {
  const [motivo, setMotivo] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const submit = (): void => {
    const normalizedReason = motivo.trim();
    if (normalizedReason.length < 10) {
      setValidationError('Ingrese una justificacion de al menos 10 caracteres.');
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
        aria-label="Cerrar"
        onClick={onClose}
      />
      <motion.section
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="relative w-full max-w-[540px] overflow-hidden rounded-2xl border border-brand-line bg-white shadow-2xl"
        role="dialog"
        ref={setPanelNode}
        aria-modal="true"
        aria-labelledby="revert-status-title"
      >
        <ModalHeader
          id="revert-status-title"
          badge={<RotateCcw className="h-6 w-6 stroke-[2.5]" aria-hidden="true" />}
          tone="warning"
          title={`Retroceder estado — ${codigo}`}
          description="Esta accion requiere autorizacion y justificacion administrativa. Quedara registrada en la bitacora de la orden."
          onClose={onClose}
          closeLabel="Cerrar"
        />

        <div className="px-7 pb-7 pt-2">
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
            <p className="text-sm font-semibold text-amber-800">
              Cambiando de{' '}
              <span className="font-black">{WORK_ORDER_STATUS_LABELS[fromStatus]}</span>
              {' a '}
              <span className="font-black">{WORK_ORDER_STATUS_LABELS[toStatus]}</span>
            </p>
          </div>

          <label className="block text-sm font-semibold text-brand-ink" htmlFor="revert-reason">
            Justificacion administrativa
            <span className="ml-1 text-brand-coral">*</span>
          </label>
          <p className="mt-0.5 text-xs text-brand-muted">
            Explique por que este trabajo debe retroceder de estado. Esta accion queda auditada.
          </p>
          <textarea
            id="revert-reason"
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            rows={4}
            maxLength={500}
            className="form-control mt-3 resize-none"
            placeholder="Ej. El servicio presento fallas post-entrega y debe reejecutarse..."
            autoFocus
          />
          <p className="mt-1.5 text-right text-[11px] text-brand-muted">{motivo.length}/500</p>

          {(validationError ?? errorMessage) && (
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
              Cancelar
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={submit}
              disabled={isPending || motivo.trim().length < 10}
            >
              {isPending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Confirmar retroceso
            </button>
          </div>
        </div>
      </motion.section>
    </div>
  );
};

export default RevertStatusModal;
