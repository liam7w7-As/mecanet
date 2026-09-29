import { Printer, X } from 'lucide-react';
import { createPortal } from 'react-dom';

import { useModalOverlay } from '../../hooks/useModalOverlay';
import { formatDateTime } from '../../lib/formatters';
import { useCompanyBranding } from '../common/BrandingContext';

import type { WorkOrder } from '../../types/entities';


interface WorkOrderDeliveryReceiptModalProps {
  workOrder: WorkOrder;
  onClose: () => void;
}

const checklistLabels: Record<string, string> = {
  trabajos_explicados: 'Trabajos realizados explicados',
  vehiculo_revisado: 'Vehículo revisado por el receptor',
  pertenencias_entregadas: 'Pertenencias verificadas y entregadas',
  documentos_entregados: 'Llaves, documentos y comprobantes entregados',
};

const DeliverySheet = ({ workOrder }: { workOrder: WorkOrder }) => {
  const delivery = workOrder.delivery;
  const company = useCompanyBranding();
  if (!delivery) return null;

  return (
    <article className="delivery-receipt-sheet mx-auto bg-white text-brand-ink">
      <header className="border-b-4 border-[#FFD600] bg-[#0E2B4E] px-8 py-7 text-white">
        <div className="flex items-start justify-between gap-6">
          <div><h1 className="text-2xl font-black">UNITHOR</h1><p className="mt-1 text-sm font-semibold">ACTA DE ENTREGA DE VEHÍCULO</p></div>
          <div className="text-right"><p className="font-mono text-xl font-bold">{workOrder.codigo}</p><p className="mt-1 text-xs">{formatDateTime(delivery.deliveredAt)}</p></div>
        </div>
      </header>
      <div className="space-y-7 px-8 py-7">
        <section>
          <h2 className="border-b border-brand-line pb-2 text-sm font-bold text-[#0E2B4E]">VEHÍCULO Y ORDEN</h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div><dt className="text-brand-muted">Patente</dt><dd className="font-mono text-lg font-bold">{workOrder.vehicle?.patente ?? 'Sin vehículo'}</dd></div>
            <div><dt className="text-brand-muted">Marca / Modelo</dt><dd className="font-semibold">{[workOrder.vehicle?.marca, workOrder.vehicle?.modelo].filter(Boolean).join(' ') || 'Sin datos'}</dd></div>
            <div><dt className="text-brand-muted">Kilometraje ingreso</dt><dd className="font-semibold">{workOrder.kilometrajeIngreso?.toLocaleString('es-CL') ?? '-'} km</dd></div>
            <div><dt className="text-brand-muted">Kilometraje salida</dt><dd className="font-semibold">{delivery.kilometrajeSalida.toLocaleString('es-CL')} km</dd></div>
          </dl>
        </section>

        <section>
          <h2 className="border-b border-brand-line pb-2 text-sm font-bold text-[#0E2B4E]">RECEPTOR DEL VEHÍCULO</h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div><dt className="text-brand-muted">Nombre</dt><dd className="font-semibold">{delivery.receptorNombre}</dd></div>
            <div><dt className="text-brand-muted">RUT / Identificación</dt><dd className="font-semibold">{delivery.receptorRut || 'Sin registrar'}</dd></div>
            <div><dt className="text-brand-muted">Teléfono</dt><dd className="font-semibold">{delivery.receptorTelefono || 'Sin registrar'}</dd></div>
            <div><dt className="text-brand-muted">Entregado por</dt><dd className="font-semibold">{delivery.deliverer?.nombre ?? 'Personal UNITHOR'}</dd></div>
          </dl>
        </section>

        <section>
          <h2 className="border-b border-brand-line pb-2 text-sm font-bold text-[#0E2B4E]">CONTROLES DE ENTREGA</h2>
          <ul className="mt-4 grid grid-cols-2 gap-3 text-sm">
            {delivery.checklist.map((item) => <li key={item} className="flex items-start gap-2"><span className="font-bold text-brand-mintInk">✓</span>{checklistLabels[item] ?? item}</li>)}
          </ul>
        </section>

        {delivery.observaciones && <section><h2 className="border-b border-brand-line pb-2 text-sm font-bold text-[#0E2B4E]">OBSERVACIONES</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-6">{delivery.observaciones}</p></section>}

        <section className="pt-8">
          <p className="text-xs leading-5 text-brand-muted">El receptor declara haber revisado y recibido el vehículo, sus pertenencias, llaves y documentos en conformidad, y haber recibido la explicación de los trabajos realizados y recomendaciones del taller.</p>
          <div className="mt-16 grid grid-cols-2 gap-16 text-center text-xs">
            <div className="border-t border-brand-muted pt-2"><p className="font-semibold italic">{delivery.firmaRecepcion}</p><p className="mt-1 text-brand-muted">Firma nominativa del receptor</p></div>
            <div className="border-t border-brand-muted pt-2"><p className="font-semibold">{delivery.deliverer?.nombre ?? company.nombreComercial}</p><p className="mt-1 text-brand-muted">Responsable de entrega</p></div>
          </div>
        </section>
      </div>
      <footer className="mt-auto border-t border-brand-line px-8 py-4 text-center text-[10px] text-brand-muted">{company.razonSocial}{company.rut ? ` · R.U.T. ${company.rut}` : ''} · Comprobante asociado a {workOrder.codigo}</footer>
    </article>
  );
};

export const WorkOrderDeliveryReceiptModal = ({ workOrder, onClose }: WorkOrderDeliveryReceiptModalProps) => {
  const setPanelNode = useModalOverlay({ isOpen: true, onClose });
  return (
    <>
      <style>{`
        #delivery-print-portal { display: none; }
        .delivery-receipt-sheet { width: 816px; min-height: 1056px; display: flex; flex-direction: column; }
        @media print {
          @page { size: letter portrait; margin: 0; }
          body > *:not(#delivery-print-portal) { display: none !important; }
          #delivery-print-portal { display: block !important; position: static !important; }
          #delivery-print-portal .delivery-receipt-sheet { width: 8.5in; min-height: 11in; box-shadow: none !important; }
        }
      `}</style>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-brand-scrim/70 px-4 py-6">
        <section
          className="mx-auto w-fit max-w-full"
          role="dialog"
          ref={setPanelNode}
          aria-labelledby="delivery-receipt-title"
        >
          <div className="mb-3 flex items-center justify-between rounded-lg bg-white px-4 py-3 shadow-lg">
            <h2 id="delivery-receipt-title" className="font-bold text-brand-primaryInk">Comprobante de entrega</h2>
            <div className="flex gap-2">
              <button type="button" onClick={() => window.print()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-primaryInk px-3 text-sm font-semibold text-white hover:bg-brand-primaryInkHover"><Printer className="h-4 w-4" aria-hidden="true" />Imprimir</button>
              <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg border border-brand-line text-brand-muted hover:bg-brand-pale" aria-label="Cerrar"><X className="h-4 w-4" aria-hidden="true" /></button>
            </div>
          </div>
          <div className="max-w-full overflow-x-auto shadow-2xl"><DeliverySheet workOrder={workOrder} /></div>
        </section>
      </div>
      {createPortal(<div id="delivery-print-portal"><DeliverySheet workOrder={workOrder} /></div>, document.body)}
    </>
  );
};

export default WorkOrderDeliveryReceiptModal;
