import { z } from 'zod';
import type { WorkOrderStatus } from '../constants/work-order-status.js';
export declare const workshopHistoryQuerySchema: z.ZodEffects<z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    fechaDesde: z.ZodOptional<z.ZodString>;
    fechaHasta: z.ZodOptional<z.ZodString>;
    sameVehicle: z.ZodOptional<z.ZodUnion<[z.ZodEffects<z.ZodEnum<["true", "false"]>, boolean, "true" | "false">, z.ZodBoolean]>>;
    search: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    search?: string | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    sameVehicle?: boolean | undefined;
}, {
    page?: number | undefined;
    pageSize?: number | undefined;
    search?: string | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    sameVehicle?: boolean | "true" | "false" | undefined;
}>, {
    page: number;
    pageSize: number;
    search?: string | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    sameVehicle?: boolean | undefined;
}, {
    page?: number | undefined;
    pageSize?: number | undefined;
    search?: string | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    sameVehicle?: boolean | "true" | "false" | undefined;
}>;
export type WorkshopHistoryQuery = z.infer<typeof workshopHistoryQuerySchema>;
export interface WorkshopServiceHistoryRow {
    workOrderId: number;
    codigo: string;
    fechaIngreso: string;
    estado: WorkOrderStatus;
    vehicle: {
        id: number;
        patente: string;
        marca: string | null;
        modelo: string | null;
    } | null;
    itemId: number;
    description: string;
    quantity: number;
    unit: string;
    estimatedHours: number | null;
    actualHours: number | null;
    hoursPerUnit: number | null;
    netUnitPrice: number | null;
    qualityApproved: boolean;
}
export interface WorkshopServiceHistory {
    workOrderId: number;
    itemId: number;
    matchMode: 'catalog' | 'description';
    service: {
        description: string;
        catalogItemId: number | null;
        unit: string;
        quantity: number;
    };
    items: WorkshopServiceHistoryRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    reference: {
        samples: number;
        hourSamples: number;
        priceSamples: number;
        averageHoursPerUnit: number | null;
        averageNetUnitPrice: number | null;
    };
    notes: string[];
}
