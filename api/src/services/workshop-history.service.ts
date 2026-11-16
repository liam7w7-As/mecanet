import { calculateQuotationPricing, workshopHistoryQuerySchema } from '@unithor/shared';
import { col, fn, Op, Transaction, where as sqlWhere } from 'sequelize';

import { hasPermission } from './permission.service.js';
import { getSessionMinutes } from './work-order-labor-sessions.js';
import { assertWorkOrderAccess } from './work-order.service.js';
import { getWorkshopDayRange } from './workshop-personnel.service.js';
import { sequelize } from '../config/database.js';
import { Quotation } from '../models/Quotation.js';
import { QuotationItem } from '../models/QuotationItem.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { Vehicle } from '../models/Vehicle.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
import { WorkOrderItemAssignment } from '../models/WorkOrderItemAssignment.js';
import { WorkOrderItemSession } from '../models/WorkOrderItemSession.js';
import { ApiError } from '../utils/ApiError.js';

import type { WorkshopHistoryQuery, WorkshopServiceHistory, WorkshopServiceHistoryRow } from '@unithor/shared';
import type { WhereOptions } from 'sequelize';

const round = (value: number): number => Math.round(value * 100) / 100;
const nullableNumber = (value: number | string | null | undefined): number | null => value == null ? null : Number(value);
const descriptionKey = (value: string): string => value.trim().toLocaleLowerCase('es');
const sameIdentity = (a: WorkOrderItem | QuotationItem, b: WorkOrderItem): boolean =>
  a.catalogItemId === b.catalogItemId && a.tipoLinea === b.tipoLinea && a.unidadMedida === b.unidadMedida && descriptionKey(a.descripcion) === descriptionKey(b.descripcion);

/** References are read-only snapshots: never relink old quotation lines during a GET. */
export async function getWorkshopServiceHistory(workOrderId: number, itemId: number, input: WorkshopHistoryQuery, userId: number): Promise<WorkshopServiceHistory> {
  const filters = workshopHistoryQuerySchema.parse(input);
  const actor = await User.findByPk(userId, { attributes: ['id', 'activo'], include: [{ model: Role, attributes: ['nombre'] }] });
  if (!actor?.activo || !['admin', 'desarrollador', 'jefe'].includes(actor.role?.nombre ?? '') || !await hasPermission(userId, 'taller', 'read')) {
    throw ApiError.forbidden('El historial comparativo requiere acceso de supervisión de taller');
  }
  await assertWorkOrderAccess(workOrderId, userId);
  return sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ, readOnly: true }, async (transaction) => {
    const now = new Date();
    const current = await WorkOrder.findByPk(workOrderId, { transaction });
    if (!current) throw ApiError.notFound('Orden de trabajo no encontrada');
    const service = await WorkOrderItem.findOne({ where: { id: itemId, workOrderId }, transaction });
    if (!service) throw ApiError.notFound('Trabajo no encontrado en esta orden');
    if (service.tipoLinea === 'parte') throw ApiError.badRequest('El historial de horas corresponde a los servicios');
    const result: WorkshopServiceHistory = {
      workOrderId, itemId, matchMode: service.catalogItemId == null ? 'description' : 'catalog',
      service: { description: service.descripcion, catalogItemId: service.catalogItemId, unit: service.unidadMedida, quantity: Number(service.cantidad) },
      items: [], total: 0, page: filters.page, pageSize: filters.pageSize, totalPages: 0,
      reference: { samples: 0, hourSamples: 0, priceSamples: 0, averageHoursPerUnit: null, averageNetUnitPrice: null },
      notes: ['Referencias de esta página; no modifican precios, estimaciones ni horas.',
        'Solo servicios completados en OT finalizadas o entregadas. Sin control de calidad registrado no implica aprobación.',
        'Horas persona por unidad. Precio unitario neto después de descuentos, sin IVA; los abonos no determinan el precio.',
        'El precio proviene de la COT activa vinculada o, si no existe, de la OT. Los vínculos antiguos ambiguos no se utilizan.'],
    };
    if (service.catalogItemId == null) result.notes.push('Coincidencia exacta de descripción, tipo y unidad; se ignoran mayúsculas y espacios exteriores.');
    if (filters.sameVehicle && current.vehicleId == null) {
      result.notes.push('La OT actual no tiene un vehículo con el que comparar.');
      return result;
    }
    const dateRange: Record<symbol, Date> = { [Op.lte]: now };
    if (filters.fechaDesde) dateRange[Op.gte] = (await getWorkshopDayRange(filters.fechaDesde, transaction)).start;
    if (filters.fechaHasta) dateRange[Op.lt] = (await getWorkshopDayRange(filters.fechaHasta, transaction)).end;
    const orderWhere: WhereOptions = {
      id: { [Op.ne]: workOrderId }, estado: { [Op.in]: ['finalizada', 'entregada'] },
      fechaIngreso: dateRange, createdAt: { [Op.lte]: now },
      ...(filters.sameVehicle ? { vehicleId: current.vehicleId } : {}),
    };
    const found = await WorkOrderItem.findAndCountAll({
      where: { estadoOperativo: 'completado', tipoLinea: service.tipoLinea, unidadMedida: service.unidadMedida,
        cantidad: { [Op.gt]: 0 }, catalogItemId: service.catalogItemId,
        ...(service.catalogItemId == null ? { [Op.and]: [sqlWhere(fn('LOWER', fn('TRIM', col('WorkOrderItem.descripcion'))), descriptionKey(service.descripcion))] } : {}),
        ...(filters.search ? { [Op.or]: [{ '$workOrder.codigo$': { [Op.like]: `%${filters.search}%` } }, { '$workOrder.vehicle.patente$': { [Op.like]: `%${filters.search}%` } }] } : {}),
      },
      include: [{ model: WorkOrder, as: 'workOrder', required: true, attributes: ['id', 'codigo', 'fechaIngreso', 'estado', 'qualityApprovedAt'], where: orderWhere,
        include: [{ model: Vehicle, as: 'vehicle', attributes: ['id', 'patente', 'marca', 'modelo'], required: false }] }],
      order: [[{ model: WorkOrder, as: 'workOrder' }, 'fechaIngreso', 'DESC'], ['id', 'DESC']],
      limit: filters.pageSize, offset: (filters.page - 1) * filters.pageSize, transaction,
    });
    result.total = found.count;
    result.totalPages = Math.ceil(found.count / filters.pageSize);
    if (!found.rows.length) return result;
    const ids = found.rows.map((item) => item.id);
    const orderIds = [...new Set(found.rows.map((item) => item.workOrderId))];
    const [sessions, assignments, quotations, orderItems] = await Promise.all([
      WorkOrderItemSession.findAll({ where: { workOrderItemId: { [Op.in]: ids } }, transaction }),
      WorkOrderItemAssignment.findAll({ where: { workOrderItemId: { [Op.in]: ids }, active: true }, transaction }),
      Quotation.findAll({ where: { workOrderId: { [Op.in]: orderIds } }, attributes: ['id', 'workOrderId', 'descuentoTipo', 'descuentoValor'], include: [{ model: QuotationItem, as: 'items' }], transaction }),
      WorkOrderItem.findAll({ where: { workOrderId: { [Op.in]: orderIds } }, transaction }),
    ]);
    result.items = found.rows.map((item): WorkshopServiceHistoryRow => {
      const order = item.workOrder!;
      const itemSessions = sessions.filter((session) => session.workOrderItemId === item.id);
      const actualHours = itemSessions.length ? round(Math.max(0, itemSessions.reduce((sum, session) => sum + getSessionMinutes(session, now), 0)) / 60) : nullableNumber(item.horasHombreReales);
      const team = assignments.filter((assignment) => assignment.workOrderItemId === item.id);
      const estimate = item.teamManaged
        ? (team.length && team.every((assignment) => assignment.estimatedHours !== null) ? round(team.reduce((sum, assignment) => sum + Number(assignment.estimatedHours), 0)) : null)
        : (item.horasHombreEstimadas == null ? null : round(Number(item.horasHombreEstimadas) * Number(item.cantidad)));
      const mirrors = quotations.filter((quotation) => quotation.workOrderId === order.id);
      let netUnitPrice: number | null = Number(item.precioUnitario);
      if (mirrors.length) {
        // Multiple legacy mirrors or ambiguous unlinked lines are deliberately unknown.
        netUnitPrice = null;
        if (mirrors.length === 1) {
          const mirror = mirrors[0];
          const lines = mirror.items ?? [];
          let linked = lines.filter((line) => line.workOrderItemId === item.id);
          if (!linked.length && orderItems.filter((other) => other.workOrderId === item.workOrderId && sameIdentity(other, item)).length === 1) linked = lines.filter((line) => line.workOrderItemId == null && sameIdentity(line, item));
          if (linked.length === 1 && Number(linked[0].cantidad) > 0) {
            try {
              const pricing = calculateQuotationPricing(lines, mirror);
              const lineNet = pricing.lines[lines.indexOf(linked[0])].subtotal;
              const beforeGlobal = pricing.subtotal - pricing.descuentoLineas;
              netUnitPrice = round((beforeGlobal > 0 ? lineNet * pricing.total / beforeGlobal : 0) / Number(linked[0].cantidad));
            } catch { /* Invalid legacy discounts cannot be used as a price reference. */ }
          }
        }
      }
      return { workOrderId: order.id, codigo: order.codigo, fechaIngreso: order.fechaIngreso!.toISOString(), estado: order.estado,
        vehicle: order.vehicle ? { id: order.vehicle.id, patente: order.vehicle.patente, marca: order.vehicle.marca, modelo: order.vehicle.modelo } : null,
        itemId: item.id, description: item.descripcion, quantity: Number(item.cantidad), unit: item.unidadMedida,
        estimatedHours: estimate, actualHours, hoursPerUnit: actualHours == null ? null : round(actualHours / Number(item.cantidad)), netUnitPrice,
        qualityApproved: Boolean(order.qualityApprovedAt && item.qualityStatus === 'aprobado') };
    });
    const hours = result.items.flatMap((item) => item.hoursPerUnit == null ? [] : [item.hoursPerUnit]);
    const prices = result.items.flatMap((item) => item.netUnitPrice == null || item.netUnitPrice <= 0 ? [] : [item.netUnitPrice]);
    result.reference = { samples: result.items.length, hourSamples: hours.length, priceSamples: prices.length,
      averageHoursPerUnit: hours.length ? round(hours.reduce((sum, value) => sum + value, 0) / hours.length) : null,
      averageNetUnitPrice: prices.length ? round(prices.reduce((sum, value) => sum + value, 0) / prices.length) : null };
    return result;
  });
}
