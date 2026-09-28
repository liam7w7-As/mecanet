import { Op, col } from 'sequelize';

import { CatalogItem } from '../models/CatalogItem.js';
import { Client } from '../models/Client.js';
import { Payment } from '../models/Payment.js';
import { Quotation } from '../models/Quotation.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { Vehicle } from '../models/Vehicle.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderRequest } from '../models/WorkOrderRequest.js';

import type {
  DashboardSummary,
  OperationalTask,
  QuotationStatus,
  Role as RoleName,
} from '@unithor/shared';

const pendingQuotationStatuses: QuotationStatus[] = ['por_pagar', 'parcial', 'por_verificar'];

const toIsoString = (value: Date | null): string | null => value?.toISOString() ?? null;

const taskPriorityOrder: Record<OperationalTask['priority'], number> = {
  high: 0,
  medium: 1,
  normal: 2,
};

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
  const role: RoleName = user?.role?.nombre ?? 'mecanico';
  const isMechanic = role === 'mecanico';
  const isAdministrator = role === 'desarrollador' || role === 'admin';
  const canReviewWorkshop = isAdministrator || role === 'jefe';
  const canDeliverWarehouse = isAdministrator || role === 'bodeguero';
  const canVerifyPayments = isAdministrator || role === 'finanzas';
  const canFollowQuotations = isAdministrator || role === 'vendedor';
  const shouldWatchStock = isAdministrator || role === 'jefe' || role === 'bodeguero';
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
    pendingApprovalResult,
    warehouseDeliveryResult,
    assignedWorkOrderResult,
    paymentVerificationResult,
    quotationFollowUpResult,
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
      attributes: ['id', 'codigo', 'nombre', 'stock', 'stockMinimo', 'updatedAt'],
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
    canReviewWorkshop
      ? WorkOrderRequest.findAndCountAll({
          where: { estado: 'pendiente' },
          include: [
            {
              model: WorkOrder,
              attributes: ['id', 'codigo'],
              include: [
                { model: Client, as: 'client', attributes: ['id', 'nombre'] },
                { model: Vehicle, as: 'vehicle', attributes: ['id', 'patente'] },
              ],
            },
            { model: CatalogItem, attributes: ['id', 'codigo', 'nombre'] },
          ],
          distinct: true,
          order: [['createdAt', 'ASC']],
          limit: 5,
        })
      : Promise.resolve({ count: 0, rows: [] as WorkOrderRequest[] }),
    canDeliverWarehouse
      ? WorkOrderRequest.findAndCountAll({
          where: { tipo: 'repuesto', estado: 'aprobada' },
          include: [
            {
              model: WorkOrder,
              attributes: ['id', 'codigo'],
              include: [
                { model: Client, as: 'client', attributes: ['id', 'nombre'] },
                { model: Vehicle, as: 'vehicle', attributes: ['id', 'patente'] },
              ],
            },
            { model: CatalogItem, attributes: ['id', 'codigo', 'nombre'] },
          ],
          distinct: true,
          order: [['reviewedAt', 'ASC'], ['id', 'ASC']],
          limit: 5,
        })
      : Promise.resolve({ count: 0, rows: [] as WorkOrderRequest[] }),
    isMechanic
      ? WorkOrder.findAndCountAll({
          where: {
            assignedMechanicId: userId,
            estado: { [Op.in]: ['borrador', 'en_progreso', 'esperando_repuesto', 'finalizada'] },
          },
          attributes: ['id', 'codigo', 'estado', 'createdAt', 'updatedAt'],
          include: [
            { model: Client, as: 'client', attributes: ['id', 'nombre'] },
            { model: Vehicle, as: 'vehicle', attributes: ['id', 'patente'] },
          ],
          distinct: true,
          order: [['updatedAt', 'DESC']],
          limit: 5,
        })
      : Promise.resolve({ count: 0, rows: [] as WorkOrder[] }),
    canVerifyPayments
      ? Payment.findAndCountAll({
          where: { estado: 'por_verificar' },
          attributes: ['id', 'monto', 'metodo', 'fecha', 'createdAt'],
          include: [{ model: Quotation, attributes: ['id', 'codigo'] }],
          distinct: true,
          order: [['fecha', 'ASC']],
          limit: 5,
        })
      : Promise.resolve({ count: 0, rows: [] as Payment[] }),
    canFollowQuotations
      ? Quotation.findAndCountAll({
          where: {
            workOrderId: null,
            ...(role === 'vendedor' ? { asesorId: userId } : {}),
          },
          attributes: ['id', 'codigo', 'total', 'createdAt'],
          include: [
            { model: Client, attributes: ['id', 'nombre'] },
            { model: Vehicle, attributes: ['id', 'patente'] },
          ],
          distinct: true,
          order: [['updatedAt', 'DESC']],
          limit: 5,
        })
      : Promise.resolve({ count: 0, rows: [] as Quotation[] }),
  ]);

  const operationalTasks: OperationalTask[] = [
    ...pendingApprovalResult.rows.map((request): OperationalTask => ({
      id: `approval-${request.id}`,
      type: 'work_order_approval',
      title: request.tipo === 'repuesto' ? 'Aprobar solicitud de repuesto' : 'Revisar aumento de precio',
      description: `${request.workOrder?.codigo ?? 'OT'} · ${request.catalogItem?.nombre ?? request.workOrder?.vehicle?.patente ?? request.motivo}`,
      href: `/work-orders/${request.workOrderId}`,
      createdAt: request.createdAt.toISOString(),
      priority: 'high',
    })),
    ...warehouseDeliveryResult.rows.map((request): OperationalTask => ({
      id: `warehouse-${request.id}`,
      type: 'warehouse_delivery',
      title: 'Entregar repuesto aprobado',
      description: `${request.workOrder?.codigo ?? 'OT'} · ${request.catalogItem?.nombre ?? request.motivo}`,
      href: '/warehouses?tab=requests',
      createdAt: (request.reviewedAt ?? request.createdAt).toISOString(),
      priority: 'high',
    })),
    ...assignedWorkOrderResult.rows.map((workOrder): OperationalTask => ({
      id: `work-order-${workOrder.id}`,
      type: 'assigned_work_order',
      title: `${workOrder.codigo} asignada`,
      description: `${workOrder.vehicle?.patente ?? 'Sin patente'} · ${workOrder.client?.nombre ?? 'Sin cliente'}`,
      href: `/work-orders/${workOrder.id}`,
      createdAt: workOrder.updatedAt.toISOString(),
      priority: workOrder.estado === 'esperando_repuesto' ? 'medium' : 'normal',
    })),
    ...paymentVerificationResult.rows.map((payment): OperationalTask => ({
      id: `payment-${payment.id}`,
      type: 'payment_verification',
      title: `Verificar abono de $${Number(payment.monto).toLocaleString('es-CL')}`,
      description: `${payment.quotation?.codigo ?? 'Cotización'} · ${payment.metodo ?? 'Método no informado'}`,
      href: '/finance?tab=verifications',
      createdAt: payment.createdAt.toISOString(),
      priority: 'high',
    })),
    ...quotationFollowUpResult.rows.map((quotation): OperationalTask => ({
      id: `quotation-${quotation.id}`,
      type: 'quotation_follow_up',
      title: `${quotation.codigo} sin Orden de Trabajo`,
      description: `${quotation.client?.nombre ?? quotation.vehicle?.patente ?? 'Sin cliente'} · $${Number(quotation.total).toLocaleString('es-CL')}`,
      href: `/quotations/${quotation.id}`,
      createdAt: quotation.createdAt.toISOString(),
      priority: 'medium',
    })),
    ...(shouldWatchStock
      ? lowStockItems.map((item): OperationalTask => ({
          id: `stock-${item.id}`,
          type: 'stock_alert',
          title: item.stock === 0 ? 'Repuesto sin stock' : 'Repuesto bajo mínimo',
          description: `${item.nombre} · ${Number(item.stock)} unidad(es)`,
          href: role === 'bodeguero' || isAdministrator ? '/warehouses' : '/catalog',
          createdAt: item.updatedAt.toISOString(),
          priority: item.stock === 0 ? 'high' : 'medium',
        }))
      : []),
  ].sort((left, right) => {
    const priorityDifference = taskPriorityOrder[left.priority] - taskPriorityOrder[right.priority];
    return priorityDifference || left.createdAt.localeCompare(right.createdAt);
  });

  const operationalCounts = {
    approvals: pendingApprovalResult.count,
    warehouseDeliveries: warehouseDeliveryResult.count,
    assignedWorkOrders: assignedWorkOrderResult.count,
    paymentVerifications: paymentVerificationResult.count,
    quotationFollowUps: quotationFollowUpResult.count,
    stockAlerts: shouldWatchStock ? lowStockCount : 0,
  };

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
    operationalInbox: {
      role,
      total: Object.values(operationalCounts).reduce((total, count) => total + count, 0),
      counts: operationalCounts,
      items: operationalTasks.slice(0, 10),
    },
  };
};
