import { updateWorkOrderSchema } from '@unithor/shared';
import { AlertCircle, LoaderCircle, Save, X } from 'lucide-react';
import { useState } from 'react';

import WorkOrderItemsEditor, { createEmptyWorkOrderItem } from './WorkOrderItemsEditor';
import { useUpdateWorkOrderMutation } from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';
import ModalHeader from '../common/ModalHeader';

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
    catalogTipo: item.catalogItem?.tipo ?? null,
    catalogStock: item.catalogItem?.stock ?? null,
    descripcion: item.descripcion,
    tipoLinea: item.tipoLinea,
    unidadMedida: item.unidadMedida,
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
          tipoLinea: item.tipoLinea,
          unidadMedida: item.unidadMedida,
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-brand-scrim/55 px-4 py-8">
      <section className="relative mx-auto w-full max-w-6xl rounded-lg bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="edit-work-items-title">
        <ModalHeader
  id="edit-work-items-title"
  title={"Editar trabajos y repuestos"}
  description={workOrder.codigo}
  onClose={onClose}
/>
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
            <div className="mx-5 mb-5 flex items-center gap-2 rounded-lg border border-brand-coral/30 bg-brand-coralPale px-3 py-2 text-sm text-brand-coralInk" role="alert">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {errors._form ?? getApiErrorMessage(updateMutation.error)}
            </div>
          )}
          <footer className="flex justify-end gap-2 border-t border-brand-line bg-brand-line/40 p-4">
            <button type="button" className="h-10 rounded-lg border border-brand-line bg-white px-4 text-sm font-semibold text-brand-ink" onClick={onClose}>Cancelar</button>
            <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primaryInk px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={updateMutation.isPending}>
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
