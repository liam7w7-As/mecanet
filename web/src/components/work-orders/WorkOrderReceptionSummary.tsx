import { Camera, Car, ClipboardCheck, Pencil, UserRound } from 'lucide-react';

import { formatClp } from '../../lib/formatters';

import type { ReceptionStep } from './WorkOrderReceptionNavigation';

interface Props {
  client: string | undefined;
  contact: string | undefined;
  billing: string | undefined;
  plate: string | undefined;
  vehicle: string;
  photos: number;
  inventory: number;
  items: number;
  total: number;
  quotationCode?: string;
  onStep: (step: ReceptionStep) => void;
}

export default function WorkOrderReceptionSummary(props: Props) {
  return <aside className="reception-summary" aria-label="Resumen de recepción">
    <header><ClipboardCheck aria-hidden="true" /><h2>Resumen de recepción</h2></header>
    {props.quotationCode && <p className="reception-origin">Desde {props.quotationCode}</p>}
    <div className="reception-summary-section">
      <div><UserRound aria-hidden="true" /><h3>Responsable</h3><button type="button" onClick={() => props.onStep(0)} aria-label="Revisar responsable"><Pencil aria-hidden="true" /></button></div>
      <p>{props.client ?? 'Pendiente de seleccionar'}</p>
      <dl><dt>Contacto</dt><dd>{props.contact ?? 'Sin seleccionar'}</dd><dt>Facturación</dt><dd>{props.billing ?? 'Sin seleccionar'}</dd></dl>
      <button type="button" className="reception-text-action" onClick={() => props.onStep(1)}>Revisar contacto y factura</button>
    </div>
    <div className="reception-summary-section">
      <div><Car aria-hidden="true" /><h3>Vehículo</h3><button type="button" onClick={() => props.onStep(2)} aria-label="Revisar vehículo"><Pencil aria-hidden="true" /></button></div>
      <p className="reception-summary-plate">{props.plate ?? 'Sin seleccionar'}</p><small>{props.vehicle}</small>
    </div>
    <div className="reception-summary-section">
      <div><Camera aria-hidden="true" /><h3>Inspección</h3><button type="button" onClick={() => props.onStep(3)} aria-label="Revisar inspección"><Pencil aria-hidden="true" /></button></div>
      <p>{props.photos}/9 fotos · {props.inventory} elementos</p>
    </div>
    <footer><span>{props.items} trabajos / repuestos</span><strong>{formatClp(props.total)}</strong><small>Total estimado</small></footer>
  </aside>;
}
