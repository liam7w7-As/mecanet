import { z } from 'zod';

import { workshopCostReportQuerySchema } from './workshop-cost-report.schema.js';

import type { WorkshopCostReport } from './workshop-cost-report.schema.js';

export const workshopPerformanceQuerySchema = workshopCostReportQuerySchema.innerType().extend({
  vehicleId: z.coerce.number().int().positive().optional(),
  catalogItemId: z.coerce.number().int().positive().optional(),
  workOrderItemId: z.coerce.number().int().positive().optional(),
  groupBy: z.enum(['day', 'week', 'month']).default('day'),
}).strict().superRefine((value, context) => {
  const from = Date.parse(value.fechaDesde);
  const to = Date.parse(value.fechaHasta);
  if (from > to) context.addIssue({ code: z.ZodIssueCode.custom, path: ['fechaHasta'], message: 'La fecha desde no puede ser posterior a la fecha hasta' });
  if (to - from > 366 * 86_400_000) context.addIssue({ code: z.ZodIssueCode.custom, path: ['fechaHasta'], message: 'Selecciona un rango de hasta 366 días' });
});
export type WorkshopPerformanceFilters = z.infer<typeof workshopPerformanceQuerySchema>;

export const WORKSHOP_DIFFERENCE_REASONS = ['descuento', 'garantia', 'error', 'cortesia', 'retrabajo', 'complejidad', 'otro'] as const;
export const createWorkshopCommercialReviewSchema = z.object({
  workOrderItemId: z.number().int().positive(),
  reason: z.enum(WORKSHOP_DIFFERENCE_REASONS),
  note: z.string().trim().min(2, 'Explica el motivo de la diferencia').max(2000),
  referenceHourlyRate: z.number().finite().positive().max(9_999_999_999.99).optional(),
}).strict();
export type CreateWorkshopCommercialReviewInput = z.infer<typeof createWorkshopCommercialReviewSchema>;

export interface WorkshopCommercialSnapshot {
  /** Exact source minutes, retained for aggregation before display rounding. */
  actualMinutes?: number;
  actualHours: number;
  theoreticalNet: number | null;
  quotedNet: number | null;
  receivedNet: number | null;
  referenceHourlyRate: number | null;
  equivalentQuotedHours: number | null;
  equivalentReceivedHours: number | null;
  hoursDifference: number | null;
  netDifference: number | null;
  actualCost: number | null;
  commercialMargin: number | null;
  referenceSource?: 'historica' | 'manual';
}
export interface WorkshopCommercialReviewRecord {
  id: number;
  workOrderId: number;
  workOrderItemId: number;
  reason: (typeof WORKSHOP_DIFFERENCE_REASONS)[number];
  note: string;
  createdBy: number | null;
  createdByName: string;
  createdAt: string;
  snapshot: WorkshopCommercialSnapshot;
}
export interface WorkshopCommercialService extends WorkshopCommercialSnapshot {
  workOrderId: number;
  workOrderCodigo: string;
  workOrderItemId: number;
  description: string;
  patente: string | null;
  quotationId: number | null;
  quotationCode: string | null;
  latestReview: WorkshopCommercialReviewRecord | null;
}
export interface WorkshopPerformanceAnalysis {
  utilization: {
    workers: number; registeredHours: number; regularHours: number; extraHours: number;
    scheduledHours: number | null; unregisteredHours: number | null; registeredPercent: number | null;
  };
  efficiency: { estimatedHours: number | null; actualHours: number; percent: number | null; deviationHours: number | null };
  quality: { reviewedServices: number; firstPassApproved: number; firstPassPercent: number | null; rejections: number; pendingServices: number; reworkHours: number };
  commercial: { totals: WorkshopCommercialSnapshot; services: WorkshopCommercialService[]; reviews: WorkshopCommercialReviewRecord[] };
  periods: Array<{ key: string; label: string; registeredHours: number; extraHours: number; scheduledHours: number | null; unregisteredHours: number | null; utilizationPercent: number | null }>;
}
export interface WorkshopPerformanceReport extends Omit<WorkshopCostReport, 'filters' | 'options'> {
  filters: WorkshopPerformanceFilters;
  options: WorkshopCostReport['options'] & {
    vehicles: Array<{ id: number; patente: string }>;
    services: Array<{ id: number; description: string; workOrderCodigo: string }>;
  };
  analysis: WorkshopPerformanceAnalysis;
}
