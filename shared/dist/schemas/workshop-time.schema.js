import { z } from 'zod';
export const WORKSHOP_TIME_REQUEST_KINDS = ['manual', 'correction'];
export const WORKSHOP_TIME_REQUEST_STATUS = ['pendiente', 'aprobada', 'rechazada'];
const positiveId = z.number().int().positive();
const note = z.string().trim().min(1, 'Debe indicar el motivo').max(2000);
const interval = {
    startedAt: z.string().datetime({ offset: true }),
    endedAt: z.string().datetime({ offset: true }),
    note,
};
const validateInterval = (value, context) => {
    const start = Date.parse(value.startedAt);
    const end = Date.parse(value.endedAt);
    if (end - start < 60_000) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['endedAt'],
            message: 'El intervalo debe durar al menos un minuto',
        });
    }
    if (start > Date.now() || end > Date.now()) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['endedAt'],
            message: 'No se pueden registrar horas futuras',
        });
    }
};
export const createWorkshopTimeRequestSchema = z
    .union([
    z
        .object({
        workOrderId: positiveId,
        itemId: positiveId,
        dpStageId: positiveId.optional(),
        userId: positiveId.optional(),
        overtime: z.boolean().default(false),
        activityStatus: z.enum(['en_proceso', 'completado']).optional(),
        ...interval,
    })
        .strict(),
    z.object({ sourceSessionId: positiveId, ...interval }).strict(),
])
    .superRefine(validateInterval);
const dailyEntryFields = {
    clientRequestId: z.string().uuid().transform((value) => value.toLowerCase()),
    workOrderId: positiveId,
    itemId: positiveId,
    dpStageId: positiveId.optional(),
    userId: positiveId.optional(),
    fecha: z.string().date('La fecha debe ser YYYY-MM-DD'),
    note,
    activityStatus: z.enum(['en_proceso', 'completado']),
};
export const createWorkshopDailyEntrySchema = z.union([
    z.object({ ...dailyEntryFields, horasUtilizadas: z.number().finite().min(1 / 60, 'Indica al menos un minuto de trabajo') }).strict(),
    // Keep previously saved drafts and queued requests compatible.
    z.object({ ...dailyEntryFields, ...interval }).strict().superRefine(validateInterval),
]);
export const reviewWorkshopTimeRequestSchema = z.object({ approve: z.boolean(), note }).strict();
export const workshopTimeQuerySchema = z
    .object({
    fecha: z.string().date('La fecha debe ser YYYY-MM-DD'),
    userId: z.coerce.number().int().positive().optional(),
})
    .strict();
export const workshopTimeEligibleQuerySchema = workshopTimeQuerySchema.partial({ fecha: true });
export const pauseWorkshopTimerSchema = z.object({ note }).strict();
export const workshopTimeRequestParamsSchema = z.object({ id: z.coerce.number().int().positive() });
