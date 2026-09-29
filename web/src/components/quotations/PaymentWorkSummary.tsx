import { CheckCircle2, Clock3, PackageCheck, Wrench } from 'lucide-react';

import { formatClp } from '../../lib/formatters';

import type { Quotation, QuotationItem, QuotationPaymentSummary } from '../../types/entities';

interface Props {
  quotation: Quotation;
  summary: QuotationPaymentSummary;
  pendingAmount: number;
}

const WorkLine = ({ item, completed }: { item: QuotationItem; completed: boolean }) => (
  <li className="flex items-start gap-3 py-3">
    <span
      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${completed ? 'bg-brand-mintPale text-brand-mintInk' : 'bg-brand-pale text-brand-muted'}`}
    >
      {item.tipoLinea === 'parte' ? (
        <PackageCheck className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Wrench className="h-4 w-4" aria-hidden="true" />
      )}
    </span>
    <div className="min-w-0 flex-1">
      <p className="break-words text-sm font-semibold text-brand-ink">{item.descripcion}</p>
      <p className="mt-1 text-xs text-brand-muted">
        {item.cantidad} × {formatClp(item.precioUnitario)}
        <span className={completed ? 'text-brand-mintInk' : ''}>
          {' '}
          ·{' '}
          {completed
            ? item.tipoLinea === 'parte'
              ? 'Utilizado'
              : 'Terminado'
            : item.estadoOperativo === 'en_proceso'
              ? 'En proceso'
              : 'Pendiente'}
        </span>
      </p>
    </div>
    <span className="shrink-0 text-sm font-bold text-brand-ink">{formatClp(item.subtotal)}</span>
  </li>
);

export const PaymentWorkSummary = ({ quotation, summary, pendingAmount }: Props) => {
  const items = quotation.items ?? [];
  const completed = items.filter((item) => item.estadoOperativo === 'completado');
  const pending = items.filter(
    (item) => item.estadoOperativo === 'pendiente' || item.estadoOperativo === 'en_proceso',
  );
  const completedValue = completed.reduce((total, item) => total + Number(item.subtotal), 0);

  return (
    <section className="min-w-0 space-y-5" aria-label="Resumen de trabajos y cobros">
      <div className="border-b border-brand-line pb-4">
        <p className="text-xs font-semibold uppercase text-brand-muted">Cliente</p>
        <p className="mt-1 break-words font-bold text-brand-primaryInk">
          {quotation.client?.nombre ?? 'Sin cliente asignado'}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-brand-muted">
          {quotation.vehicle && (
            <span className="font-mono font-bold text-brand-ink">{quotation.vehicle.patente}</span>
          )}
          {quotation.vehicle && (
            <span>
              {[quotation.vehicle.marca, quotation.vehicle.modelo].filter(Boolean).join(' ')}
            </span>
          )}
          <span>{quotation.workOrder?.codigo ?? 'Cotización sin OT'}</span>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-4 border-b border-brand-line pb-4">
        <div>
          <dt className="text-xs text-brand-muted">Total cotizado</dt>
          <dd
            className="mt-1 text-lg font-bold text-brand-ink"
            data-testid="payment-quotation-total"
          >
            {formatClp(summary.total)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-brand-muted">Pagos confirmados</dt>
          <dd className="mt-1 text-lg font-bold text-brand-mintInk" data-testid="payment-confirmed">
            {formatClp(summary.pagado)}
          </dd>
        </div>
        {pendingAmount > 0 && (
          <div className="col-span-2 flex flex-wrap justify-between gap-2 text-sm text-brand-goldInk">
            <dt>Abonos en verificación</dt>
            <dd className="font-semibold">{formatClp(pendingAmount)}</dd>
          </div>
        )}
      </dl>

      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold text-brand-ink">
          <CheckCircle2 className="h-4 w-4 text-brand-mintInk" aria-hidden="true" />
          Trabajos completados{' '}
          <span className="ml-auto rounded bg-brand-mintPale px-2 py-0.5 text-xs text-brand-mintInk">
            {completed.length}
          </span>
        </h3>
        {completed.length > 0 ? (
          <>
            <ul className="mt-2 divide-y divide-brand-line" aria-label="Trabajos completados">
              {completed.map((item) => (
                <WorkLine key={item.id} item={item} completed />
              ))}
            </ul>
            <dl className="flex flex-wrap justify-between gap-2 border-t border-brand-line py-3 text-sm text-brand-mintInk">
              <dt>Valor de trabajos completados</dt>
              <dd className="font-bold" data-testid="payment-completed-total">
                {formatClp(completedValue)}
              </dd>
            </dl>
          </>
        ) : (
          <div className="py-5 text-sm text-brand-muted">
            <p>Aún no hay trabajos marcados como terminados.</p>
            <p className="mt-1">El pago se registrará como anticipo a la cotización.</p>
          </div>
        )}
      </div>

      {pending.length > 0 && (
        <details className="border-t border-brand-line pt-3">
          <summary className="cursor-pointer text-sm font-semibold text-brand-muted">
            <Clock3 className="mr-2 inline h-4 w-4" aria-hidden="true" />
            Trabajos pendientes ({pending.length})
          </summary>
          <ul className="mt-2 divide-y divide-brand-line" aria-label="Trabajos pendientes">
            {pending.map((item) => (
              <WorkLine key={item.id} item={item} completed={false} />
            ))}
          </ul>
        </details>
      )}
      <p className="border-t border-brand-line pt-3 text-xs leading-relaxed text-brand-muted">
        Los abonos se aplican al saldo total de la cotización. El estado de cada trabajo indica su
        ejecución, no su pago individual.
      </p>
    </section>
  );
};

export default PaymentWorkSummary;
