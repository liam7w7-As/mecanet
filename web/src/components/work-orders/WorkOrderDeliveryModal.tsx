import {
  deliverWorkOrderSchema,
  WORK_ORDER_DELIVERY_CHECKLIST,
} from '@unithor/shared';
import { CheckCircle2, LoaderCircle, PackageCheck } from 'lucide-react';
import { useState } from 'react';

import { useModalOverlay } from '../../hooks/useModalOverlay';
import { useDeliverWorkOrderMutation } from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';
import { notifySuccess } from '../../stores/toast.store';
import ModalHeader from '../common/ModalHeader';

import type { WorkOrder } from '../../types/entities';
import type { WorkOrderDeliveryChecklistItem } from '@unithor/shared';



interface WorkOrderDeliveryModalProps {
  workOrder: WorkOrder;
  onClose: () => void;
}

const checklistLabels: Record<WorkOrderDeliveryChecklistItem, string> = {
  trabajos_explicados: 'Se explicaron los trabajos realizados y las recomendaciones.',
  vehiculo_revisado: 'El receptor revisó el estado exterior e interior del vehículo.',
  pertenencias_entregadas: 'Se verificó la entrega de pertenencias y objetos declarados.',
  documentos_entregados: 'Se entregaron llaves, documentos y comprobantes correspondientes.',
};

export const WorkOrderDeliveryModal = ({ workOrder, onClose }: WorkOrderDeliveryModalProps) => {
  const deliveryMutation = useDeliverWorkOrderMutation();
  const [kilometrajeSalida, setKilometrajeSalida] = useState(
    String(workOrder.kilometrajeIngreso ?? ''),
  );
  const [receptorNombre, setReceptorNombre] = useState(
    workOrder.contact?.nombre ?? workOrder.client?.nombre ?? '',
  );
  const [receptorRut, setReceptorRut] = useState(
    workOrder.contact?.rut ?? workOrder.client?.rut ?? '',
  );
  const [receptorTelefono, setReceptorTelefono] = useState(
    workOrder.contact?.telefono ?? workOrder.client?.telefono ?? '',
  );
  const [checklist, setChecklist] = useState<WorkOrderDeliveryChecklistItem[]>([]);
  const [conformidad, setConformidad] = useState(false);
  const [firmaRecepcion, setFirmaRecepcion] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const toggleChecklist = (item: WorkOrderDeliveryChecklistItem): void => {
    setChecklist((current) =>
      current.includes(item)
        ? current.filter((currentItem) => currentItem !== item)
        : [...current, item],
    );
  };

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    deliveryMutation.reset();
    const result = deliverWorkOrderSchema.safeParse({
      kilometrajeSalida,
      receptorNombre,
      receptorRut,
      receptorTelefono,
      checklist,
      conformidad,
      firmaRecepcion,
      observaciones,
    });

    if (!result.success) {
      setErrors(getFieldErrors(result.error.issues));
      return;
    }

    setErrors({});
    deliveryMutation.mutate(
      { id: workOrder.id, data: result.data },
      {
        onSuccess: () => {
          notifySuccess('Entrega registrada y orden cerrada correctamente.');
          onClose();
        },
      },
    );
  };

  const apiError = deliveryMutation.isError
    ? getApiErrorMessage(deliveryMutation.error, 'No se pudo registrar la entrega.')
    : null;

  const setPanelNode = useModalOverlay({ isOpen: true, onClose });
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-4 sm:items-center sm:py-6">
      <button
        type="button"
        className="fixed inset-0 bg-[#18273c55] backdrop-blur-sm transition-opacity"
        aria-label="Cerrar entrega"
        onClick={onClose}
      />
      <section className="relative max-h-[92vh] w-full max-w-[720px] overflow-y-auto rounded-2xl border border-brand-line bg-white shadow-2xl" role="dialog" ref={setPanelNode} aria-modal="true" aria-labelledby="delivery-title">
        <ModalHeader
  id="delivery-title"
  badge={<PackageCheck className="h-6 w-6" aria-hidden="true" />}
  tone="success"
  eyebrow={<span className="font-mono text-sm normal-case">{workOrder.codigo}</span>}
  title="Cierre y entrega del vehículo"
  description="Este registro deja la orden en estado entregada y no podrá editarse."
  onClose={onClose}
  closeLabel="Cerrar"
/>

        <form onSubmit={submit}>
          <div className="space-y-6 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-brand-ink">Kilometraje de salida
                <input type="number" min={workOrder.kilometrajeIngreso ?? 0} value={kilometrajeSalida} onChange={(event) => setKilometrajeSalida(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-brand-line px-3 outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15" />
                {errors.kilometrajeSalida && <span className="mt-1 block text-xs text-brand-coralInk">{errors.kilometrajeSalida}</span>}
              </label>
              <label className="text-sm font-semibold text-brand-ink">Nombre de quien recibe
                <input value={receptorNombre} onChange={(event) => setReceptorNombre(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-brand-line px-3 outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15" />
                {errors.receptorNombre && <span className="mt-1 block text-xs text-brand-coralInk">{errors.receptorNombre}</span>}
              </label>
              <label className="text-sm font-semibold text-brand-ink">RUT / Identificación
                <input value={receptorRut} onChange={(event) => setReceptorRut(event.target.value)} aria-invalid={Boolean(errors.receptorRut)} placeholder="12.345.678-5" className="mt-2 h-11 w-full rounded-lg border border-brand-line px-3 outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15" />
                {errors.receptorRut && <span className="mt-1 block text-xs text-brand-coralInk">{errors.receptorRut}</span>}
              </label>
              <label className="text-sm font-semibold text-brand-ink">Teléfono de contacto
                <input value={receptorTelefono} onChange={(event) => setReceptorTelefono(event.target.value)} aria-invalid={Boolean(errors.receptorTelefono)} placeholder="+56 9 1234 5678" className="mt-2 h-11 w-full rounded-lg border border-brand-line px-3 outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15" />
                {errors.receptorTelefono && <span className="mt-1 block text-xs text-brand-coralInk">{errors.receptorTelefono}</span>}
              </label>
            </div>

            <fieldset>
              <legend className="text-sm font-bold text-brand-primaryInk">Checklist final de entrega</legend>
              <div className="mt-3 grid gap-2">
                {WORK_ORDER_DELIVERY_CHECKLIST.map((item) => (
                  <label key={item} className="flex cursor-pointer items-start gap-3 rounded-lg border border-brand-line p-3 text-sm text-brand-ink hover:bg-brand-pale">
                    <input type="checkbox" checked={checklist.includes(item)} onChange={() => toggleChecklist(item)} className="mt-0.5 h-4 w-4 accent-brand-primary" />
                    <span>{checklistLabels[item]}</span>
                  </label>
                ))}
              </div>
              {errors.checklist && <p className="mt-2 text-xs text-brand-coralInk">{errors.checklist}</p>}
            </fieldset>

            <label className="block text-sm font-semibold text-brand-ink">Observaciones de salida
              <textarea value={observaciones} onChange={(event) => setObservaciones(event.target.value)} rows={3} maxLength={2000} className="mt-2 w-full resize-none rounded-lg border border-brand-line px-3 py-2 outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15" placeholder="Daños pendientes, recomendaciones o acuerdos de entrega" />
            </label>

            <div className="border-t border-brand-line pt-5">
              <label className="block text-sm font-semibold text-brand-ink">Firma nominativa del receptor
                <input value={firmaRecepcion} onChange={(event) => setFirmaRecepcion(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-brand-line px-3 font-medium italic outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15" placeholder="Escriba el nombre completo de quien recibe" />
                {errors.firmaRecepcion && <span className="mt-1 block text-xs text-brand-coralInk">{errors.firmaRecepcion}</span>}
              </label>
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg bg-brand-line/40 p-4 text-sm text-brand-primaryInk">
                <input type="checkbox" checked={conformidad} onChange={(event) => setConformidad(event.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-primary" />
                <span>El receptor declara recibir el vehículo, sus pertenencias y la explicación de los trabajos en conformidad.</span>
              </label>
              {errors.conformidad && <p className="mt-2 text-xs text-brand-coralInk">{errors.conformidad}</p>}
            </div>

            {apiError && <p className="rounded-lg bg-brand-coralPale px-4 py-3 text-sm text-brand-coralInk" role="alert">{apiError}</p>}
          </div>
          <footer className="flex justify-end gap-2 border-t border-brand-line bg-brand-line/40 p-5">
            <button type="button" className="h-10 rounded-lg border border-brand-line px-4 text-sm font-semibold text-brand-ink hover:bg-white" onClick={onClose} disabled={deliveryMutation.isPending}>Volver</button>
            <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primaryInk px-4 text-sm font-semibold text-white hover:bg-brand-primaryInkHover disabled:opacity-60" disabled={deliveryMutation.isPending}>
              {deliveryMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
              Confirmar entrega
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
};

export default WorkOrderDeliveryModal;
