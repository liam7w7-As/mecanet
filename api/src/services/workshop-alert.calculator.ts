import { costReportSessionMinutes } from './workshop-cost-report.calculator.js';

import type { CostReportSession } from './workshop-cost-report.calculator.js';
import type {
  WorkshopAlertKind,
  WorkshopAlertSummary,
  WorkshopAlertTolerances,
  WorkshopOperationalAlert,
} from '@unithor/shared';

type Numeric = number | string | null | undefined;
export interface AlertItem {
  id: number;
  workOrderId: number;
  descripcion: string;
  tipoLinea: string;
  unidadMedida: string;
  catalogItemId: number | null;
  cantidad: Numeric;
  precioUnitario?: Numeric;
  horasHombreEstimadas: Numeric;
  horasHombreReales?: Numeric;
  estadoOperativo: string;
  qualityStatus: string;
  assignedUserId: number | null;
  teamManaged: boolean;
}
export interface AlertOrder {
  id: number;
  codigo: string;
  estado: string;
  fechaEntrega: Date | null;
  assignedMechanicId: number | null;
  qualityApprovedAt: Date | null;
}
export interface AlertAssignment {
  id: number;
  workOrderId: number;
  workOrderItemId: number;
  userId: number;
  active: boolean;
  estimatedHours: Numeric;
  saleHourly?: Numeric;
}
export interface AlertQuotationLine {
  id: number;
  quotationId: number;
  workOrderItemId: number | null;
  catalogItemId: number | null;
  descripcion: string;
  tipoLinea: string;
  unidadMedida: string;
  precioUnitario: Numeric;
  subtotal: Numeric;
}
export interface AlertQuotation {
  id: number;
  workOrderId: number | null;
  total: Numeric;
  items: AlertQuotationLine[];
}
export interface AlertReview {
  id: number;
  workOrderId: number;
  workOrderItemId: number | null;
  userId?: number;
}
export interface AlertWorkerDay {
  userId: number;
  name: string;
  configured: boolean;
  start: Date | null;
  end: Date | null;
  intervals?: Array<{ start: Date; end: Date }>;
  dayStart?: Date;
  dayEnd?: Date;
  /** All the worker's canonical sessions on that day, across every order. */
  sessions: CostReportSession[];
}
export interface WorkshopAlertSource {
  orders: AlertOrder[];
  items: AlertItem[];
  assignments: AlertAssignment[];
  sessions: CostReportSession[];
  quotations: AlertQuotation[];
  timeRequests: AlertReview[];
  priceRequests: AlertReview[];
  workers: AlertWorkerDay[];
  scheduleConfigured: boolean;
}
const number = (value: Numeric): number | null =>
  value === null || value === undefined || value === '' || !Number.isFinite(Number(value))
    ? null
    : Number(value);
const round = (value: number) => Math.round(value * 100) / 100;
const hourText = (minutes: number) => `${round(minutes / 60)} h`;
const moneyText = (value: number) =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value);
const identity = (
  row: Pick<AlertItem, 'catalogItemId' | 'descripcion' | 'tipoLinea' | 'unidadMedida'>,
) => JSON.stringify([row.catalogItemId, row.descripcion, row.tipoLinea, row.unidadMedida]);
const allMinutes = (session: CostReportSession, now: Date) =>
  costReportSessionMinutes(session, new Date(0), new Date(now.getTime() + 1), now);

/** Commercial data is only usable when both the quote and service match are unambiguous. */
export const getAlertQuotedService = (
  item: AlertItem,
  orderItems: AlertItem[],
  quotations: AlertQuotation[],
): { price: number | null; net: number | null } => {
  const quotes = quotations.filter((quote) => quote.workOrderId === item.workOrderId);
  if (quotes.length !== 1)
    return { price: quotes.length ? null : number(item.precioUnitario), net: null };
  const quote = quotes[0];
  let lines = quote.items.filter((line) => line.workOrderItemId === item.id);
  if (
    !lines.length &&
    orderItems.filter((other) => identity(other) === identity(item)).length === 1
  ) {
    lines = quote.items.filter(
      (line) => line.workOrderItemId === null && identity(line) === identity(item),
    );
  }
  if (lines.length !== 1) return { price: null, net: null };
  const price = number(lines[0].precioUnitario);
  const quoteNet = number(quote.total);
  const amounts = quote.items.map((line) => number(line.subtotal));
  if (quoteNet === null || amounts.some((amount) => amount === null || amount < 0))
    return { price, net: null };
  const sum = amounts.reduce<number>((total, amount) => total + amount!, 0);
  if (sum <= 0 || quoteNet < 0 || quoteNet > sum + 0.01) return { price, net: null };
  // Stored line subtotals already include line discounts. Allocate the stored
  // document's general discount proportionally; never use pagado or IVA.
  return { price, net: round((Number(lines[0].subtotal) * quoteNet) / sum) };
};

export function calculateWorkshopAlerts(
  source: WorkshopAlertSource,
  settings: WorkshopAlertTolerances,
  actor: { id: number; mechanic: boolean },
  now: Date,
  date: string,
  onlyOrderId?: number,
): WorkshopAlertSummary {
  const alerts: WorkshopOperationalAlert[] = [];
  const orders = new Map(
    source.orders
      .filter((order) => !['cancelada', 'entregada'].includes(order.estado))
      .map((order) => [order.id, order]),
  );
  const add = (
    kind: WorkshopAlertKind,
    suffix: string | number,
    title: string,
    description: string,
    priority: WorkshopOperationalAlert['priority'],
    order?: AlertOrder,
    itemId: number | null = null,
    userId: number | null = null,
  ) => {
    alerts.push({
      id: `${kind}:${suffix}`,
      kind,
      title,
      description,
      priority,
      workOrderId: order?.id ?? null,
      workOrderCodigo: order?.codigo ?? null,
      itemId,
      userId: actor.mechanic ? actor.id : userId,
      href: order
        ? `${actor.mechanic ? '/work-orders/mine' : '/work-orders'}?manage=${order.id}`
        : actor.mechanic
          ? '/work-orders/mine'
          : `/work-orders/daily-report?fecha=${date}`,
    });
  };
  const assignments = new Map(source.assignments.map((assignment) => [assignment.id, assignment]));
  const visibleItems = source.items.filter((item) => {
    const order = orders.get(item.workOrderId);
    if (!order) return false;
    return (
      !actor.mechanic ||
      (item.teamManaged
        ? source.assignments.some(
            (a) =>
              a.workOrderItemId === item.id &&
              a.workOrderId === item.workOrderId &&
              a.active &&
              a.userId === actor.id,
          )
        : (item.assignedUserId ?? order.assignedMechanicId) === actor.id)
    );
  });
  const itemIds = new Set(visibleItems.map((item) => item.id));
  const sessions = [
    ...new Map(source.sessions.map((session) => [session.id, session])).values(),
  ].filter((session) => {
    if (session.supersededAt || !itemIds.has(session.workOrderItemId)) return false;
    const item = visibleItems.find((row) => row.id === session.workOrderItemId)!;
    if (session.workOrderId !== item.workOrderId) return false;
    if (!actor.mechanic) return true;
    const assignment =
      session.assignmentId === null ? undefined : assignments.get(session.assignmentId);
    return (
      session.userId === actor.id &&
      (session.assignmentId === null ||
        Boolean(
          assignment &&
          assignment.userId === actor.id &&
          assignment.workOrderItemId === item.id &&
          assignment.workOrderId === item.workOrderId,
        ))
    );
  });
  for (const item of visibleItems.filter((item) => item.tipoLinea !== 'parte')) {
    const order = orders.get(item.workOrderId)!;
    const team = source.assignments.filter(
      (a) =>
        a.workOrderItemId === item.id &&
        a.workOrderId === order.id &&
        a.active &&
        (!actor.mechanic || a.userId === actor.id),
    );
    const estimates = team.map((a) => number(a.estimatedHours));
    const estimate =
      item.teamManaged || team.length > 0
        ? !team.length || estimates.some((value) => value === null)
          ? null
          : estimates.reduce<number>((sum, value) => sum + value!, 0)
        : number(item.horasHombreEstimadas) === null || number(item.cantidad) === null
          ? null
          : Number(item.horasHombreEstimadas) * Number(item.cantidad);
    const itemSessions = sessions.filter((session) => session.workOrderItemId === item.id);
    const hasAnySession = source.sessions.some(
      (session) => session.workOrderItemId === item.id && session.workOrderId === order.id,
    );
    const minutes =
      !actor.mechanic && !hasAnySession && number(item.horasHombreReales) !== null
        ? Math.max(0, Number(item.horasHombreReales) * 60)
        : itemSessions.reduce((sum, session) => sum + allMinutes(session, now), 0);
    if (
      estimate !== null &&
      estimate >= 0 &&
      minutes > estimate * 60 * (1 + settings.timeTolerancePercent / 100) + 0.00001
    ) {
      add(
        'time_deviation',
        item.id,
        'Horas sobre la estimación',
        `${item.descripcion}: ${hourText(minutes)} registradas frente a ${round(estimate)} h estimadas.`,
        'high',
        order,
        item.id,
        actor.mechanic ? actor.id : null,
      );
    }
    if (item.qualityStatus === 'rechazado')
      add(
        'quality_rejected',
        item.id,
        'Calidad rechazada',
        `${item.descripcion} requiere corrección y nueva revisión de calidad.`,
        'high',
        order,
        item.id,
        actor.mechanic ? actor.id : null,
      );
    else if (
      ['completado', 'omitido'].includes(item.estadoOperativo) &&
      item.qualityStatus !== 'aprobado'
    )
      add(
        'quality_pending',
        item.id,
        'Calidad pendiente',
        `${item.descripcion} está resuelto y requiere revisión de calidad.`,
        'medium',
        order,
        item.id,
        actor.mechanic ? actor.id : null,
      );
    if (actor.mechanic) continue;
    const quoted = getAlertQuotedService(
      item,
      visibleItems.filter((row) => row.workOrderId === order.id),
      source.quotations,
    );
    if (quoted.price !== null && quoted.price <= 0)
      add(
        'valuation_pending',
        item.id,
        'Servicio sin valorización positiva',
        `Falta definir un precio positivo para ${item.descripcion}.`,
        ['completado', 'omitido'].includes(item.estadoOperativo) ? 'high' : 'normal',
        order,
        item.id,
      );
    if (quoted.net === null || quoted.net <= 0 || minutes <= 0 || !itemSessions.length) continue;
    let theoretical = 0;
    let known = true;
    for (const session of itemSessions) {
      const duration = allMinutes(session, now);
      if (!duration) continue;
      const snapshot =
        session.assignmentId === null ? undefined : assignments.get(session.assignmentId);
      const sale =
        snapshot &&
        snapshot.userId === session.userId &&
        snapshot.workOrderId === order.id &&
        snapshot.workOrderItemId === item.id
          ? number(snapshot.saleHourly)
          : null;
      if (sale === null) {
        known = false;
        break;
      }
      theoretical += (duration / 60) * sale;
    }
    if (
      known &&
      Math.abs(round(theoretical) - quoted.net) >
        (quoted.net * settings.commercialTolerancePercent) / 100 + 0.009
    ) {
      add(
        'commercial_difference',
        item.id,
        'Diferencia comercial de mano de obra',
        `${item.descripcion}: venta teórica por horas ${moneyText(round(theoretical))}; neto cotizado ${moneyText(quoted.net)}. Revisar la valorización, sin ajustes automáticos.`,
        'medium',
        order,
        item.id,
      );
    }
  }
  for (const order of orders.values()) {
    const items = visibleItems.filter((item) => item.workOrderId === order.id);
    if (actor.mechanic && !items.length) continue;
    if (order.estado === 'esperando_repuesto')
      add(
        'waiting_parts',
        order.id,
        'Espera de repuestos',
        'La orden está detenida a la espera de repuestos.',
        'normal',
        order,
      );
    if (order.fechaEntrega && order.fechaEntrega < now)
      add(
        'delivery_overdue',
        order.id,
        'Entrega vencida',
        'La fecha de entrega registrada ya pasó y la orden continúa abierta.',
        'high',
        order,
      );
    if (
      !actor.mechanic &&
      items.length &&
      items.every(
        (item) =>
          ['completado', 'omitido'].includes(item.estadoOperativo) &&
          (item.tipoLinea === 'parte' || item.qualityStatus === 'aprobado'),
      ) &&
      !order.qualityApprovedAt
    )
      add(
        'quality_pending',
        `final:${order.id}`,
        'Confirmación final de calidad pendiente',
        'Todos los trabajos y repuestos están resueltos y revisados; falta la confirmación final de calidad.',
        'medium',
        order,
      );
  }
  for (const request of source.timeRequests) {
    const order = orders.get(request.workOrderId);
    if (
      !order ||
      (request.workOrderItemId !== null && !itemIds.has(request.workOrderItemId)) ||
      (actor.mechanic && request.userId !== actor.id)
    )
      continue;
    add(
      'time_review_pending',
      request.id,
      'Horas pendientes de revisión',
      'Hay una solicitud de registro o corrección de horas pendiente de aprobación.',
      'medium',
      order,
      request.workOrderItemId,
      request.userId ?? null,
    );
  }
  if (!actor.mechanic)
    for (const request of source.priceRequests) {
      const order = orders.get(request.workOrderId);
      if (order)
        add(
          'price_review_pending',
          request.id,
          'Precio pendiente de revisión',
          'Hay una propuesta de precio pendiente de aprobación.',
          'medium',
          order,
          request.workOrderItemId,
        );
    }
  for (const worker of source.workers) {
    if (actor.mechanic && worker.userId !== actor.id) continue;
    const intervals = worker.intervals ?? (worker.start && worker.end ? [{ start: worker.start, end: worker.end }] : []);
    const lastEnd = intervals.reduce((latest, span) => Math.max(latest, span.end.getTime()), 0);
    if (!worker.configured || !intervals.length || lastEnd > now.getTime()) continue;
    const expected = intervals.reduce((sum, span) => sum + Math.max(0, (span.end.getTime() - span.start.getTime()) / 60000), 0);
    if (!expected) continue;
    // Intervals establish shift coverage. Declared hours are a daily quantity,
    // independent of the midnight storage marker and of particular shift spans.
    const daySessions = [...new Map(worker.sessions.filter((s) => s.userId === worker.userId).map((s) => [s.id, s])).values()];
    const declared = daySessions.filter((session) => session.reportedDate === date && !session.overtime)
      .reduce((sum, session) => sum + costReportSessionMinutes(session, worker.dayStart ?? new Date(0), worker.dayEnd ?? new Date(now.getTime() + 1), now), 0);
    const recorded = Math.max(
      0,
      [
        ...new Map(
          daySessions.filter((s) => s.kind !== 'ajuste' && !s.reportedDate).map((s) => [s.id, s]),
        ).values(),
      ].reduce(
        (sum, session) =>
          sum +
          intervals.reduce((minutes, span) => minutes + costReportSessionMinutes(session, span.start, span.end, now), 0),
        0,
      ) + declared,
    );
    if (expected - recorded <= (expected * settings.timeTolerancePercent) / 100 + 0.00001) continue;
    const order = onlyOrderId ? orders.get(onlyOrderId) : undefined;
    add(
      recorded <= 0 ? 'no_daily_record' : 'unregistered_time',
      `${date}:${worker.userId}`,
      recorded <= 0 ? 'Jornada sin horas registradas' : 'Horas de jornada sin registrar',
      `${actor.mechanic ? 'Tu jornada' : `La jornada de ${worker.name}`} finalizó: ${hourText(recorded)} registradas para las ${hourText(expected)} configuradas.${declared ? ' Incluye horas declaradas para la fecha, sin intervalo horario.' : ''} Las horas adicionales se conservan por separado; revisar registros pendientes. No se aplican descuentos ni sanciones.`,
      'medium',
      order,
      null,
      worker.userId,
    );
  }
  const priority = { high: 0, medium: 1, normal: 2 };
  const unique = [...new Map(alerts.map((alert) => [alert.id, alert])).values()].sort(
    (a, b) => priority[a.priority] - priority[b.priority] || a.id.localeCompare(b.id),
  );
  return {
    generatedAt: now.toISOString(),
    alerts: unique,
    counts: {
      total: unique.length,
      high: unique.filter((alert) => alert.priority === 'high').length,
    },
    settings: { ...settings },
    scheduleConfigured: source.scheduleConfigured,
  };
}
