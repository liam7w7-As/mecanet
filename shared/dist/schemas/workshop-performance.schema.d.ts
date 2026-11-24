import { z } from 'zod';
import type { WorkshopCostReport } from './workshop-cost-report.schema.js';
export declare const workshopPerformanceQuerySchema: z.ZodEffects<z.ZodObject<{
    fechaDesde: z.ZodDefault<z.ZodString>;
    fechaHasta: z.ZodDefault<z.ZodString>;
    workOrderId: z.ZodOptional<z.ZodNumber>;
    userId: z.ZodOptional<z.ZodNumber>;
    specialtyId: z.ZodOptional<z.ZodNumber>;
    estado: z.ZodOptional<z.ZodEnum<["en_progreso", "esperando_repuesto", "finalizada", "entregada", "cancelada"]>>;
    search: z.ZodOptional<z.ZodString>;
} & {
    vehicleId: z.ZodOptional<z.ZodNumber>;
    catalogItemId: z.ZodOptional<z.ZodNumber>;
    workOrderItemId: z.ZodOptional<z.ZodNumber>;
    groupBy: z.ZodDefault<z.ZodEnum<["day", "week", "month"]>>;
}, "strict", z.ZodTypeAny, {
    fechaDesde: string;
    fechaHasta: string;
    groupBy: "month" | "day" | "week";
    search?: string | undefined;
    estado?: "en_progreso" | "esperando_repuesto" | "finalizada" | "entregada" | "cancelada" | undefined;
    catalogItemId?: number | undefined;
    userId?: number | undefined;
    specialtyId?: number | undefined;
    vehicleId?: number | undefined;
    workOrderItemId?: number | undefined;
    workOrderId?: number | undefined;
}, {
    search?: string | undefined;
    estado?: "en_progreso" | "esperando_repuesto" | "finalizada" | "entregada" | "cancelada" | undefined;
    catalogItemId?: number | undefined;
    userId?: number | undefined;
    specialtyId?: number | undefined;
    vehicleId?: number | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    workOrderItemId?: number | undefined;
    workOrderId?: number | undefined;
    groupBy?: "month" | "day" | "week" | undefined;
}>, {
    fechaDesde: string;
    fechaHasta: string;
    groupBy: "month" | "day" | "week";
    search?: string | undefined;
    estado?: "en_progreso" | "esperando_repuesto" | "finalizada" | "entregada" | "cancelada" | undefined;
    catalogItemId?: number | undefined;
    userId?: number | undefined;
    specialtyId?: number | undefined;
    vehicleId?: number | undefined;
    workOrderItemId?: number | undefined;
    workOrderId?: number | undefined;
}, {
    search?: string | undefined;
    estado?: "en_progreso" | "esperando_repuesto" | "finalizada" | "entregada" | "cancelada" | undefined;
    catalogItemId?: number | undefined;
    userId?: number | undefined;
    specialtyId?: number | undefined;
    vehicleId?: number | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    workOrderItemId?: number | undefined;
    workOrderId?: number | undefined;
    groupBy?: "month" | "day" | "week" | undefined;
}>;
export type WorkshopPerformanceFilters = z.infer<typeof workshopPerformanceQuerySchema>;
export declare const WORKSHOP_DIFFERENCE_REASONS: readonly ["descuento", "garantia", "error", "cortesia", "retrabajo", "complejidad", "otro"];
export declare const createWorkshopCommercialReviewSchema: z.ZodObject<{
    workOrderItemId: z.ZodNumber;
    reason: z.ZodEnum<["descuento", "garantia", "error", "cortesia", "retrabajo", "complejidad", "otro"]>;
    note: z.ZodString;
    referenceHourlyRate: z.ZodOptional<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    workOrderItemId: number;
    note: string;
    reason: "garantia" | "otro" | "error" | "descuento" | "cortesia" | "retrabajo" | "complejidad";
    referenceHourlyRate?: number | undefined;
}, {
    workOrderItemId: number;
    note: string;
    reason: "garantia" | "otro" | "error" | "descuento" | "cortesia" | "retrabajo" | "complejidad";
    referenceHourlyRate?: number | undefined;
}>;
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
        workers: number;
        registeredHours: number;
        regularHours: number;
        extraHours: number;
        scheduledHours: number | null;
        unregisteredHours: number | null;
        registeredPercent: number | null;
    };
    efficiency: {
        estimatedHours: number | null;
        actualHours: number;
        percent: number | null;
        deviationHours: number | null;
    };
    quality: {
        reviewedServices: number;
        firstPassApproved: number;
        firstPassPercent: number | null;
        rejections: number;
        pendingServices: number;
        reworkHours: number;
    };
    commercial: {
        totals: WorkshopCommercialSnapshot;
        services: WorkshopCommercialService[];
        reviews: WorkshopCommercialReviewRecord[];
    };
    periods: Array<{
        key: string;
        label: string;
        registeredHours: number;
        extraHours: number;
        scheduledHours: number | null;
        unregisteredHours: number | null;
        utilizationPercent: number | null;
    }>;
}
export interface WorkshopPerformanceReport extends Omit<WorkshopCostReport, 'filters' | 'options'> {
    filters: WorkshopPerformanceFilters;
    options: WorkshopCostReport['options'] & {
        vehicles: Array<{
            id: number;
            patente: string;
        }>;
        services: Array<{
            id: number;
            description: string;
            workOrderCodigo: string;
        }>;
    };
    analysis: WorkshopPerformanceAnalysis;
}
