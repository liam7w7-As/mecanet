import { z } from 'zod';
export const WORKSHOP_ALERT_KINDS = [
    'time_deviation',
    'unregistered_time',
    'no_daily_record',
    'quality_pending',
    'quality_rejected',
    'commercial_difference',
    'time_review_pending',
    'price_review_pending',
    'delivery_overdue',
    'waiting_parts',
    'valuation_pending',
];
export const workshopAlertKindSchema = z.enum(WORKSHOP_ALERT_KINDS);
export const workshopAlertQuerySchema = z.object({ fecha: z.string().date().optional() }).strict();
const tolerance = z.number().finite().min(0).max(1000);
export const updateWorkshopAlertSettingsSchema = z
    .object({
    timeTolerancePercent: tolerance.optional(),
    commercialTolerancePercent: tolerance.optional(),
})
    .strict()
    .refine((input) => Object.keys(input).length > 0, 'Indica al menos una tolerancia');
