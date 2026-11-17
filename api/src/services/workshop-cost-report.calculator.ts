import { sessionMinutesInRange } from '../utils/workshop-session-time.js';

import type {
  WorkOrderStatus,
  WorkshopCostReport,
  WorkshopCostReportFilters,
  WorkshopCostReportRow,
} from '@unithor/shared';

type Numeric = number | string | null;
export interface CostReportAssignment {
  id: number;
  workOrderId: number;
  workOrderItemId: number;
  userId: number;
  userName: string;
  active: boolean;
  specialtyId: number | null;
  specialtyName: string | null;
  costHourly: Numeric;
  saleHourly: Numeric;
  estimatedHours: Numeric;
  originalEstimatedHours: Numeric;
  createdAt: Date;
}
export interface CostReportSession {
  id: number;
  workOrderId: number;
  workOrderItemId: number;
  userId: number | null;
  userName: string | null;
  assignmentId: number | null;
  kind: string;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
  scheduledEndAt: Date | null;
  durationMinutes: number | null;
  supersededAt: Date | null;
}
export interface CostReportItem {
  id: number;
  workOrderId: number;
  descripcion: string;
  tipoLinea: string;
  cantidad: Numeric;
  horasHombreEstimadas: Numeric;
  assignedUserId: number | null;
  createdAt: Date;
  workOrder?: {
    id: number;
    codigo: string;
    estado: WorkOrderStatus;
    vehicle?: { patente: string } | null;
  };
}

const numberOrNull = (value: Numeric | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const round = (value: number): number =>
  Math.round((value + Math.sign(value) * Number.EPSILON) * 100) / 100;
const multiply = (a: number | null, b: number | null): number | null =>
  a === null || b === null ? null : round(a * b);

/** Signed adjustments are events; timers/manual replacements are clipped intervals. */
export const costReportSessionMinutes = (
  session: CostReportSession,
  start: Date,
  end: Date,
  now: Date,
): number => {
  return sessionMinutesInRange(session, start, end, now);
};

const sessionInPeriod = (
  session: CostReportSession,
  start: Date,
  end: Date,
  now: Date,
): boolean => {
  if (session.supersededAt || session.startedAt > now || session.startedAt >= end) return false;
  if (session.kind === 'ajuste') return session.startedAt >= start;
  const stop = Math.min(
    session.endedAt?.getTime() ?? now.getTime(),
    session.scheduledEndAt?.getTime() ?? Infinity,
    now.getTime(),
  );
  return stop > Math.max(start.getTime(), session.startedAt.getTime());
};

export const calculateWorkshopCostReport = (
  filters: WorkshopCostReportFilters,
  source: {
    items: CostReportItem[];
    assignments: CostReportAssignment[];
    sessions: CostReportSession[];
  },
  start: Date,
  end: Date,
  now: Date,
  behavior: { includeWithoutActivity?: boolean } = {},
): WorkshopCostReport => {
  const allRows: WorkshopCostReportRow[] = [];
  const assignmentsByItem = new Map<number, CostReportAssignment[]>();
  const sessionsByItem = new Map<number, CostReportSession[]>();
  // Deduplicate by primary key before doing arithmetic, even if a caller uses joined data.
  for (const assignment of new Map(source.assignments.map((row) => [row.id, row])).values()) {
    if (assignment.createdAt > now || assignment.createdAt >= end) continue;
    const list = assignmentsByItem.get(assignment.workOrderItemId) ?? [];
    list.push(assignment);
    assignmentsByItem.set(assignment.workOrderItemId, list);
  }
  for (const session of new Map(source.sessions.map((row) => [row.id, row])).values()) {
    if (!sessionInPeriod(session, start, end, now)) continue;
    const list = sessionsByItem.get(session.workOrderItemId) ?? [];
    list.push(session);
    sessionsByItem.set(session.workOrderItemId, list);
  }
  for (const item of new Map(source.items.map((row) => [row.id, row])).values()) {
    if (item.tipoLinea === 'parte' || !item.workOrder) continue;
    const assignments = (assignmentsByItem.get(item.id) ?? []).filter(
      (row) => row.workOrderId === item.workOrderId,
    );
    const sessions = (sessionsByItem.get(item.id) ?? []).filter(
      (row) => row.workOrderId === item.workOrderId,
    );
    const createdInPeriod =
      item.createdAt >= start && item.createdAt < end && item.createdAt <= now;
    if (!behavior.includeWithoutActivity && !sessions.length && !createdInPeriod && !assignments.some((row) => row.createdAt >= start))
      continue;
    const rows = new Map<string, WorkshopCostReportRow>();
    const makeRow = (
      key: string,
      assignment?: CostReportAssignment,
      userId: number | null = null,
      userName: string | null = null,
    ): WorkshopCostReportRow => ({
      key,
      workOrderId: item.workOrderId,
      workOrderCodigo: item.workOrder!.codigo,
      estado: item.workOrder!.estado,
      patente: item.workOrder!.vehicle?.patente ?? null,
      workOrderItemId: item.id,
      descripcion: item.descripcion,
      assignmentId: assignment?.id ?? null,
      assignmentActive: assignment?.active ?? null,
      userId: assignment?.userId ?? userId,
      userName: assignment?.userName ?? userName,
      specialtyId: assignment?.specialtyId ?? null,
      specialtyName: assignment?.specialtyName ?? null,
      includesEstimate: assignment?.active ?? false,
      estimatedHours: assignment?.active ? numberOrNull(assignment.estimatedHours) : null,
      originalEstimatedHours: numberOrNull(assignment?.originalEstimatedHours),
      actualMinutes: 0,
      actualHours: 0,
      sessions: 0,
      runningSessions: 0,
      costHourly: numberOrNull(assignment?.costHourly),
      saleHourly: numberOrNull(assignment?.saleHourly),
      estimatedCost: null,
      actualCost: null,
      actualSale: null,
      actualMargin: null,
    });
    for (const assignment of assignments) {
      if (assignment.active)
        rows.set(`assignment:${assignment.id}`, makeRow(`assignment:${assignment.id}`, assignment));
    }
    const assignmentMap = new Map(assignments.map((row) => [row.id, row]));
    for (const session of sessions) {
      const candidate =
        session.assignmentId === null ? undefined : assignmentMap.get(session.assignmentId);
      // Never price a dangling or misattributed link with another worker's snapshot.
      const assignment = candidate?.userId === session.userId ? candidate : undefined;
      const key = assignment
        ? `assignment:${assignment.id}`
        : `unlinked:${item.id}:${session.userId ?? 'unknown'}`;
      const row = rows.get(key) ?? makeRow(key, assignment, session.userId, session.userName);
      row.actualMinutes += costReportSessionMinutes(session, start, end, now);
      row.sessions += 1;
      if (
        session.status === 'abierta' &&
        !session.endedAt &&
        (!session.scheduledEndAt || session.scheduledEndAt > now)
      )
        row.runningSessions += 1;
      rows.set(key, row);
    }
    // Legacy item estimates are a single baseline, never repeated for every worker/session.
    if (!assignments.length) {
      const key = `legacy:${item.id}`;
      const row = makeRow(key, undefined, item.assignedUserId);
      row.includesEstimate = true;
      row.estimatedHours = multiply(
        numberOrNull(item.horasHombreEstimadas),
        numberOrNull(item.cantidad),
      );
      rows.set(key, row);
    }
    for (const row of rows.values()) {
      row.actualHours = round(row.actualMinutes / 60);
      row.estimatedCost = multiply(row.estimatedHours, row.costHourly);
      // Cost uses exact minutes; rounded display hours must never change money.
      row.actualCost = multiply(row.actualMinutes / 60, row.costHourly);
      row.actualSale = multiply(row.actualMinutes / 60, row.saleHourly);
      row.actualMargin =
        row.actualCost === null || row.actualSale === null
          ? null
          : round(row.actualSale - row.actualCost);
      allRows.push(row);
    }
  }
  const options = {
    workOrders: [
      ...new Map(
        allRows.map((row) => [
          row.workOrderId,
          { id: row.workOrderId, codigo: row.workOrderCodigo },
        ]),
      ).values(),
    ].sort((a, b) => a.codigo.localeCompare(b.codigo)),
    workers: [
      ...new Map(
        allRows
          .filter((row) => row.userId !== null)
          .map((row) => [
            row.userId!,
            { id: row.userId!, name: row.userName ?? `Trabajador #${row.userId}` },
          ]),
      ).values(),
    ].sort((a, b) => a.name.localeCompare(b.name)),
    specialties: [
      ...new Map(
        allRows
          .filter((row) => row.specialtyId !== null)
          .map((row) => [
            row.specialtyId!,
            { id: row.specialtyId!, name: row.specialtyName ?? `Especialidad #${row.specialtyId}` },
          ]),
      ).values(),
    ].sort((a, b) => a.name.localeCompare(b.name)),
  };
  const search = filters.search?.toLocaleLowerCase();
  const rows = allRows
    .filter(
      (row) =>
        (!filters.workOrderId || row.workOrderId === filters.workOrderId) &&
        (!filters.estado || row.estado === filters.estado) &&
        (!filters.userId || row.userId === filters.userId) &&
        (!filters.specialtyId || row.specialtyId === filters.specialtyId) &&
        (!search ||
          [row.workOrderCodigo, row.patente, row.descripcion, row.userName, row.specialtyName].some(
            (value) => value?.toLocaleLowerCase().includes(search),
          )),
    )
    .sort(
      (a, b) =>
        a.workOrderCodigo.localeCompare(b.workOrderCodigo) ||
        a.workOrderItemId - b.workOrderItemId ||
        a.key.localeCompare(b.key),
    );
  const sum = (
    key:
      | 'estimatedHours'
      | 'estimatedCost'
      | 'actualCost'
      | 'actualSale'
      | 'actualMinutes'
      | 'sessions'
      | 'runningSessions',
  ) => {
    const total = rows.reduce((sum, row) => sum + (row[key] ?? 0), 0);
    return key === 'actualMinutes' ? total : round(total);
  };
  const plans = rows.filter((row) => row.includesEstimate);
  const missingEstimateCount = plans.filter((row) => row.estimatedHours === null).length;
  const missingCostRateCount = rows.filter((row) => row.costHourly === null).length;
  const missingSaleRateCount = rows.filter((row) => row.saleHourly === null).length;
  const actualCost = missingCostRateCount ? null : sum('actualCost');
  const actualSale = missingSaleRateCount ? null : sum('actualSale');
  return {
    generadoEn: now.toISOString(),
    currency: 'CLP',
    filters,
    period: { start: start.toISOString(), endExclusive: end.toISOString() },
    rows,
    options,
    totals: {
      rows: rows.length,
      workOrders: new Set(rows.map((row) => row.workOrderId)).size,
      workers: new Set(rows.flatMap((row) => (row.userId === null ? [] : [row.userId]))).size,
      sessions: sum('sessions'),
      runningSessions: sum('runningSessions'),
      estimatedHours: missingEstimateCount ? null : sum('estimatedHours'),
      knownEstimatedHours: sum('estimatedHours'),
      actualMinutes: sum('actualMinutes'),
      actualHours: round(sum('actualMinutes') / 60),
      estimatedCost: plans.some((row) => row.estimatedCost === null) ? null : sum('estimatedCost'),
      knownEstimatedCost: sum('estimatedCost'),
      actualCost,
      knownActualCost: sum('actualCost'),
      actualSale,
      knownActualSale: sum('actualSale'),
      actualMargin:
        actualCost === null || actualSale === null ? null : round(actualSale - actualCost),
      missingEstimateCount,
      missingCostRateCount,
      missingSaleRateCount,
      unlinkedSessionCount: rows
        .filter((row) => row.assignmentId === null)
        .reduce((total, row) => total + row.sessions, 0),
    },
    notes: [
      'Uso interno y confidencial. Costos de mano de obra; no enviar a clientes.',
      'Horas reales limitadas al período y al momento de emisión; los cronómetros respetan su salida programada. Sesiones sustituidas excluidas.',
      'Estimación del equipo vigente de los servicios con actividad o altas en el período; las asignaciones históricas solo aportan horas reales. Las estimaciones no se prorratean por fecha.',
      'Tarifas históricas de la asignación vinculada. Sin vínculo o sin tarifa: importe desconocido, nunca gratuito. Los subtotales conocidos no constituyen el costo total.',
      'Los ajustes manuales conservan su signo y se contabilizan en su fecha de registro. Las correcciones sustituyen la sesión original.',
    ],
  };
};
