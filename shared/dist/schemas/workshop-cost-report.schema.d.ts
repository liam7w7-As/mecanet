import { z } from 'zod';
import type { WorkOrderStatus } from '../constants/work-order-status.js';
/** Internal reporting only. Grants cannot opt a mechanic or salesperson into costs. */
export declare const WORKSHOP_COST_REPORT_ROLES: readonly ["admin", "desarrollador", "jefe", "finanzas"];
export declare const isWorkshopCostReportRole: (role: string) => boolean;
export declare const workshopCostReportQuerySchema: z.ZodEffects<z.ZodObject<{
    fechaDesde: z.ZodDefault<z.ZodString>;
    fechaHasta: z.ZodDefault<z.ZodString>;
    workOrderId: z.ZodOptional<z.ZodNumber>;
    userId: z.ZodOptional<z.ZodNumber>;
    specialtyId: z.ZodOptional<z.ZodNumber>;
    estado: z.ZodOptional<z.ZodEnum<["en_progreso", "esperando_repuesto", "finalizada", "entregada", "cancelada"]>>;
    search: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    fechaDesde: string;
    fechaHasta: string;
    search?: string | undefined;
    estado?: "en_progreso" | "esperando_repuesto" | "finalizada" | "entregada" | "cancelada" | undefined;
    userId?: number | undefined;
    specialtyId?: number | undefined;
    workOrderId?: number | undefined;
}, {
    search?: string | undefined;
    estado?: "en_progreso" | "esperando_repuesto" | "finalizada" | "entregada" | "cancelada" | undefined;
    userId?: number | undefined;
    specialtyId?: number | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    workOrderId?: number | undefined;
}>, {
    fechaDesde: string;
    fechaHasta: string;
    search?: string | undefined;
    estado?: "en_progreso" | "esperando_repuesto" | "finalizada" | "entregada" | "cancelada" | undefined;
    userId?: number | undefined;
    specialtyId?: number | undefined;
    workOrderId?: number | undefined;
}, {
    search?: string | undefined;
    estado?: "en_progreso" | "esperando_repuesto" | "finalizada" | "entregada" | "cancelada" | undefined;
    userId?: number | undefined;
    specialtyId?: number | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    workOrderId?: number | undefined;
}>;
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
    period: {
        start: string;
        endExclusive: string;
    };
    rows: WorkshopCostReportRow[];
    totals: WorkshopCostReportTotals;
    options: {
        workOrders: Array<{
            id: number;
            codigo: string;
        }>;
        workers: Array<{
            id: number;
            name: string;
        }>;
        specialties: Array<{
            id: number;
            name: string;
        }>;
    };
    notes: string[];
}
