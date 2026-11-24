import { createWorkshopCommercialReviewSchema, WORKSHOP_DIFFERENCE_REASONS } from '@unithor/shared';
import { useRef, useState } from 'react';

import { useWorkshopCommercialReview } from '../../hooks/useWorkshopPerformance';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDateTime } from '../../lib/formatters';

import type {
  WorkshopCommercialReviewRecord,
  WorkshopCommercialSnapshot,
  WorkshopPerformanceReport,
} from '@unithor/shared';
import type { FormEvent, ReactNode } from 'react';

const number = (value: number | null): string =>
  value === null || !Number.isFinite(value)
    ? 'Sin datos'
    : new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(value);
const hours = (value: number | null): string =>
  value === null || !Number.isFinite(value) ? 'Sin base' : `${number(value)} h`;
const signedHours = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) return 'Sin base';
  if (value === 0) return '0 h';
  return `${number(Math.abs(value))} h ${value > 0 ? 'a favor' : 'en contra'}`;
};
const percent = (value: number | null): string =>
  value === null || !Number.isFinite(value) ? 'Sin base' : `${number(value)} %`;
const money = (value: number | null): string =>
  value === null || !Number.isFinite(value) ? 'Sin base' : formatClp(value);
const reasons: Record<WorkshopCommercialReviewRecord['reason'], string> = {
  descuento: 'Descuento',
  garantia: 'Garantía',
  error: 'Error',
  cortesia: 'Cortesía',
  retrabajo: 'Retrabajo',
  complejidad: 'Complejidad',
  otro: 'Otro',
};

const Metric = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <dt className="text-xs text-brand-muted">{label}</dt>
    <dd className="mt-1 font-semibold">{children}</dd>
  </div>
);

const Snapshot = ({ snapshot }: { snapshot: WorkshopCommercialSnapshot }) => (
  <dl className="grid gap-3 sm:grid-cols-2">
    <Metric label="Horas reales acumuladas">{hours(snapshot.actualHours)}</Metric>
    <Metric label="Tarifa de referencia por hora">{money(snapshot.referenceHourlyRate)}</Metric>
    {snapshot.referenceSource && (
      <Metric label="Origen de referencia">
        {snapshot.referenceSource === 'manual' ? 'Manual explícita' : 'Histórica'}
      </Metric>
    )}
    <Metric label="Teórico neto">{money(snapshot.theoreticalNet)}</Metric>
    <Metric label="Cotizado neto">{money(snapshot.quotedNet)}</Metric>
    <Metric label="Recibido neto estimado (prorrateado)">{money(snapshot.receivedNet)}</Metric>
    <Metric label="Horas equivalentes cotizadas">{hours(snapshot.equivalentQuotedHours)}</Metric>
    <Metric label="Horas equivalentes recibidas">{hours(snapshot.equivalentReceivedHours)}</Metric>
    <Metric label="Diferencia de horas">{signedHours(snapshot.hoursDifference)}</Metric>
    <Metric label="Diferencia neta">{money(snapshot.netDifference)}</Metric>
    <Metric label="Costo real acumulado">{money(snapshot.actualCost)}</Metric>
    <Metric label="Margen comercial">{money(snapshot.commercialMargin)}</Metric>
  </dl>
);

const CommercialReviews = ({ report }: { report: WorkshopPerformanceReport }) => {
  const mutation = useWorkshopCommercialReview();
  const submitting = useRef(false);
  const [serviceId, setServiceId] = useState('');
  const [reason, setReason] = useState<WorkshopCommercialReviewRecord['reason']>('descuento');
  const [note, setNote] = useState('');
  const [rate, setRate] = useState('');
  const [validation, setValidation] = useState('');
  const [saved, setSaved] = useState<WorkshopCommercialReviewRecord[]>([]);
  const reviews = [
    ...new Map(
      [
        ...report.analysis.commercial.services.flatMap((service) =>
          service.latestReview ? [service.latestReview] : [],
        ),
        ...report.analysis.commercial.reviews,
        ...saved.filter((review) =>
          report.analysis.commercial.services.some(
            (service) => service.workOrderItemId === review.workOrderItemId,
          ),
        ),
      ].map((review) => [review.id, review]),
    ).values(),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
  const services = report.analysis.commercial.services;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current || mutation.isPending || !mutation.allowed) return;
    const parsed = createWorkshopCommercialReviewSchema.safeParse({
      workOrderItemId: Number(serviceId),
      reason,
      note,
      ...(rate.trim() ? { referenceHourlyRate: Number(rate) } : {}),
    });
    if (
      !parsed.success ||
      !services.some((service) => service.workOrderItemId === Number(serviceId))
    ) {
      setValidation(
        !serviceId
          ? 'Selecciona el servicio que deseas analizar.'
          : parsed.success
            ? 'El servicio ya no está en este informe.'
            : parsed.error.issues[0].path[0] === 'referenceHourlyRate'
              ? 'La tarifa de referencia debe ser un número positivo válido.'
              : parsed.error.issues[0].message,
      );
      return;
    }
    setValidation('');
    submitting.current = true;
    try {
      const review = await mutation.mutateAsync(parsed.data);
      setSaved((previous) => [...previous, review]);
      setNote('');
      setRate('');
    } catch {
      // The draft stays intact; retry is an explicit action on this append-only endpoint.
    } finally {
      submitting.current = false;
    }
  };
  return (
    <div className="space-y-4">
      {mutation.allowed && (
        <form
          onSubmit={(event) => void submit(event)}
          className="rounded-2xl border border-brand-line bg-white p-5 space-y-3"
          aria-label="Guardar análisis comercial"
        >
          <h3>Guardar análisis de diferencias</h3>
          <p className="text-sm text-brand-muted">
            Cada análisis añade una captura del servidor al historial. No modifica precios, horas ni
            abonos.
          </p>
          <fieldset disabled={mutation.isPending} className="grid gap-3 sm:grid-cols-2">
            <label>
              Servicio a analizar
              <select
                aria-label="Servicio a analizar"
                value={serviceId}
                onChange={(event) => setServiceId(event.target.value)}
                className="mt-1 w-full px-3 text-sm"
                required
              >
                <option value="">Selecciona un servicio</option>
                {services.map((service) => (
                  <option key={service.workOrderItemId} value={service.workOrderItemId}>
                    {service.workOrderCodigo} · {service.description}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Motivo
              <select
                aria-label="Motivo de diferencia"
                value={reason}
                onChange={(event) => setReason(event.target.value as typeof reason)}
                className="mt-1 w-full px-3 text-sm"
              >
                {WORKSHOP_DIFFERENCE_REASONS.map((value) => (
                  <option key={value} value={value}>
                    {reasons[value]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tarifa de referencia por hora (opcional, CLP)
              <input
                aria-label="Tarifa de referencia por hora"
                type="number"
                min="0"
                max="9999999999.99"
                step="any"
                value={rate}
                onChange={(event) => setRate(event.target.value)}
                placeholder="Sin tarifa explícita"
                className="mt-1 w-full px-3 text-sm"
              />
            </label>
            <label>
              Nota obligatoria
              <textarea
                aria-label="Nota del análisis"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                minLength={2}
                maxLength={2000}
                required
                className="mt-1 w-full rounded-lg border border-brand-line px-3 py-2 text-sm"
              />
            </label>
          </fieldset>
          {validation && (
            <p role="alert" className="text-sm text-brand-coralInk">
              {validation}
            </p>
          )}
          {mutation.isError && (
            <p role="alert" className="text-sm text-brand-coralInk">
              {getApiErrorMessage(mutation.error, 'No se pudo guardar el análisis.')} El borrador se
              conserva para reintentar.
            </p>
          )}
          {mutation.isSuccess && (
            <p role="status" className="text-sm text-brand-muted">
              Análisis guardado en el historial.
            </p>
          )}
          <button
            type="submit"
            className="secondary-button"
            disabled={mutation.isPending || services.length === 0}
          >
            {mutation.isPending
              ? 'Guardando análisis…'
              : mutation.isError
                ? 'Reintentar guardar análisis'
                : 'Guardar análisis'}
          </button>
        </form>
      )}
      <div
        className="rounded-2xl border border-brand-line bg-white p-5 space-y-3"
        aria-label="Historial de análisis comerciales"
      >
        <h3>Historial de análisis · {reviews.length}</h3>
        {reviews.map((review) => {
          const service = services.find((item) => item.workOrderItemId === review.workOrderItemId);
          return (
            <details key={review.id} className="border-t border-brand-line pt-3">
              <summary className="cursor-pointer text-sm">
                {service
                  ? `${service.workOrderCodigo} · ${service.description}`
                  : `OT #${review.workOrderId} · Servicio #${review.workOrderItemId}`}{' '}
                · {reasons[review.reason]} · {review.createdByName} ·{' '}
                {formatDateTime(review.createdAt)}
              </summary>
              <p className="my-3 whitespace-pre-wrap break-words text-sm">{review.note}</p>
              <Snapshot snapshot={review.snapshot} />
            </details>
          );
        })}
        {reviews.length === 0 && (
          <p className="text-sm text-brand-muted">Sin análisis guardados para estos servicios.</p>
        )}
      </div>
    </div>
  );
};

export default function WorkshopPerformanceAnalysis({
  report,
}: {
  report: WorkshopPerformanceReport;
}) {
  const { utilization, efficiency, quality, commercial, periods } = report.analysis;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <section
          aria-label="Productividad"
          className="rounded-2xl border border-brand-line bg-white p-5 space-y-3"
        >
          <h3>Productividad del período</h3>
          <dl className="grid grid-cols-2 gap-3">
            <Metric label="Utilización">{percent(utilization.registeredPercent)}</Metric>
            <Metric label="Eficiencia">{percent(efficiency.percent)}</Metric>
            <Metric label="Horas registradas">{hours(utilization.registeredHours)}</Metric>
            <Metric label="Horas regulares">{hours(utilization.regularHours)}</Metric>
            <Metric label="Horas extra">{hours(utilization.extraHours)}</Metric>
            <Metric label="Horas programadas">{hours(utilization.scheduledHours)}</Metric>
            <Metric label="Horas sin registro">{hours(utilization.unregisteredHours)}</Metric>
            <Metric label="Trabajadores">{number(utilization.workers)}</Metric>
            <Metric label="Horas estimadas">{hours(efficiency.estimatedHours)}</Metric>
            <Metric label="Horas reales">{hours(efficiency.actualHours)}</Metric>
            <Metric label="Desviación de horas">{hours(efficiency.deviationHours)}</Metric>
          </dl>
          <p className="text-xs text-brand-muted">
            Utilización: registro / programación. Eficiencia: estimadas / reales. Sin base indica un
            denominador ausente o cero.
          </p>
        </section>
        <section
          aria-label="Calidad"
          className="rounded-2xl border border-brand-line bg-white p-5 space-y-3"
        >
          <h3>Calidad del período</h3>
          <dl className="grid grid-cols-2 gap-3">
            <Metric label="Primera aprobación">{percent(quality.firstPassPercent)}</Metric>
            <Metric label="Aprobados a la primera">{number(quality.firstPassApproved)}</Metric>
            <Metric label="Servicios revisados">{number(quality.reviewedServices)}</Metric>
            <Metric label="Rechazos">{number(quality.rejections)}</Metric>
            <Metric label="Servicios pendientes">{number(quality.pendingServices)}</Metric>
            <Metric label="Horas de retrabajo">{hours(quality.reworkHours)}</Metric>
          </dl>
        </section>
        <section
          aria-label="Comparación comercial acumulada"
          className="rounded-2xl border border-brand-line bg-white p-5 space-y-3"
        >
          <h3>Comparación comercial acumulada</h3>
          <Snapshot snapshot={commercial.totals} />
        </section>
      </div>
      <p className="text-sm text-brand-muted">
        La comparación comercial acumula los servicios seleccionados, incluidas sus horas fuera del
        período. Recibido neto estimado: prorrateo de cobros de la cotización, no un cobro atribuido
        al servicio. Diferencias: cotizado menos teórico y horas equivalentes cotizadas menos
        reales. Margen comercial: cotizado neto menos costo de mano de obra; no representa beneficio
        contable.
      </p>
      <div className="report-table-panel overflow-hidden rounded-2xl bg-white">
        <h3 className="border-b px-5 py-4">
          Períodos agrupados ·{' '}
          {({ day: 'Día', week: 'Semana', month: 'Mes' } as const)[report.filters.groupBy]}
        </h3>
        <div className="data-scroll">
          <table className="workspace-table data-table" aria-label="Períodos agrupados">
            <thead>
              <tr>
                <th>Período</th>
                <th>H. registradas</th>
                <th>H. extra</th>
                <th>H. programadas</th>
                <th>H. sin registro</th>
                <th>Utilización</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((period) => (
                <tr key={period.key}>
                  <td data-label="Período">{period.label}</td>
                  <td data-label="H. registradas">{hours(period.registeredHours)}</td>
                  <td data-label="H. extra">{hours(period.extraHours)}</td>
                  <td data-label="H. programadas">{hours(period.scheduledHours)}</td>
                  <td data-label="H. sin registro">{hours(period.unregisteredHours)}</td>
                  <td data-label="Utilización">{percent(period.utilizationPercent)}</td>
                </tr>
              ))}
              {periods.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty-row">
                    Sin períodos para los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="report-table-panel overflow-hidden rounded-2xl bg-white">
        <h3 className="border-b px-5 py-4">
          Comparación por servicio · {commercial.services.length}
        </h3>
        <div className="data-scroll">
          <table
            className="workspace-table data-table"
            aria-label="Comparación comercial por servicio"
          >
            <thead>
              <tr>
                <th>OT / servicio</th>
                <th>H. acumuladas</th>
                <th>Teórico neto</th>
                <th>Cotizado neto</th>
                <th>Recibido neto estimado</th>
                <th>H. equiv. cotizadas</th>
                <th>H. equiv. recibidas</th>
                <th>Diferencia horas</th>
                <th>Diferencia neta</th>
                <th>Costo acumulado</th>
                <th>Margen comercial</th>
              </tr>
            </thead>
            <tbody>
              {commercial.services.map((service) => (
                <tr key={service.workOrderItemId}>
                  <td data-label="OT / servicio">
                    {service.workOrderCodigo}
                    <span className="block text-xs text-brand-muted">
                      {service.description} · {service.patente ?? 'Sin patente'}
                    </span>
                    <span className="block text-xs text-brand-muted">
                      {service.quotationCode ?? 'Sin cotización'} · Referencia/h:{' '}
                      {money(service.referenceHourlyRate)}
                    </span>
                  </td>
                  <td data-label="H. acumuladas">{hours(service.actualHours)}</td>
                  <td data-label="Teórico neto">{money(service.theoreticalNet)}</td>
                  <td data-label="Cotizado neto">{money(service.quotedNet)}</td>
                  <td data-label="Recibido neto estimado">{money(service.receivedNet)}</td>
                  <td data-label="H. equiv. cotizadas">{hours(service.equivalentQuotedHours)}</td>
                  <td data-label="H. equiv. recibidas">{hours(service.equivalentReceivedHours)}</td>
                  <td data-label="Diferencia horas">{signedHours(service.hoursDifference)}</td>
                  <td data-label="Diferencia neta">{money(service.netDifference)}</td>
                  <td data-label="Costo acumulado">{money(service.actualCost)}</td>
                  <td data-label="Margen comercial">{money(service.commercialMargin)}</td>
                </tr>
              ))}
              {commercial.services.length === 0 && (
                <tr>
                  <td colSpan={11} className="empty-row">
                    Sin servicios para los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <CommercialReviews report={report} />
      {report.notes.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-brand-muted">
          {report.notes.map((note, index) => (
            <li key={index}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
