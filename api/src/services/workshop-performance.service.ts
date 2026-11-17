import { DEFAULT_WORKSHOP_TIMEZONE, DEFAULT_WORKSHOP_WEEKLY, createWorkshopCommercialReviewSchema, workshopPerformanceQuerySchema } from '@unithor/shared';
import { Op, Transaction } from 'sequelize';

import { hasPermission } from './permission.service.js';
import { commercialSnapshot, collectedServiceNet, discountedLineNets, totalCommercialSnapshots, roundMetric } from './workshop-commercial.calculator.js';
import { calculateWorkshopCostReport } from './workshop-cost-report.calculator.js';
import { getWorkshopCostReport } from './workshop-cost-report.service.js';
import { calculateQuality, calculateUtilization } from './workshop-performance.calculator.js';
import { getCivilDayRange, resolveWorkerShift } from './workshop-personnel.service.js';
import { withWorkshopTransaction } from './workshop-transaction.js';
import { sequelize } from '../config/database.js';
import { Quotation } from '../models/Quotation.js';
import { QuotationItem } from '../models/QuotationItem.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { Vehicle } from '../models/Vehicle.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderEvent } from '../models/WorkOrderEvent.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
import { WorkOrderItemAssignment } from '../models/WorkOrderItemAssignment.js';
import { WorkOrderItemSession } from '../models/WorkOrderItemSession.js';
import { WorkOrderQualityReview } from '../models/WorkOrderQualityReview.js';
import { WorkshopCommercialReview } from '../models/WorkshopCommercialReview.js';
import { WorkshopSchedule } from '../models/WorkshopSchedule.js';
import { WorkshopScheduleException } from '../models/WorkshopScheduleException.js';
import { ApiError } from '../utils/ApiError.js';

import type { PerformanceDay } from './workshop-performance.calculator.js';
import type { WorkshopPerformanceFilters, WorkshopPerformanceReport, WorkshopCommercialReviewRecord, CreateWorkshopCommercialReviewInput, WorkshopCommercialService } from '@unithor/shared';
import type { WhereOptions } from 'sequelize';

const LIMIT = 10_001;
const assertBound = (size: number): void => {
  if (size >= LIMIT) throw ApiError.badRequest('El informe supera 10.000 registros; acota el período o los filtros');
};

const reviewPublic = (row: WorkshopCommercialReview): WorkshopCommercialReviewRecord => ({
  id: row.id, workOrderId: row.workOrderId, workOrderItemId: row.workOrderItemId,
  reason: row.reason, note: row.note, createdBy: row.createdBy, createdByName: row.createdByName,
  createdAt: row.createdAt.toISOString(), snapshot: row.snapshot,
});

const dayString = (at: Date, timezone: string): string => new Intl.DateTimeFormat('en-CA', {
  timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(at);

export async function getWorkshopPerformanceReport(filters: WorkshopPerformanceFilters, snapshotTransaction?: Transaction): Promise<WorkshopPerformanceReport> {
  filters = workshopPerformanceQuerySchema.parse(filters);
  const read = async (transaction: Transaction): Promise<WorkshopPerformanceReport> => {
    const now = new Date();
    const schedule = await WorkshopSchedule.findByPk(1, { transaction });
    const timezone = schedule?.timezone ?? DEFAULT_WORKSHOP_TIMEZONE;
    const start = getCivilDayRange(filters.fechaDesde, timezone).start;
    const end = getCivilDayRange(filters.fechaHasta, timezone).end;
    const { vehicleId, catalogItemId, workOrderItemId, groupBy, ...costFilters } = filters;
    const report = await getWorkshopCostReport(costFilters, transaction);
    // Include services with a quality review in the period even when their last labor session predates it.
    const recentQuality = await WorkOrderQualityReview.findAll({
      attributes: ['workOrderItemId'], where: { workOrderItemId: { [Op.ne]: null }, createdAt: { [Op.gte]: start, [Op.lt]: end, [Op.lte]: now },
        ...(filters.workOrderId ? { workOrderId: filters.workOrderId } : {}) }, transaction, limit: LIMIT,
    });
    assertBound(recentQuality.length);
    const candidates = [...new Set([...report.rows.map((row) => row.workOrderItemId), ...recentQuality.flatMap((row) => row.workOrderItemId ? [row.workOrderItemId] : [])])];
    const itemWhere: WhereOptions = { tipoLinea: { [Op.ne]: 'parte' }, createdAt: { [Op.lte]: now },
      ...(filters.workOrderId ? { workOrderId: filters.workOrderId } : { id: { [Op.in]: candidates } }),
      ...(workOrderItemId ? { id: workOrderItemId } : {}),
      ...(catalogItemId ? { catalogItemId } : {}),
    };
    const items = await WorkOrderItem.findAll({ where: itemWhere,
      include: [{ model: WorkOrder, as: 'workOrder', paranoid: false, required: true,
        where: { ...(vehicleId ? { vehicleId } : {}), ...(filters.estado ? { estado: filters.estado } : {}) },
        attributes: ['id', 'codigo', 'estado', 'vehicleId'],
        include: [{ model: Vehicle, as: 'vehicle', paranoid: false, attributes: ['id', 'patente'] }] }],
      order: [['id', 'ASC']], limit: LIMIT, transaction,
    });
    assertBound(items.length);
    const itemIds = items.map((item) => item.id);
    const [assignments, sessions, reviews, commercialReviews] = itemIds.length ? await Promise.all([
      WorkOrderItemAssignment.findAll({ where: { workOrderItemId: { [Op.in]: itemIds } }, limit: LIMIT, transaction }),
      WorkOrderItemSession.findAll({ where: { workOrderItemId: { [Op.in]: itemIds }, supersededAt: null, startedAt: { [Op.lte]: now } }, limit: LIMIT, transaction }),
      WorkOrderQualityReview.findAll({ where: { workOrderItemId: { [Op.in]: itemIds }, createdAt: { [Op.lte]: now } }, order: [['createdAt', 'ASC'], ['id', 'ASC']], limit: LIMIT, transaction }),
      WorkshopCommercialReview.findAll({ where: { workOrderItemId: { [Op.in]: itemIds } }, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: LIMIT, transaction }),
    ]) : [[], [], [], []];
    for (const collection of [assignments, sessions, reviews, commercialReviews]) assertBound(collection.length);
    const { calculateFilteredReport } = await import('./workshop-performance-scope.js');
    const scope = calculateFilteredReport(filters, { items, assignments, sessions }, start, end, now);
    const rows = scope.rows;
    const selectedIds = new Set(scope.selectedItemIds);
    const selectedItems = items.filter((item) => selectedIds.has(item.id));
    const selectedSessions = sessions.filter((session) => scope.sessionKeys.has(
      assignments.some((assignment) => assignment.id === session.assignmentId && assignment.userId === session.userId)
        ? `assignment:${session.assignmentId}` : `unlinked:${session.workOrderItemId}:${session.userId ?? 'unknown'}`,
    ));
    const orderIds = [...new Set(selectedItems.map((item) => item.workOrderId))];
    const quotations = orderIds.length ? await Quotation.findAll({ where: { workOrderId: { [Op.in]: orderIds } },
      include: [{ model: QuotationItem, as: 'items' }], order: [['id', 'ASC']], transaction, limit: LIMIT }) : [];
    assertBound(quotations.length);
    const identities = selectedItems.length ? await WorkOrderItem.findAll({
      attributes: ['id', 'workOrderId', 'catalogItemId', 'tipoLinea', 'unidadMedida', 'descripcion'],
      where: { workOrderId: { [Op.in]: orderIds } }, limit: LIMIT, transaction,
    }) : [];
    assertBound(identities.length);
    const pricedQuotes = new Map<number, { nets: Map<number, number>; reconciled: boolean }>();
    for (const quote of quotations) {
      assertBound(quote.items?.length ?? 0);
      try {
        const nets = discountedLineNets(quote.items ?? [], quote);
        const computed = [...nets.values()].reduce((sum, value) => sum + value, 0);
        pricedQuotes.set(quote.id, { nets, reconciled: Math.abs(computed - Number(quote.total)) < 0.011 });
      } catch {
        pricedQuotes.set(quote.id, { nets: new Map(), reconciled: false });
      }
    }
    const lifetime = calculateWorkshopCostReport({ fechaDesde: '1000-01-01', fechaHasta: dayString(now, timezone) },
      { items: selectedItems, assignments, sessions }, new Date('1000-01-01T00:00:00Z'), now, now);
    const services: WorkshopCommercialService[] = selectedItems.map((item) => {
      const parts = lifetime.rows.filter((row) => row.workOrderItemId === item.id && row.actualMinutes !== 0);
      const sumKnown = (field: 'actualSale' | 'actualCost'): number | null => parts.some((row) => row[field] === null)
        ? null : roundMetric(parts.reduce((sum, row) => sum + row[field]!, 0));
      const matchingQuotes = quotations.filter((row) => row.workOrderId === item.workOrderId);
      const quotation = matchingQuotes.length === 1 ? matchingQuotes[0] : undefined;
      const lines = quotation?.items ?? [];
      const linked = lines.filter((line) => line.workOrderItemId === item.id);
      // Read-only legacy fallback only when both sides have a unique identity.
      const sameIdentity = (line: QuotationItem) => line.workOrderItemId === null && line.catalogItemId === item.catalogItemId &&
        line.tipoLinea === item.tipoLinea && line.unidadMedida === item.unidadMedida && line.descripcion === item.descripcion;
      const fallback = lines.filter(sameIdentity);
      const uniqueService = identities.filter((other) => other.workOrderId === item.workOrderId && other.catalogItemId === item.catalogItemId &&
        other.tipoLinea === item.tipoLinea && other.unidadMedida === item.unidadMedida && other.descripcion === item.descripcion).length === 1;
      const line = linked.length === 1 ? linked[0] : linked.length === 0 && fallback.length === 1 && uniqueService ? fallback[0] : undefined;
      let quotedNet: number | null = null;
      if (quotation && line) {
        quotedNet = pricedQuotes.get(quotation.id)?.nets.get(line.id) ?? null;
      }
      const latestReview = commercialReviews.find((row) => row.workOrderItemId === item.id);
      const previousReference = latestReview?.snapshot.referenceHourlyRate;
      const actualMinutes = parts.reduce((sum, row) => sum + row.actualMinutes, 0);
      const snapshot = commercialSnapshot({ actualMinutes, theoreticalNet: sumKnown('actualSale'), actualCost: sumKnown('actualCost'),
        quotedNet, receivedNet: quotedNet !== null && quotation && pricedQuotes.get(quotation.id)?.reconciled ? collectedServiceNet(quotedNet, Number(quotation.total), Number(quotation.pagado)) : null,
        referenceHourlyRate: latestReview?.snapshot.referenceSource === 'manual' ? previousReference : undefined,
      });
      snapshot.referenceSource = latestReview?.snapshot.referenceSource ?? 'historica';
      return { ...snapshot, workOrderId: item.workOrderId, workOrderCodigo: item.workOrder?.codigo ?? `OT ${item.workOrderId}`,
        workOrderItemId: item.id, description: item.descripcion, patente: item.workOrder?.vehicle?.patente ?? null,
        quotationId: quotation?.id ?? null, quotationCode: quotation?.codigo ?? null,
        latestReview: latestReview ? reviewPublic(latestReview) : null };
    });
    const userIds = [...new Set(rows.flatMap((row) => row.userId === null ? [] : [row.userId]))];
    const constrained = Boolean(filters.workOrderId || filters.workOrderItemId || filters.catalogItemId || filters.vehicleId || filters.specialtyId || filters.search || filters.estado);
    const workers = await User.findAll({ attributes: ['id', 'nombre', 'activo'], paranoid: false,
      where: filters.userId ? { id: filters.userId } : constrained ? { id: { [Op.in]: userIds } } : { [Op.or]: [{ activo: true }, { id: { [Op.in]: userIds } }] },
      include: [{ model: Role, as: 'role', attributes: ['nombre'], required: true,
        where: { nombre: { [Op.in]: constrained || filters.userId ? ['mecanico', 'jefe'] : ['mecanico'] } } }], transaction });
    const exceptions = workers.length ? await WorkshopScheduleException.findAll({ where: { userId: { [Op.in]: workers.map((worker) => worker.id) },
      date: { [Op.between]: [filters.fechaDesde, filters.fechaHasta] } }, order: [['version', 'DESC'], ['id', 'DESC']], limit: LIMIT, transaction }) : [];
    assertBound(exceptions.length);
    const exceptionMap = new Map<string, WorkshopScheduleException>();
    for (const exception of exceptions) if (!exceptionMap.has(`${exception.userId}:${exception.date}`)) exceptionMap.set(`${exception.userId}:${exception.date}`, exception);
    const days: PerformanceDay[] = [];
    const cursor = new Date(`${filters.fechaDesde}T00:00:00Z`);
    for (;;) {
      const date = cursor.toISOString().slice(0, 10);
      if (date > filters.fechaHasta || date > dayString(now, timezone)) break;
      const range = getCivilDayRange(date, timezone);
      days.push({ date, ...range, workers: workers.map((worker) => {
        const shift = resolveWorkerShift(schedule?.weekly ?? DEFAULT_WORKSHOP_WEEKLY, timezone, range.start, exceptionMap.get(`${worker.id}:${date}`));
        return { userId: worker.id, intervals: !shift.configured ? null : shift.intervals ?? (shift.start && shift.end ? [{ start: shift.start, end: shift.end }] : []) };
      }) });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    const utilization = calculateUtilization(days, selectedSessions, now, groupBy);
    const quality = calculateQuality(selectedItems, reviews, selectedSessions, start, end, now);
    const estimated = scope.totals.estimatedHours;
    const actualMinutes = scope.totals.actualMinutes;
    const options = { ...scope.options,
      vehicles: [...new Map(items.flatMap((item) => item.workOrder?.vehicle ? [[item.workOrder.vehicle.id, { id: item.workOrder.vehicle.id, patente: item.workOrder.vehicle.patente }] as const] : [])).values()],
      services: items.map((item) => ({ id: item.id, description: item.descripcion, workOrderCodigo: item.workOrder?.codigo ?? `OT ${item.workOrderId}` })),
    };
    const { sessionKeys: _keys, selectedItemIds: _selectedIds, ...filteredReport } = scope;
    return { ...filteredReport, filters, options, analysis: {
      ...utilization, efficiency: { estimatedHours: estimated, actualHours: scope.totals.actualHours,
        percent: estimated !== null && actualMinutes > 0 ? roundMetric(estimated * 60 / actualMinutes * 100) : null,
        deviationHours: estimated === null ? null : roundMetric(actualMinutes / 60 - estimated) }, quality,
      commercial: { totals: totalCommercialSnapshots(services), services,
        reviews: commercialReviews.filter((row) => selectedIds.has(row.workOrderItemId)).map(reviewPublic) },
    }, notes: [...scope.notes,
      'Utilización: horas del ámbito seleccionado / jornada programada de sus trabajadores; no implica asistencia, sanciones ni remuneraciones. Almuerzo excluido. Horas extra identificadas por jefatura.',
      'Eficiencia: estimación vigente / horas reales del período. Un período parcial no representa la duración final del servicio.',
      'Comparación comercial acumulada por servicio completo, sin duplicar importes por trabajador. El recibido neto es un prorrateo informativo del pago acumulado de la COT; no es una imputación contable ni un pago nuevo.',
      'La referencia es la tarifa de venta histórica ponderada por horas; puede justificarse una referencia manual. Equivalentes de cada servicio se suman sin mezclar tarifas.',
      'Diferencia comercial no equivale a pérdida contable. Margen comercial solo descuenta el costo de mano de obra conocido.',
    ] };
  };
  return snapshotTransaction ? read(snapshotTransaction) : sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ, readOnly: true }, read);
}

export async function createWorkshopCommercialReview(data: CreateWorkshopCommercialReviewInput, actorId: number): Promise<WorkshopCommercialReviewRecord> {
  data = createWorkshopCommercialReviewSchema.parse(data);
  return withWorkshopTransaction(async (transaction) => {
    const actor = await User.findOne({ where: { id: actorId, activo: true }, attributes: ['id', 'nombre'],
      include: [{ model: Role, as: 'role', attributes: ['nombre'] }], transaction });
    if (!actor || !['jefe', 'admin', 'desarrollador'].includes(actor.role?.nombre ?? '') || !(await hasPermission(actorId, 'taller', 'update'))) {
      throw ApiError.forbidden('La revisión comercial requiere al jefe de taller o administración con permiso de actualización');
    }
    const item = await WorkOrderItem.findByPk(data.workOrderItemId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!item || item.tipoLinea === 'parte') throw ApiError.badRequest('Selecciona un servicio existente de la OT');
    const today = dayString(new Date(), DEFAULT_WORKSHOP_TIMEZONE);
    const report = await getWorkshopPerformanceReport({ fechaDesde: today, fechaHasta: today,
      workOrderId: item.workOrderId, workOrderItemId: item.id, groupBy: 'day' }, transaction);
    const current = report.analysis.commercial.services.find((service) => service.workOrderItemId === item.id);
    if (!current) throw ApiError.notFound('Servicio no encontrado');
    const snapshot = commercialSnapshot({ actualMinutes: current.actualMinutes ?? current.actualHours * 60, theoreticalNet: current.theoreticalNet,
      quotedNet: current.quotedNet, receivedNet: current.receivedNet, actualCost: current.actualCost,
      referenceHourlyRate: data.referenceHourlyRate ?? current.referenceHourlyRate });
    snapshot.referenceSource = data.referenceHourlyRate !== undefined ? 'manual' : current.latestReview?.snapshot.referenceSource ?? 'historica';
    const review = await WorkshopCommercialReview.create({ workOrderId: item.workOrderId, workOrderItemId: item.id,
      reason: data.reason, note: data.note, createdBy: actorId, createdByName: actor.nombre, snapshot }, { transaction });
    await WorkOrderEvent.create({ workOrderId: item.workOrderId, actorUserId: actorId, tipo: 'actualizacion',
      descripcion: `Revisión de diferencias de mano de obra: ${item.descripcion}`,
      metadata: { commercialReviewId: review.id, workOrderItemId: item.id, reason: data.reason, previous: current.latestReview?.snapshot ?? null, snapshot } }, { transaction });
    return reviewPublic(review);
  });
}
