import { z } from 'zod';
import { QUOTATION_STATUS } from '../constants/quotation-status.js';
const toIsoDate = (date) => date.toISOString().slice(0, 10);
const firstDayOfCurrentMonth = () => {
    const now = new Date();
    return toIsoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
};
export const commercialReportQuerySchema = z
    .object({
    fechaDesde: z
        .string()
        .date('fechaDesde debe ser una fecha YYYY-MM-DD válida')
        .default(firstDayOfCurrentMonth),
    fechaHasta: z
        .string()
        .date('fechaHasta debe ser una fecha YYYY-MM-DD válida')
        .default(() => toIsoDate(new Date())),
    estadoPago: z.enum(QUOTATION_STATUS).optional(),
    asesorId: z.coerce.number().int().positive('ID de asesor inválido').optional(),
})
    .refine((filters) => filters.fechaDesde <= filters.fechaHasta, {
    message: 'fechaDesde no puede ser posterior a fechaHasta',
    path: ['fechaHasta'],
});
