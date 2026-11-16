import { z } from 'zod';

import { WORK_ORDER_STATUS } from '../constants/work-order-status.js';

import type { WorkOrderStatus } from '../constants/work-order-status.js';

/** Internal reporting only. Grants cannot opt a mechanic or salesperson into costs. */
export const WORKSHOP_COST_REPORT_ROLES = ['admin', 'desarrollador', 'jefe', 'finanzas'] as const;
export const isWorkshopCostReportRole = (role: string): boolean =>
  WORKSHOP_COST_REPORT_ROLES.some((allowed) => allowed === role);

const today = (): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

export const workshopCostReportQuerySchema = z
  .object({
    fechaDesde: z
      .string()
      .date()
      .default(() => `${today().slice(0, 7)}-01`),
    fechaHasta: z.string().date().default(today),
    workOrderId: z.coerce.number().int().positive().optional(),
    userId: z.coerce.number().int().positive().optional(),
    specialtyId: z.coerce.number().int().positive().optional(),
    estado: z.enum(WORK_ORDER_STATUS).optional(),
    search: z.string().trim().max(120).optional(),
  })
  .strict()
  .refine((filters) => filters.fechaDesde <= filters.fechaHasta, {
    message: 'La fecha desde no puede ser posterior a la fecha hasta',
    path: ['fechaHasta'],
  });

export type WorkshopCostReportFilters = z.infer<typeof workshopCostReportQuerySchema>;

export interface WorkshopCostReportRow {
  key: string;
  workOrderId: number;
  workOrderCodigo: string;
  estado: WorkOrderStatus;
  patente: string | null;
  workOrderItemId: number;
  descripcion: string;
  assignmentId: number | null;
  assignmentActive: boolean | null;
  userId: number | null;
  userName: string | null;
  specialtyId: number | null;
  specialtyName: string | null;
  /** Only current assignments (or one legacy item baseline) contribute estimates. */
  includesEstimate: boolean;
  estimatedHours: number | null;
  originalEstimatedHours: number | null;
  actualMinutes: number;
  actualHours: number;
  sessions: number;
  runningSessions: number;
  costHourly: number | null;
  saleHourly: number | null;
  estimatedCost: number | null;
  actualCost: number | null;
  actualSale: number | null;
  actualMargin: number | null;
}

export interface WorkshopCostReportTotals {
  rows: number;
  workOrders: number;
  workers: number;
  sessions: number;
  runningSessions: number;
  estimatedHours: number | null;
  knownEstimatedHours: number;
  actualMinutes: number;
  actualHours: number;
  estimatedCost: number | null;
  knownEstimatedCost: number;
  actualCost: number | null;
  knownActualCost: number;
  actualSale: number | null;
  knownActualSale: number;
  actualMargin: number | null;
  missingEstimateCount: number;
  missingCostRateCount: number;
  missingSaleRateCount: number;
  unlinkedSessionCount: number;
}

export interface WorkshopCostReport {
  generadoEn: string;
  currency: 'CLP';
  filters: WorkshopCostReportFilters;
  period: { start: string; endExclusive: string };
  rows: WorkshopCostReportRow[];
  totals: WorkshopCostReportTotals;
  options: {
    workOrders: Array<{ id: number; codigo: string }>;
    workers: Array<{ id: number; name: string }>;
    specialties: Array<{ id: number; name: string }>;
  };
  notes: string[];
}
