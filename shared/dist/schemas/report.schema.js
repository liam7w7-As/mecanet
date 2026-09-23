import { z } from 'zod';
import { CATALOG_TYPES } from '../constants/catalog-types.js';
import { QUOTATION_STATUS } from '../constants/quotation-status.js';
import { CASH_MOVEMENT_CATEGORIES, CASH_MOVEMENT_TYPES } from './finance.schema.js';
import { PAYMENT_METHODS } from './payment.schema.js';
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
const reportBooleanSchema = z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => value === true || value === 'true');
export const financialReportQuerySchema = z
    .object({
    fechaDesde: z
        .string()
        .date('fechaDesde debe ser una fecha YYYY-MM-DD válida')
        .default(firstDayOfCurrentMonth),
    fechaHasta: z
        .string()
        .date('fechaHasta debe ser una fecha YYYY-MM-DD válida')
        .default(() => toIsoDate(new Date())),
    agruparPor: z.enum(['dia', 'semana', 'mes']).default('dia'),
    asesorId: z.coerce.number().int().positive('ID de asesor inválido').optional(),
    clientId: z.coerce.number().int().positive('ID de cliente inválido').optional(),
    estadoPago: z.enum(QUOTATION_STATUS).optional(),
    metodo: z.enum(PAYMENT_METHODS).optional(),
    catalogType: z.enum(CATALOG_TYPES).optional(),
    movimientoTipo: z.enum(CASH_MOVEMENT_TYPES).optional(),
    movimientoCategoria: z.enum(CASH_MOVEMENT_CATEGORIES).optional(),
    comparar: reportBooleanSchema.default(true),
})
    .superRefine((filters, ctx) => {
    if (filters.fechaDesde > filters.fechaHasta) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'fechaDesde no puede ser posterior a fechaHasta',
            path: ['fechaHasta'],
        });
        return;
    }
    const start = new Date(`${filters.fechaDesde}T00:00:00.000Z`);
    const end = new Date(`${filters.fechaHasta}T00:00:00.000Z`);
    const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
    if (days > 366) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'El reporte no puede abarcar más de 366 días',
            path: ['fechaHasta'],
        });
    }
});
