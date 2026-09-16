import { updateWorkOrderSchema } from '@unithor/shared';
import { AlertCircle, LoaderCircle, Save, X } from 'lucide-react';
import { useState } from 'react';

import WorkOrderItemsEditor, { createEmptyWorkOrderItem } from './WorkOrderItemsEditor';
import { useUpdateWorkOrderMutation } from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';

import type { EditableWorkOrderItem } from './WorkOrderItemsEditor';
import type { WorkOrder } from '../../types/entities';

interface WorkOrderItemsModalProps {
  workOrder: WorkOrder;
  onClose: () => void;
}

const toEditableItems = (workOrder: WorkOrder): EditableWorkOrderItem[] =>
  workOrder.items?.map((item) => ({
    ...createEmptyWorkOrderItem(),
    catalogItemId: item.catalogItemId,
    descripcion: item.descripcion,
    cantidad: String(item.cantidad),
    precioUnitario: String(item.precioUnitario),
    estadoOperativo: item.estadoOperativo,
    notasOperativas: item.notasOperativas ?? '',
  })) ?? [];

export const WorkOrderItemsModal = ({ workOrder, onClose }: WorkOrderItemsModalProps) => {
  const updateMutation = useUpdateWorkOrderMutation();
  const [items, setItems] = useState<EditableWorkOrderItem[]>(() => toEditableItems(workOrder));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    updateMutation.reset();

    const result = updateWorkOrderSchema.safeParse({
      items: items
        .filter((item) => item.descripcion.trim().length > 0)
        .map((item) => ({
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
    updateMutation.mutate({ id: workOrder.id, data: result.data }, { onSuccess: onClose });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 px-4 py-8">
      <section className="relative mx-auto w-full max-w-6xl rounded-lg bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="edit-work-items-title">
        <header className="flex items-start justify-between border-b border-slate-200 p-5">
          <div>
            <p className="font-mono text-sm text-slate-500">{workOrder.codigo}</p>
            <h2 id="edit-work-items-title" className="mt-1 text-xl font-bold text-brand-blue">Editar trabajos y repuestos</h2>
          </div>
          <button type="button" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>
        <form onSubmit={submit}>
          <div className="p-5">
            <WorkOrderItemsEditor
              items={items}
              onChange={setItems}
              errors={errors}
              title="Checklist de servicios y repuestos"
              description="Actualice avances, notas, cantidades o trabajos adicionales."
              totalLabel="Total operativo"
            />
          </div>
          {(errors._form || updateMutation.isError) && (
            <div className="mx-5 mb-5 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {errors._form ?? getApiErrorMessage(updateMutation.error)}
            </div>
          )}
          <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4">
            <button type="button" className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700" onClick={onClose}>Cancelar</button>
            <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              Guardar trabajos
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
};

export default WorkOrderItemsModal;
