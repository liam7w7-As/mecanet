import { Op, col } from 'sequelize';

import { CatalogItem } from '../models/CatalogItem.js';
import { Client } from '../models/Client.js';
import { Payment } from '../models/Payment.js';
import { Quotation } from '../models/Quotation.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { Vehicle } from '../models/Vehicle.js';
import { WorkOrder } from '../models/WorkOrder.js';

import type { DashboardSummary, QuotationStatus } from '@unithor/shared';

const pendingQuotationStatuses: QuotationStatus[] = ['por_pagar', 'parcial', 'por_verificar'];

const toIsoString = (value: Date | null): string | null => value?.toISOString() ?? null;

export const getDashboardSummary = async (userId: number): Promise<DashboardSummary> => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const pendingQuotationWhere = {
    estadoPago: { [Op.in]: pendingQuotationStatuses },
  };
  // Crítico: bajo el mínimo configurado, o (sin mínimo) entre 0 y 5.
  const criticalStockWhere = {
    tipo: 'parte' as const,
    [Op.or]: [
      { stockMinimo: { [Op.gt]: 0 }, stock: { [Op.lte]: col('stock_minimo') } },
      { stockMinimo: 0, stock: { [Op.between]: [0, 5] } },
    ],
  };
  const user = await User.findByPk(userId, {
    attributes: ['id'],
    include: [{ model: Role, as: 'role', attributes: ['nombre'] }],
  });
  const isMechanic = user?.role?.nombre === 'mecanico';
  const workOrderScope = isMechanic ? { assignedMechanicId: userId } : {};

  const [
    activeWorkOrders,
    waitingForParts,
    pendingQuotations,
    pendingQuotationTotal,
    pendingQuotationPaid,
    monthlyRevenue,
    lowStockCount,
    quotationsWithoutWorkOrder,
    recentWorkOrders,
    lowStockItems,
    unlinkedQuotations,
  ] = await Promise.all([
    WorkOrder.count({
      where: { ...workOrderScope, estado: { [Op.in]: ['en_progreso', 'esperando_repuesto'] } },
    }),
    WorkOrder.count({ where: { ...workOrderScope, estado: 'esperando_repuesto' } }),
    isMechanic ? Promise.resolve(0) : Quotation.count({ where: pendingQuotationWhere }),
    isMechanic ? Promise.resolve(0) : Quotation.sum('total', { where: pendingQuotationWhere }),
    isMechanic ? Promise.resolve(0) : Quotation.sum('pagado', { where: pendingQuotationWhere }),
    isMechanic ? Promise.resolve(0) : Payment.sum('monto', {
      where: { estado: 'confirmado', fecha: { [Op.gte]: monthStart } },
    }),
    CatalogItem.count({ where: criticalStockWhere }),
    isMechanic ? Promise.resolve(0) : Quotation.count({ where: { workOrderId: null } }),
    WorkOrder.findAll({
      where: workOrderScope,
      attributes: ['id', 'codigo', 'estado', 'fechaIngreso', 'updatedAt'],
      include: [
        { model: Client, as: 'client', attributes: ['id', 'nombre'] },
        { model: Vehicle, as: 'vehicle', attributes: ['id', 'patente'] },
      ],
      order: [['updatedAt', 'DESC']],
      limit: 5,
    }),
    CatalogItem.findAll({
      where: criticalStockWhere,
      attributes: ['id', 'codigo', 'nombre', 'stock', 'stockMinimo'],
      order: [
        ['stock', 'ASC'],
        ['nombre', 'ASC'],
      ],
      limit: 5,
    }),
    isMechanic ? Promise.resolve([]) : Quotation.findAll({
      where: { workOrderId: null },
      attributes: ['id', 'codigo', 'total', 'estadoPago'],
      include: [{ model: Client, attributes: ['id', 'nombre'] }],
      order: [['updatedAt', 'DESC']],
      limit: 5,
    }),
  ]);

  return {
    metrics: {
      activeWorkOrders,
      waitingForParts,
      pendingQuotations,
      pendingBalance: Math.max(0, Number(pendingQuotationTotal ?? 0) - Number(pendingQuotationPaid ?? 0)),
      monthlyRevenue: Number(monthlyRevenue ?? 0),
      quotationsWithoutWorkOrder,
    },
    recentWorkOrders: recentWorkOrders.map((workOrder) => ({
      id: workOrder.id,
      codigo: workOrder.codigo,
      estado: workOrder.estado,
      fechaIngreso: toIsoString(workOrder.fechaIngreso),
      updatedAt: workOrder.updatedAt.toISOString(),
      client: workOrder.client
        ? { id: workOrder.client.id, nombre: workOrder.client.nombre }
        : null,
      vehicle: workOrder.vehicle
        ? { id: workOrder.vehicle.id, patente: workOrder.vehicle.patente }
        : null,
    })),
    lowStockCount,
    lowStockItems: lowStockItems.map((item) => ({
      id: item.id,
      codigo: item.codigo,
      nombre: item.nombre,
      stock: Number(item.stock),
      stockMinimo: Number(item.stockMinimo ?? 0),
    })),
    unlinkedQuotations: unlinkedQuotations.map((quotation) => ({
      id: quotation.id,
      codigo: quotation.codigo,
      total: Number(quotation.total),
      estadoPago: quotation.estadoPago,
      client: quotation.client
        ? { id: quotation.client.id, nombre: quotation.client.nombre }
        : null,
    })),
  };
};
