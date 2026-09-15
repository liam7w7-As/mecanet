import { Op } from 'sequelize';

import { CatalogItem } from '../models/CatalogItem.js';
import { Client } from '../models/Client.js';
import { Payment } from '../models/Payment.js';
import { Quotation } from '../models/Quotation.js';
import { Vehicle } from '../models/Vehicle.js';
import { WorkOrder } from '../models/WorkOrder.js';

import type { DashboardSummary, QuotationStatus } from '@unithor/shared';

const pendingQuotationStatuses: QuotationStatus[] = ['por_pagar', 'parcial'];

const toIsoString = (value: Date | null): string | null => value?.toISOString() ?? null;

export const getDashboardSummary = async (): Promise<DashboardSummary> => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const pendingQuotationWhere = {
    estadoPago: { [Op.in]: pendingQuotationStatuses },
  };
  const criticalStockWhere = {
    tipo: 'parte' as const,
    stock: { [Op.between]: [0, 5] },
  };

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
      where: { estado: { [Op.in]: ['en_progreso', 'esperando_repuesto'] } },
    }),
    WorkOrder.count({ where: { estado: 'esperando_repuesto' } }),
    Quotation.count({ where: pendingQuotationWhere }),
    Quotation.sum('total', { where: pendingQuotationWhere }),
    Quotation.sum('pagado', { where: pendingQuotationWhere }),
    Payment.sum('monto', { where: { fecha: { [Op.gte]: monthStart } } }),
    CatalogItem.count({ where: criticalStockWhere }),
    Quotation.count({ where: { workOrderId: null } }),
    WorkOrder.findAll({
      attributes: ['id', 'codigo', 'estado', 'fechaIngreso', 'updatedAt'],
      include: [
        { model: Client, attributes: ['id', 'nombre'] },
        { model: Vehicle, attributes: ['id', 'patente'] },
      ],
      order: [['updatedAt', 'DESC']],
      limit: 5,
    }),
    CatalogItem.findAll({
      where: criticalStockWhere,
      attributes: ['id', 'codigo', 'nombre', 'stock'],
      order: [
        ['stock', 'ASC'],
        ['nombre', 'ASC'],
      ],
      limit: 5,
    }),
    Quotation.findAll({
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
