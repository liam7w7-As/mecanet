import { createWorkOrderReentrySchema } from '@unithor/shared';
import { LoaderCircle, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useCreateWorkOrderReentryMutation } from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import { getFieldErrors } from '../../lib/form-errors';
import { notifySuccess } from '../../stores/toast.store';

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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 px-4 py-8">
      <section className="relative mx-auto w-full max-w-2xl rounded-lg bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="reentry-title">
        <header className="flex items-start justify-between border-b border-slate-200 p-5">
          <div>
            <p className="font-mono text-sm text-slate-500">Origen: {workOrder.codigo}</p>
            <h2 id="reentry-title" className="mt-1 text-xl font-bold text-brand-blue">Crear garantía o reingreso</h2>
          </div>
          <button type="button" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Cerrar"><X className="h-4 w-4" aria-hidden="true" /></button>
        </header>
        <form onSubmit={submit}>
          <div className="space-y-5 p-5">
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Tipo de nuevo ingreso">
              {([
                ['garantia', 'Garantía', ShieldCheck],
                ['reingreso', 'Reingreso', RotateCcw],
              ] as const).map(([value, label, Icon]) => (
                <button key={value} type="button" onClick={() => setTipoIngreso(value)} className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-bold ${tipoIngreso === value ? 'border-brand-blue bg-brand-blue text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`} aria-pressed={tipoIngreso === value}>
                  <Icon className="h-4 w-4" aria-hidden="true" />{label}
                </button>
              ))}
            </div>

            <label className="block text-sm font-semibold text-slate-700">Motivo y falla reportada
              <textarea value={motivo} onChange={(event) => setMotivo(event.target.value)} rows={4} maxLength={2000} className="mt-2 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15" placeholder="Describa por qué vuelve el vehículo" autoFocus />
              {errors.motivo && <span className="mt-1 block text-xs text-red-700">{errors.motivo}</span>}
            </label>

            <label className="block text-sm font-semibold text-slate-700">Kilometraje del nuevo ingreso
              <input type="number" min={workOrder.delivery?.kilometrajeSalida ?? workOrder.kilometrajeIngreso ?? 0} value={kilometrajeIngreso} onChange={(event) => setKilometrajeIngreso(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15" />
              {errors.kilometrajeIngreso && <span className="mt-1 block text-xs text-red-700">{errors.kilometrajeIngreso}</span>}
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-4 text-sm text-slate-700">
              <input type="checkbox" checked={copiarItems} onChange={(event) => setCopiarItems(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#0E2B4E]" />
              <span><strong className="block text-slate-900">Copiar trabajos y repuestos</strong>Se crearán como pendientes para volver a evaluarlos. Los omitidos no se copian.</span>
            </label>

            {tipoIngreso === 'garantia' && (
              <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
                <input type="checkbox" checked={coberturaGarantia} onChange={(event) => setCoberturaGarantia(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#0E2B4E]" />
                <span><strong className="block">Cubierto por garantía</strong>Los conceptos copiados se crearán con precio $0. El taller podrá añadir cargos nuevos posteriormente.</span>
              </label>
            )}

            {mutation.isError && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{getApiErrorMessage(mutation.error, 'No se pudo crear el reingreso.')}</p>}
          </div>
          <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 p-5">
            <button type="button" className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-white" onClick={onClose} disabled={mutation.isPending}>Cancelar</button>
            <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60" disabled={mutation.isPending}>{mutation.isPending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}Crear nueva OT</button>
          </footer>
        </form>
      </section>
    </div>
  );
};

export default WorkOrderReentryModal;
