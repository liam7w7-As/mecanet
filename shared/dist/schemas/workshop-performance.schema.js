import { z } from 'zod';
import { workshopCostReportQuerySchema } from './workshop-cost-report.schema.js';
export const workshopPerformanceQuerySchema = workshopCostReportQuerySchema.innerType().extend({
    vehicleId: z.coerce.number().int().positive().optional(),
    catalogItemId: z.coerce.number().int().positive().optional(),
    workOrderItemId: z.coerce.number().int().positive().optional(),
    groupBy: z.enum(['day', 'week', 'month']).default('day'),
}).strict().superRefine((value, context) => {
    const from = Date.parse(value.fechaDesde);
    const to = Date.parse(value.fechaHasta);
    if (from > to)
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['fechaHasta'], message: 'La fecha desde no puede ser posterior a la fecha hasta' });
    if (to - from > 366 * 86_400_000)
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['fechaHasta'], message: 'Selecciona un rango de hasta 366 días' });
});
export const WORKSHOP_DIFFERENCE_REASONS = ['descuento', 'garantia', 'error', 'cortesia', 'retrabajo', 'complejidad', 'otro'];
export const createWorkshopCommercialReviewSchema = z.object({
    workOrderItemId: z.number().int().positive(),
    reason: z.enum(WORKSHOP_DIFFERENCE_REASONS),
    note: z.string().trim().min(2, 'Explica el motivo de la diferencia').max(2000),
    referenceHourlyRate: z.number().finite().positive().max(9_999_999_999.99).optional(),
}).strict();
