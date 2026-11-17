import { z } from 'zod';
/** Suggestions only: opting in creates names, never rates or worker assignments. */
export const DEFAULT_WORKSHOP_SPECIALTIES = ['Mecánico', 'Electricista', 'Ayudante', 'Desabollador', 'Pintor'];
export const DEFAULT_WORKSHOP_TIMEZONE = 'America/Santiago';
export const workshopDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa una fecha AAAA-MM-DD')
    .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= '1000-01-01';
}, 'Fecha inválida');
export const workshopTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usa una hora HH:mm');
export const workshopTimezoneSchema = z.string().trim().min(1).max(64).refine((value) => {
    try {
        if (/^[+-]/.test(value))
            return false;
        new Intl.DateTimeFormat('en', { timeZone: value }).format();
        return true;
    }
    catch {
        return false;
    }
}, 'Selecciona una zona horaria IANA válida');
const idSchema = z.number().int().positive();
const hourlyAmountSchema = z.number().finite().nonnegative('El monto no puede ser negativo')
    .max(9_999_999_999.99).multipleOf(0.01, 'Usa como máximo dos decimales');
export const createSpecialtySchema = z.object({ name: z.string().trim().min(2).max(100) }).strict();
export const updateSpecialtySchema = z.object({
    name: z.string().trim().min(2).max(100).optional(),
    active: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Envía al menos un cambio');
/** There is deliberately no update/delete rate schema. */
export const createSpecialtyRateSchema = z.object({
    validityFrom: workshopDateSchema,
    costHourly: hourlyAmountSchema,
    saleHourly: hourlyAmountSchema,
}).strict();
export const updateWorkerSpecialtiesSchema = z.object({
    principalSpecialtyId: idSchema.nullable(),
    additionalSpecialtyIds: z.array(idSchema).max(100),
}).strict().superRefine((value, context) => {
    if (new Set(value.additionalSpecialtyIds).size !== value.additionalSpecialtyIds.length) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['additionalSpecialtyIds'], message: 'No repitas especialidades adicionales' });
    }
    if (value.principalSpecialtyId !== null && value.additionalSpecialtyIds.includes(value.principalSpecialtyId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['additionalSpecialtyIds'], message: 'La especialidad principal no puede ser adicional' });
    }
    if (value.principalSpecialtyId === null && value.additionalSpecialtyIds.length) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['principalSpecialtyId'], message: 'Selecciona una especialidad principal' });
    }
});
export const workshopWeeklyDaySchema = z.object({
    weekday: z.number().int().min(0).max(6),
    start: workshopTimeSchema,
    end: workshopTimeSchema,
    breakStart: workshopTimeSchema.optional(),
    breakEnd: workshopTimeSchema.optional(),
}).strict().superRefine((value, context) => {
    if (value.end <= value.start)
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['end'], message: 'La salida debe ser posterior a la entrada' });
    if (value.breakStart !== undefined || value.breakEnd !== undefined) {
        if (!value.breakStart || !value.breakEnd || value.breakStart <= value.start || value.breakEnd >= value.end || value.breakEnd <= value.breakStart) {
            context.addIssue({ code: z.ZodIssueCode.custom, path: ['breakEnd'], message: 'El almuerzo debe tener inicio y fin dentro de la jornada' });
        }
    }
});
export const updateWorkshopScheduleSchema = z.object({
    timezone: workshopTimezoneSchema,
    weekly: z.array(workshopWeeklyDaySchema).max(7),
}).strict().refine((value) => new Set(value.weekly.map((day) => day.weekday)).size === value.weekly.length, { path: ['weekly'], message: 'Configura cada día una sola vez' });
export const createWorkshopScheduleExceptionSchema = z.object({
    date: workshopDateSchema,
    dayOff: z.boolean(),
    start: workshopTimeSchema.nullable().optional(),
    end: workshopTimeSchema.nullable().optional(),
    reason: z.string().trim().min(1, 'El motivo es obligatorio').max(1000),
}).strict().superRefine((value, context) => {
    if (value.dayOff) {
        if (value.start != null || value.end != null)
            context.addIssue({ code: z.ZodIssueCode.custom, path: ['start'], message: 'Un día libre no tiene horas de entrada o salida' });
    }
    else if (!value.start || !value.end || value.end <= value.start) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['end'], message: 'Indica entrada y salida; la salida debe ser posterior' });
    }
});
export const workshopSpecialtySchema = z.object({ id: idSchema, name: z.string(), active: z.boolean() });
export const workshopSpecialtyRateSchema = z.object({
    id: idSchema, specialtyId: idSchema, validityFrom: workshopDateSchema,
    costHourly: hourlyAmountSchema, saleHourly: hourlyAmountSchema, currency: z.literal('CLP'),
    createdBy: idSchema.nullable(), createdAt: z.string().datetime(),
});
export const workshopWorkerSchema = z.object({ id: idSchema, nombre: z.string(), activo: z.boolean() });
export const workshopWorkerProfileSchema = z.object({
    userId: idSchema, principalSpecialtyId: idSchema.nullable(), additionalSpecialtyIds: z.array(idSchema),
});
export const workshopScheduleSchema = z.object({
    timezone: workshopTimezoneSchema, weekly: z.array(workshopWeeklyDaySchema),
    updatedAt: z.string().datetime().nullable(), updatedBy: idSchema.nullable(),
});
export const workshopScheduleExceptionSchema = z.object({
    id: idSchema, userId: idSchema, date: workshopDateSchema, dayOff: z.boolean(),
    start: workshopTimeSchema.nullable(), end: workshopTimeSchema.nullable(), reason: z.string(),
    version: z.number().int().positive(), createdBy: idSchema.nullable(), createdAt: z.string().datetime(),
});
export const workshopPersonnelConfigSchema = z.object({
    specialties: z.array(workshopSpecialtySchema), rates: z.array(workshopSpecialtyRateSchema),
    workers: z.array(workshopWorkerSchema), profiles: z.array(workshopWorkerProfileSchema),
    schedule: workshopScheduleSchema, exceptions: z.array(workshopScheduleExceptionSchema),
});
export const DEFAULT_WORKSHOP_WEEKLY = [
    ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '09:00', end: '18:00', breakStart: '13:00', breakEnd: '14:00' })),
    { weekday: 6, start: '09:00', end: '13:00' },
];
