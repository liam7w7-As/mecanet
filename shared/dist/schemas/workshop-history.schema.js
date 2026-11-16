import { z } from 'zod';
export const workshopHistoryQuerySchema = z.object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(30).default(10),
    fechaDesde: z.string().date().optional(),
    fechaHasta: z.string().date().optional(),
    sameVehicle: z.enum(['true', 'false']).transform((value) => value === 'true').or(z.boolean()).optional(),
    search: z.string().trim().max(80).optional(),
}).strict().refine((value) => !value.fechaDesde || !value.fechaHasta || value.fechaDesde <= value.fechaHasta, {
    path: ['fechaHasta'], message: 'La fecha desde no puede ser posterior a la fecha hasta',
});
