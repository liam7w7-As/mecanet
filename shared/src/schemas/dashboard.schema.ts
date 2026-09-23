import { z } from 'zod';

import { QUOTATION_STATUS } from '../constants/quotation-status.js';
import { WORK_ORDER_STATUS } from '../constants/work-order-status.js';

const nullableText = z.string().nullable();

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
});

export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
