import { formatRut, UNIT_MEASURE_LABELS } from '@unithor/shared';
import { Car, LoaderCircle } from 'lucide-react';

import { formatClp, formatDateTime } from '../../lib/formatters';
import ModalHeader from '../common/ModalHeader';

import type { WorkOrderRecovery } from '../../lib/form-recovery.schemas';
import type { VehicleInventoryItem } from '@unithor/shared';

interface Props {
  data: WorkOrderRecovery;
  total: number;
  fuelLabel: string;
  inventoryLabels: Record<VehicleInventoryItem, string>;
  photoLabels: string[];
  mechanic?: string;
  quotationCode?: string;
  pending: boolean;
  error?: string;
  onEdit: () => void;
  onConfirm: () => void;
}

export default function WorkOrderReceptionReview(props: Props) {
  const { data, pending } = props;
  const items = data.items.filter((item) => item.descripcion.trim());
  return (
    <>
      <ModalHeader
        id="confirm-ot-title"
        title="Confirmar recepción de OT"
        description="Revisa los datos antes de crear la orden."
        variant="brand"
        onClose={props.onEdit}
        closeDisabled={pending}
      />
      <div className="reception-review-body">
        {props.quotationCode && (
          <p className="reception-origin">
            Desde {props.quotationCode} · Los trabajos cotizados se conservan.
          </p>
        )}
        <div className="reception-review-vehicle">
          <Car aria-hidden="true" />
          <div>
            <strong>{data.vehicle?.patente}</strong>
            <p>
              {[data.vehicle?.marca, data.vehicle?.modelo, data.vehicle?.ano]
                .filter(Boolean)
                .join(' ') || 'Sin datos técnicos'}
            </p>
          </div>
          <div>
            <small>Propietario registrado</small>
            <p>{data.vehicle?.client?.nombre ?? 'Sin propietario registrado'}</p>
          </div>
        </div>
        <div className="reception-review-people">
          {(
            [
              ['Responsable', data.client],
              ['Contacto', data.contactClient],
              ['Facturación', data.billingClient],
            ] as const
          ).map(([label, person]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{person?.nombre ?? 'Sin seleccionar'}</strong>
              <small>
                {person?.rut ? formatRut(person.rut) : 'Sin RUT'}
                {person?.telefono ? ' · ' + person.telefono : ''}
              </small>
              {person?.email && <small>{person.email}</small>}
            </div>
          ))}
        </div>
        <section className="reception-review-reception">
          <h3>Recepción del vehículo</h3>
          <dl>
            {[
              ['Ingreso', data.fechaIngreso ? formatDateTime(data.fechaIngreso) : 'Sin fecha'],
              [
                'Entrega prometida',
                data.fechaEntrega ? formatDateTime(data.fechaEntrega) : 'No definida',
              ],
              [
                'Kilometraje',
                data.kilometrajeIngreso !== ''
                  ? Number(data.kilometrajeIngreso).toLocaleString('es-CL') + ' km'
                  : 'Sin registrar',
              ],
              ['Combustible', props.fuelLabel],
              ...(props.mechanic ? [['Mecánico responsable', props.mechanic]] : []),
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="reception-review-tags">
            <span>{data.inspection.inventario.length} elementos de inventario</span>
            <span>{data.photos.length}/9 fotos</span>
            {data.inspection.objetosValor && <span>Objetos declarados</span>}
          </div>
          {data.descripcion && (
            <div className="reception-review-note">
              <small>Motivo de ingreso</small>
              <p>{data.descripcion}</p>
            </div>
          )}
          {(data.inspection.inventario.length > 0 ||
            data.inspection.objetosValor ||
            data.inspection.observaciones ||
            data.photos.length > 0) && (
            <details className="reception-review-extra">
              <summary>Ver detalles de inspección</summary>
              {data.inspection.inventario.length > 0 && (
                <p>
                  Inventario:{' '}
                  {data.inspection.inventario.map((key) => props.inventoryLabels[key]).join(', ')}
                </p>
              )}
              {props.photoLabels.length > 0 && <p>Fotos: {props.photoLabels.join(', ')}</p>}
              {data.inspection.objetosValor && <p>Objetos: {data.inspection.objetosValor}</p>}
              {data.inspection.observaciones && <p>{data.inspection.observaciones}</p>}
            </details>
          )}
        </section>
        <section className="reception-review-services">
          <h3>Servicios y repuestos ({items.length})</h3>
          <div className="reception-review-service-heading" aria-hidden="true">
            <span>Trabajo / repuesto</span>
            <span>Cantidad</span>
            <span>Subtotal</span>
          </div>
          {items.length === 0 ? (
            <p className="reception-review-empty">Diagnóstico inicial, sin trabajos cargados.</p>
          ) : (
            items.map((item) => (
              <div key={item.key} className="reception-review-service-row">
                <span>
                  {item.descripcion}
                  <small>
                    {UNIT_MEASURE_LABELS[item.unidadMedida]}
                    {item.horasHombreEstimadas
                      ? ' · ' + item.horasHombreEstimadas + ' h / unidad'
                      : ''}
                  </small>
                </span>
                <span>{item.cantidad}</span>
                <strong>{formatClp(Number(item.cantidad) * Number(item.precioUnitario))}</strong>
              </div>
            ))
          )}
        </section>
        <div className="reception-review-total">
          <span>{props.quotationCode ? 'Total cotizado' : 'Total estimado'}</span>
          <strong>{formatClp(props.total)}</strong>
        </div>
        {props.error && (
          <p className="reception-review-error" role="alert">
            {props.error}
          </p>
        )}
      </div>
      <footer className="reception-review-footer">
        <button type="button" onClick={props.onEdit} disabled={pending}>
          Volver a editar
        </button>
        <button type="button" onClick={props.onConfirm} disabled={pending}>
          {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {pending ? 'Creando orden...' : 'Confirmar y crear orden'}
        </button>
      </footer>
    </>
  );
}
