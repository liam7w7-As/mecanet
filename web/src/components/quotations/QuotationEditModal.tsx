import { updateQuotationSchema } from '@unithor/shared';
import { AlertCircle, LoaderCircle, Save, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';

import { AnimateIcon } from '../animate-ui';
import { useUpdateQuotationMutation } from '../../hooks/useQuotations';
import { getApiErrorMessage } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';
import WorkOrderItemsEditor, { createEmptyWorkOrderItem } from '../work-orders/WorkOrderItemsEditor';

import type { Quotation } from '../../types/entities';
import type { EditableWorkOrderItem } from '../work-orders/WorkOrderItemsEditor';

const toEditableItems = (quotation: Quotation): EditableWorkOrderItem[] =>
  quotation.items?.map((item) => ({
    ...createEmptyWorkOrderItem(),
    catalogItemId: item.catalogItemId,
    descripcion: item.descripcion,
    cantidad: String(item.cantidad),
    precioUnitario: String(item.precioUnitario),
    estadoOperativo: item.estadoOperativo,
    notasOperativas: item.notasOperativas ?? '',
  })) ?? [];

interface QuotationEditModalProps {
  quotation: Quotation;
  onClose: () => void;
}

export const QuotationEditModal = ({ quotation, onClose }: QuotationEditModalProps) => {
  const updateMutation = useUpdateQuotationMutation();
  const [notas, setNotas] = useState(quotation.notas ?? '');
  const [items, setItems] = useState<EditableWorkOrderItem[]>(() => toEditableItems(quotation));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    updateMutation.reset();
    const result = updateQuotationSchema.safeParse({
      notas,
      items: items.map((item) => ({
        catalogItemId: item.catalogItemId,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        estadoOperativo: item.estadoOperativo,
        notasOperativas: item.notasOperativas,
      })),
    });

    if (!result.success) {
      setErrors(getFieldErrors(result.error.issues));
      return;
    }

    setErrors({});
    updateMutation.mutate({ id: quotation.id, data: result.data }, { onSuccess: onClose });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 px-4 py-8">
      <motion.section
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="relative mx-auto w-full max-w-5xl rounded-lg bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-quotation-title"
      >
        <header className="flex items-start justify-between border-b border-slate-200 p-5">
          <div>
            <p className="text-sm text-slate-500">{quotation.codigo}</p>
            <h2 id="edit-quotation-title" className="mt-1 text-xl font-bold text-brand-blue">Editar cotización</h2>
          </div>
          <button type="button" className="group flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Cerrar">
            <AnimateIcon icon={X} animation="spin" size={16} />
          </button>
        </header>
        <form onSubmit={submit}>
          <div className="p-5">
            <label className="block text-sm font-semibold text-slate-700">Notas comerciales<textarea rows={4} value={notas} onChange={(event) => setNotas(event.target.value)} className="mt-2 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-brand-blue" /></label>
            <div className="mt-5"><WorkOrderItemsEditor items={items} onChange={setItems} errors={errors} title="Ítems cotizados" description="Actualice servicios, repuestos o conceptos libres." emptyMessage="La cotización quedará sin ítems y con total cero." totalLabel="Nuevo total" totalTestId="quotation-edit-total" /></div>
          </div>
          {updateMutation.isError && <div className="mx-5 mb-5 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{getApiErrorMessage(updateMutation.error)}</div>}
          <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4">
            <button type="button" className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={onClose}>Cancelar</button>
            <button type="submit" className="group inline-flex h-10 items-center gap-2 rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white transition-all hover:bg-brand-dark active:scale-95 disabled:opacity-60" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <AnimateIcon icon={Save} animation="bounce" size={16} />}
              Guardar cambios
            </button>
          </footer>
        </form>
      </motion.section>
    </div>
  );
};

export default QuotationEditModal;
