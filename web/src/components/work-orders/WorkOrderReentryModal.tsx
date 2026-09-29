import { createWorkOrderReentrySchema } from '@unithor/shared';
import { LoaderCircle, RotateCcw, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useModalOverlay } from '../../hooks/useModalOverlay';
import { useCreateWorkOrderReentryMutation } from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';
import { notifySuccess } from '../../stores/toast.store';
import ModalHeader from '../common/ModalHeader';

import type { WorkOrder } from '../../types/entities';
import type { WorkOrderEntryType } from '@unithor/shared';



interface WorkOrderReentryModalProps {
  workOrder: WorkOrder;
  onClose: () => void;
}

type ReentryType = Exclude<WorkOrderEntryType, 'normal'>;

export const WorkOrderReentryModal = ({ workOrder, onClose }: WorkOrderReentryModalProps) => {
  const navigate = useNavigate();
  const mutation = useCreateWorkOrderReentryMutation();
  const [tipoIngreso, setTipoIngreso] = useState<ReentryType>('garantia');
  const [motivo, setMotivo] = useState('');
  const [kilometrajeIngreso, setKilometrajeIngreso] = useState(
    String(workOrder.delivery?.kilometrajeSalida ?? workOrder.kilometrajeIngreso ?? ''),
  );
  const [copiarItems, setCopiarItems] = useState(true);
  const [coberturaGarantia, setCoberturaGarantia] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    mutation.reset();
    const result = createWorkOrderReentrySchema.safeParse({
      tipoIngreso,
      motivo,
      kilometrajeIngreso,
      copiarItems,
      coberturaGarantia: tipoIngreso === 'garantia' ? coberturaGarantia : false,
    });

    if (!result.success) {
      setErrors(getFieldErrors(result.error.issues));
      return;
    }

    setErrors({});
    mutation.mutate(
      { id: workOrder.id, data: result.data },
      {
        onSuccess: (created) => {
          notifySuccess(`${tipoIngreso === 'garantia' ? 'Garantía' : 'Reingreso'} ${created.codigo} creado correctamente.`);
          navigate(`/work-orders/${created.id}`);
        },
      },
    );
  };

  const setPanelNode = useModalOverlay({ isOpen: true, onClose });
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-brand-scrim/60 px-4 py-8">
      <section className="relative mx-auto w-full max-w-[520px] rounded-lg bg-white shadow-2xl" role="dialog" ref={setPanelNode} aria-modal="true" aria-labelledby="reentry-title">
        <ModalHeader
  id="reentry-title"
  title={"Crear garantía o reingreso"}
  description={"Origen: {workOrder.codigo}"}
  onClose={onClose}
/>
        <form onSubmit={submit}>
          <div className="space-y-5 p-5">
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Tipo de nuevo ingreso">
              {([
                ['garantia', 'Garantía', ShieldCheck],
                ['reingreso', 'Reingreso', RotateCcw],
              ] as const).map(([value, label, Icon]) => (
                <button key={value} type="button" onClick={() => setTipoIngreso(value)} className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-bold ${tipoIngreso === value ? 'border-brand-primaryInk bg-brand-primaryInk text-white' : 'border-brand-line bg-white text-brand-ink hover:bg-brand-pale'}`} aria-pressed={tipoIngreso === value}>
                  <Icon className="h-4 w-4" aria-hidden="true" />{label}
                </button>
              ))}
            </div>

            <label className="block text-sm font-semibold text-brand-ink">Motivo y falla reportada
              <textarea value={motivo} onChange={(event) => setMotivo(event.target.value)} rows={4} maxLength={2000} className="mt-2 w-full resize-none rounded-lg border border-brand-line px-3 py-2 outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15" placeholder="Describa por qué vuelve el vehículo" autoFocus />
              {errors.motivo && <span className="mt-1 block text-xs text-brand-coralInk">{errors.motivo}</span>}
            </label>

            <label className="block text-sm font-semibold text-brand-ink">Kilometraje del nuevo ingreso
              <input type="number" min={workOrder.delivery?.kilometrajeSalida ?? workOrder.kilometrajeIngreso ?? 0} value={kilometrajeIngreso} onChange={(event) => setKilometrajeIngreso(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-brand-line px-3 outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15" />
              {errors.kilometrajeIngreso && <span className="mt-1 block text-xs text-brand-coralInk">{errors.kilometrajeIngreso}</span>}
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-brand-line p-4 text-sm text-brand-ink">
              <input type="checkbox" checked={copiarItems} onChange={(event) => setCopiarItems(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#0E2B4E]" />
              <span><strong className="block text-brand-ink">Copiar trabajos y repuestos</strong>Se crearán como pendientes para volver a evaluarlos. Los omitidos no se copian.</span>
            </label>

            {tipoIngreso === 'garantia' && (
              <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-brand-goldPale p-4 text-sm text-brand-ink">
                <input type="checkbox" checked={coberturaGarantia} onChange={(event) => setCoberturaGarantia(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#0E2B4E]" />
                <span><strong className="block">Cubierto por garantía</strong>Los conceptos copiados se crearán con precio $0. El taller podrá añadir cargos nuevos posteriormente.</span>
              </label>
            )}

            {mutation.isError && <p className="rounded-lg bg-brand-coralPale px-4 py-3 text-sm text-brand-coralInk" role="alert">{getApiErrorMessage(mutation.error, 'No se pudo crear el reingreso.')}</p>}
          </div>
          <footer className="flex justify-end gap-2 border-t border-brand-line bg-brand-line/40 p-5">
            <button type="button" className="h-10 rounded-lg border border-brand-line px-4 text-sm font-semibold text-brand-ink hover:bg-white" onClick={onClose} disabled={mutation.isPending}>Cancelar</button>
            <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primaryInk px-4 text-sm font-semibold text-white hover:bg-brand-primaryInkHover disabled:opacity-60" disabled={mutation.isPending}>{mutation.isPending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}Crear nueva OT</button>
          </footer>
        </form>
      </section>
    </div>
  );
};

export default WorkOrderReentryModal;
