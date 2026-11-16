import { z } from 'zod';
export declare const WORKSHOP_ALERT_KINDS: readonly ["time_deviation", "unregistered_time", "no_daily_record", "quality_pending", "quality_rejected", "commercial_difference", "time_review_pending", "price_review_pending", "delivery_overdue", "waiting_parts", "valuation_pending"];
export declare const workshopAlertKindSchema: z.ZodEnum<["time_deviation", "unregistered_time", "no_daily_record", "quality_pending", "quality_rejected", "commercial_difference", "time_review_pending", "price_review_pending", "delivery_overdue", "waiting_parts", "valuation_pending"]>;
export type WorkshopAlertKind = z.infer<typeof workshopAlertKindSchema>;
export declare const workshopAlertQuerySchema: z.ZodObject<{
    fecha: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    fecha?: string | undefined;
}, {
    fecha?: string | undefined;
}>;
export declare const updateWorkshopAlertSettingsSchema: z.ZodEffects<z.ZodObject<{
    timeTolerancePercent: z.ZodOptional<z.ZodNumber>;
    commercialTolerancePercent: z.ZodOptional<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    timeTolerancePercent?: number | undefined;
    commercialTolerancePercent?: number | undefined;
}, {
    timeTolerancePercent?: number | undefined;
    commercialTolerancePercent?: number | undefined;
}>, {
    timeTolerancePercent?: number | undefined;
    commercialTolerancePercent?: number | undefined;
}, {
    timeTolerancePercent?: number | undefined;
    commercialTolerancePercent?: number | undefined;
}>;
export type UpdateWorkshopAlertSettingsInput = z.infer<typeof updateWorkshopAlertSettingsSchema>;
export interface WorkshopAlertTolerances {
    timeTolerancePercent: number;
    commercialTolerancePercent: number;
}
export interface WorkshopAlertSettingsPublic extends WorkshopAlertTolerances {
    id: 1;
    updatedBy: number | null;
    updatedAt: string | null;
}
export interface WorkshopOperationalAlert {
    id: string;
    kind: WorkshopAlertKind;
    priority: 'high' | 'medium' | 'normal';
    title: string;
    description: string;
    workOrderId: number | null;
    workOrderCodigo: string | null;
    itemId: number | null;
    userId: number | null;
    href: string;
}
export interface WorkshopAlertSummary {
    generatedAt: string;
    alerts: WorkshopOperationalAlert[];
    counts: {
        total: number;
        high: number;
    };
    settings: WorkshopAlertTolerances;
    scheduleConfigured: boolean;
}
