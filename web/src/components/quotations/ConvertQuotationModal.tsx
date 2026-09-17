import { convertQuotationToWorkOrderSchema } from '@unithor/shared';
import { AlertCircle, ArrowRight, LoaderCircle, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';

import { AnimateIcon } from '../animate-ui';
import { useConvertToWorkOrderMutation } from '../../hooks/useQuotations';
import { getApiErrorMessage } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';

interface ConvertQuotationModalProps {
  quotationId: number;
  codigo: string;
  notas: string | null;
  onClose: () => void;
  onConverted: (workOrderId: number) => void;
}

export const ConvertQuotationModal = ({ quotationId, codigo, notas, onClose, onConverted }: ConvertQuotationModalProps) => {
  const conversionMutation = useConvertToWorkOrderMutation();
  const [kilometraje, setKilometraje] = useState('');
  const [descripcion, setDescripcion] = useState(notas ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    conversionMutation.reset();
    const result = convertQuotationToWorkOrderSchema.safeParse({
      kilometrajeIngreso: kilometraje === '' ? null : kilometraje,
      descripcion,
    });

    if (!result.success) {
      setErrors(getFieldErrors(result.error.issues));
      return;
    }

    setErrors({});
    conversionMutation.mutate(
      { id: quotationId, data: result.data },
      { onSuccess: ({ workOrder }) => onConverted(workOrder.id) },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button type="button" className="absolute inset-0 bg-slate-950/55" aria-label="Cerrar conversión" onClick={onClose} />
      <motion.section
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="relative w-full max-w-lg rounded-lg bg-white p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="convert-title"
      >
        <button type="button" className="group absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Cerrar">
          <AnimateIcon icon={X} animation="spin" size={16} />
        </button>
        <h2 id="convert-title" className="text-xl font-bold text-brand-blue">Convertir {codigo} en OT</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Se copiarán el cliente, vehículo e ítems a una nueva Orden de Trabajo en estado borrador.</p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block text-sm font-semibold text-slate-700">Kilometraje de entrada <span className="font-normal text-slate-400">(opcional)</span><input type="number" min="0" step="1" value={kilometraje} onChange={(event) => setKilometraje(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-brand-blue" placeholder="0" />{errors.kilometrajeIngreso && <span className="mt-1 block text-xs font-normal text-red-700">{errors.kilometrajeIngreso}</span>}</label>
          <label className="block text-sm font-semibold text-slate-700">Descripción para la OT<textarea rows={4} value={descripcion} onChange={(event) => setDescripcion(event.target.value)} className="mt-2 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-brand-blue" placeholder="Motivo de ingreso o trabajo aprobado" /></label>
          {conversionMutation.isError && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{getApiErrorMessage(conversionMutation.error)}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={onClose}>Cancelar</button>
            <button type="submit" className="group inline-flex h-10 items-center gap-2 rounded-lg bg-brand-yellow px-4 text-sm font-bold text-brand-dark transition-all hover:bg-yellow-400 active:scale-95 disabled:opacity-60" disabled={conversionMutation.isPending}>
              {conversionMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <AnimateIcon icon={ArrowRight} animation="slide-right" size={16} />}
              Crear Orden de Trabajo
            </button>
          </div>
        </form>
      </motion.section>
    </div>
  );
};

export default ConvertQuotationModal;
