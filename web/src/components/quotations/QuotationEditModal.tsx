import { calculateQuotationPricing, updateQuotationSchema } from '@unithor/shared';
import { AlertCircle, FileText } from 'lucide-react';
import { useRef, useState } from 'react';

import QuotationCommercialFields, { createCommercialDraft } from './QuotationCommercialFields';
import QuotationDiscountSummary from './QuotationDiscountSummary';
import { useUpdateQuotationMutation } from '../../hooks/useQuotations';
import { useSalesAccessRecord } from '../../hooks/useSalesAccessRecord';
import { getApiErrorMessage } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';
import { notifySuccess } from '../../stores/toast.store';
import FormDialog from '../common/FormDialog';
import WorkOrderItemsEditor, { createEmptyWorkOrderItem } from '../work-orders/WorkOrderItemsEditor';

import type { Quotation } from '../../types/entities';
import type { EditableWorkOrderItem } from '../work-orders/WorkOrderItemsEditor';

const toEditableItems = (quotation: Quotation): EditableWorkOrderItem[] =>
  quotation.items?.map((item) => ({
    ...createEmptyWorkOrderItem(),
    id: item.id,
    catalogItemId: item.catalogItemId,
    descripcion: item.descripcion,
    tipoLinea: item.tipoLinea,
    unidadMedida: item.unidadMedida,
    cantidad: String(item.cantidad),
    precioUnitario: String(item.precioUnitario),
    estadoOperativo: item.estadoOperativo,
    notasOperativas: item.notasOperativas ?? '',
    descuentoTipo: item.descuentoTipo ?? null,
    descuentoValor: String(item.descuentoValor ?? 0),
  })) ?? [];

interface QuotationEditModalProps {
  quotation: Quotation;
  onClose: () => void;
  /** Se invoca solo cuando el guardado fue exitoso (antes de cerrar). */
  onSaved?: () => void;
}

export const QuotationEditModal = ({ quotation, onClose, onSaved }: QuotationEditModalProps) => {
  useSalesAccessRecord('quotation', quotation.id, onClose);
  const updateMutation = useUpdateQuotationMutation();
  const user = useAuthStore((state) => state.user);
  const canUpdate = Boolean(user && hasUserPermission(user, 'comercial', 'update'));
  const canEditPricing = canUpdate && quotation.estadoPago !== 'total';
  const canEditItems = canEditPricing
    && quotation.workOrder?.estado !== 'entregada' && quotation.workOrder?.estado !== 'cancelada';
  const [notas, setNotas] = useState(quotation.notas ?? '');
  const [commercial, setCommercial] = useState(() => createCommercialDraft(quotation));
  const [items, setItems] = useState<EditableWorkOrderItem[]>(() => toEditableItems(quotation));
  const snapshot = JSON.stringify({ notas, commercial, items });
  const initialSnapshot = useRef(snapshot);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!canUpdate || updateMutation.isPending) return;
    updateMutation.reset();
    if (canEditPricing) {
      try { calculateQuotationPricing(canEditItems ? items : toEditableItems(quotation), commercial); } catch (error) {
        setErrors({ descuentoValor: error instanceof Error ? error.message : 'Descuento inválido' });
        return;
      }
    }
    const result = updateQuotationSchema.safeParse({
      formaPago: commercial.formaPago,
      disponibilidadTrabajo: commercial.disponibilidadTrabajo,
      validezDias: commercial.validezDias,
      notas,
      ...(canEditPricing ? {
        descuentoTipo: commercial.descuentoTipo,
        descuentoValor: commercial.descuentoValor,
      } : {}),
      ...(canEditItems ? {
        items: items.map((item) => ({
          id: item.id ?? undefined,
          catalogItemId: item.catalogItemId,
          descripcion: item.descripcion,
          tipoLinea: item.tipoLinea,
          unidadMedida: item.unidadMedida,
          cantidad: item.cantidad,
          precioUnitario: item.precioUnitario,
          estadoOperativo: item.estadoOperativo,
          notasOperativas: item.notasOperativas,
          descuentoTipo: item.descuentoTipo ?? null,
          descuentoValor: item.descuentoValor ?? 0,
        })),
      } : {}),
    });

    if (!result.success) {
      setErrors(getFieldErrors(result.error.issues));
      return;
    }

    setErrors({});
    updateMutation.mutate({ id: quotation.id, data: result.data }, {
      onSuccess: () => {
        notifySuccess(`Cotización ${quotation.codigo} actualizada correctamente.`);
        onSaved?.();
        onClose();
      },
    });
  };

  return <FormDialog id="edit-quotation-title" title="Editar cotización" code={quotation.codigo}
    context={quotation.client?.nombre ?? 'Cotización'} submitLabel="Guardar cambios"
    dirty={snapshot !== initialSnapshot.current} pending={updateMutation.isPending}
    submitDisabled={!canUpdate}
    onClose={onClose} onSubmit={submit} className="commercial-form-dialog commercial-editor-dialog" headerVariant="plain" headerIcon={<FileText aria-hidden="true" />}>
          <fieldset className="commercial-editor-content" disabled={!canUpdate}>
            {!canUpdate && <p role="status">Se requiere permiso de edición comercial para modificar la cotización.</p>}
            {canUpdate && !canEditPricing && <p role="status">La cotización está pagada. Puede actualizar las notas y condiciones comerciales; los conceptos y descuentos están bloqueados.</p>}
            {canEditPricing && !canEditItems && <p role="status">La OT vinculada está entregada o cancelada. Los conceptos están bloqueados; puede actualizar las condiciones comerciales.</p>}
            <div className="commercial-editor-context">
              <span>Servicios y condiciones</span>
              <span>{items.length} {items.length === 1 ? 'concepto' : 'conceptos'}</span>
            </div>
            <fieldset className="commercial-editor-items" disabled={!canEditItems}><WorkOrderItemsEditor presentation="reception" items={items} onChange={setItems} errors={errors} title="Ítems cotizados" emptyMessage="La cotización quedará sin ítems y con total cero." showDiscounts showTotal={false} /></fieldset>
            <aside className="commercial-create-terms">
              <QuotationCommercialFields value={commercial} onChange={setCommercial} errors={errors} />
              <QuotationDiscountSummary items={canEditItems ? items : toEditableItems(quotation)} value={commercial} onChange={setCommercial} testId="quotation-edit-total" readOnly={!canEditPricing} />
              <label className="commercial-notes-field block text-sm font-semibold text-brand-ink">Notas comerciales<textarea rows={4} value={notas} onChange={(event) => setNotas(event.target.value)} className="mt-2 w-full resize-y rounded-lg border border-brand-line px-3 py-2 font-normal outline-none focus:border-brand-primary" /></label>
            </aside>
            {updateMutation.isError && <div className="mt-4 flex items-center gap-2 rounded-lg border border-brand-coral/30 bg-brand-coralPale px-3 py-2 text-sm text-brand-coralInk" role="alert"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{getApiErrorMessage(updateMutation.error)}</div>}
          </fieldset>
  </FormDialog>;
};

export default QuotationEditModal;
