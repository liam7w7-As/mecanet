import { z } from 'zod';

import { QUOTATION_STATUS } from '../constants/quotation-status.js';
import { ROLES } from '../constants/roles.js';
import { WORK_ORDER_STATUS } from '../constants/work-order-status.js';

const nullableText = z.string().nullable();

export const OPERATIONAL_TASK_TYPES = [
  'work_order_approval',
  'warehouse_delivery',
  'assigned_work_order',
  'payment_verification',
  'quotation_follow_up',
  'stock_alert',
] as const;

export const operationalTaskSchema = z.object({
  id: z.string().min(1),
  type: z.enum(OPERATIONAL_TASK_TYPES),
  title: z.string().min(1),
  description: z.string(),
  href: z.string().startsWith('/'),
  createdAt: z.string().datetime(),
  priority: z.enum(['high', 'medium', 'normal']),
});

export const dashboardSummarySchema = z.object({
  metrics: z.object({
    activeWorkOrders: z.number().int().nonnegative(),
    waitingForParts: z.number().int().nonnegative(),
    pendingQuotations: z.number().int().nonnegative(),
    pendingBalance: z.number().nonnegative(),
    monthlyRevenue: z.number().nonnegative(),
    quotationsWithoutWorkOrder: z.number().int().nonnegative(),
  }),
  recentWorkOrders: z.array(
    z.object({
      id: z.number().int().positive(),
      codigo: z.string(),
      estado: z.enum(WORK_ORDER_STATUS),
      fechaIngreso: z.string().datetime().nullable(),
      updatedAt: z.string().datetime(),
      client: z.object({ id: z.number().int().positive(), nombre: z.string() }).nullable(),
      vehicle: z.object({ id: z.number().int().positive(), patente: z.string() }).nullable(),
    }),
  ),
  lowStockCount: z.number().int().nonnegative(),
  lowStockItems: z.array(
    z.object({
      id: z.number().int().positive(),
      codigo: nullableText,
      nombre: z.string(),
      stock: z.number().int().nonnegative(),
      stockMinimo: z.number().int().nonnegative().optional().default(0),
    }),
  ),
  unlinkedQuotations: z.array(
    z.object({
      id: z.number().int().positive(),
      codigo: z.string(),
      total: z.number().nonnegative(),
      estadoPago: z.enum(QUOTATION_STATUS),
      client: z.object({ id: z.number().int().positive(), nombre: z.string() }).nullable(),
    }),
  ),
  operationalInbox: z.object({
    role: z.enum(ROLES),
    total: z.number().int().nonnegative(),
    counts: z.object({
      approvals: z.number().int().nonnegative(),
      warehouseDeliveries: z.number().int().nonnegative(),
      assignedWorkOrders: z.number().int().nonnegative(),
      paymentVerifications: z.number().int().nonnegative(),
      quotationFollowUps: z.number().int().nonnegative(),
      stockAlerts: z.number().int().nonnegative(),
    }),
    items: z.array(operationalTaskSchema),
  }),
});

export type OperationalTaskType = (typeof OPERATIONAL_TASK_TYPES)[number];
export type OperationalTask = z.infer<typeof operationalTaskSchema>;
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
