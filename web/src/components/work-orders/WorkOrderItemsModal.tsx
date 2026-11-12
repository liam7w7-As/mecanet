import { calculateQuotationPricing, updateWorkOrderSchema } from '@unithor/shared';
import { AlertCircle } from 'lucide-react';
import { useRef, useState } from 'react';

import WorkOrderEditDialog from './WorkOrderEditDialog';
import WorkOrderItemsEditor, { createEmptyWorkOrderItem } from './WorkOrderItemsEditor';
import { useUpdateWorkOrderMutation } from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';
import QuotationDiscountSummary from '../quotations/QuotationDiscountSummary';

import type { EditableWorkOrderItem } from './WorkOrderItemsEditor';
import type { WorkOrder } from '../../types/entities';
import type { DiscountDraft } from '../quotations/QuotationDiscountSummary';



interface WorkOrderItemsModalProps {
  workOrder: WorkOrder;
  onClose: () => void;
}

const toEditableItems = (workOrder: WorkOrder): EditableWorkOrderItem[] =>
  workOrder.items?.map((item) => ({
    ...createEmptyWorkOrderItem(),
    id: item.id,
    catalogItemId: item.catalogItemId,
    catalogTipo: item.catalogItem?.tipo ?? null,
    catalogStock: item.catalogItem?.stock ?? null,
    descripcion: item.descripcion,
    tipoLinea: item.tipoLinea,
    unidadMedida: item.unidadMedida,
    cantidad: String(item.cantidad),
    precioUnitario: String(item.precioUnitario),
    descuentoTipo: item.descuentoTipo ?? null,
    descuentoValor: String(item.descuentoValor ?? 0),
    horasHombreEstimadas:
      item.horasHombreEstimadas === null ? '' : String(item.horasHombreEstimadas),
    estadoOperativo: item.estadoOperativo,
    notasOperativas: item.notasOperativas ?? '',
  })) ?? [];

export const WorkOrderItemsModal = ({ workOrder, onClose }: WorkOrderItemsModalProps) => {
  const updateMutation = useUpdateWorkOrderMutation();
  const [items, setItems] = useState<EditableWorkOrderItem[]>(() => toEditableItems(workOrder));
  const [discount, setDiscount] = useState<DiscountDraft>({ descuentoTipo: workOrder.descuentoTipo ?? null, descuentoValor: String(workOrder.descuentoValor ?? 0) });
  const initialItems = useRef(JSON.stringify({ items, discount }));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    updateMutation.reset();

    const result = updateWorkOrderSchema.safeParse({
      ...discount,
      items: items
        .filter((item) => item.descripcion.trim().length > 0)
        .map((item) => ({
          ...(item.id ? { id: item.id } : {}),
          catalogItemId: item.catalogItemId,
          descripcion: item.descripcion,
          tipoLinea: item.tipoLinea,
          unidadMedida: item.unidadMedida,
          cantidad: item.cantidad,
          precioUnitario: item.precioUnitario,
          descuentoTipo: item.descuentoTipo ?? null,
          descuentoValor: item.descuentoValor ?? 0,
          horasHombreEstimadas: item.horasHombreEstimadas,
          estadoOperativo: item.estadoOperativo,
          notasOperativas: item.notasOperativas,
        })),
    });

    if (!result.success) {
      setErrors(getFieldErrors(result.error.issues));
      return;
    }
    try { calculateQuotationPricing(result.data.items ?? [], discount); }
    catch (error) {
      setErrors({ _form: error instanceof Error ? error.message : 'Descuento inválido' });
      return;
    }

    setErrors({});
    updateMutation.mutate({ id: workOrder.id, data: result.data }, { onSuccess: onClose });
  };

  return (
    <WorkOrderEditDialog id="edit-work-items-title" title="Editar trabajos y repuestos" code={workOrder.codigo}
      context={workOrder.vehicle?.patente ?? 'Taller'} submitLabel="Guardar trabajos"
      dirty={JSON.stringify({ items, discount }) !== initialItems.current} pending={updateMutation.isPending}
      onClose={onClose} onSubmit={submit}>
          <div>
            <WorkOrderItemsEditor
              presentation="reception"
              items={items}
              onChange={setItems}
              errors={errors}
              title="Checklist de servicios y repuestos"
              description="Actualice avances, notas, cantidades o trabajos adicionales."
              showDiscounts
              showTotal={false}
            />
            <QuotationDiscountSummary items={items.filter((item) => item.descripcion.trim())} value={discount} onChange={setDiscount} testId="work-order-edit-total" />
          </div>
          {(errors._form || updateMutation.isError) && (
            <div className="mx-5 mb-5 flex items-center gap-2 rounded-lg border border-brand-coral/30 bg-brand-coralPale px-3 py-2 text-sm text-brand-coralInk" role="alert">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {errors._form ?? getApiErrorMessage(updateMutation.error)}
            </div>
          )}
    </WorkOrderEditDialog>
  );
};

export default WorkOrderItemsModal;
