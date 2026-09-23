import { z } from 'zod';
import { paginationSchema } from './pagination.schema.js';
export const PAYMENT_METHODS = [
    'efectivo',
    'transferencia',
    'tarjeta_debito',
    'tarjeta_credito',
    'cheque',
    'otro',
];
export const PAYMENT_STATUS = ['confirmado', 'por_verificar', 'rechazado'];
export const createPaymentSchema = z.object({
    quotationId: z.coerce.number().int().positive('ID de cotización requerido'),
    monto: z.coerce.number().positive('El monto debe ser mayor a 0'),
    metodo: z.enum(PAYMENT_METHODS),
    referencia: z.string().trim().max(120).optional(),
    fecha: z
        .string()
        .datetime({ message: 'fecha debe ser una fecha ISO 8601 válida' })
        .optional(),
});
export const updatePaymentSchema = createPaymentSchema.partial();
export const paymentQuerySchema = paginationSchema.extend({
    quotationId: z.coerce.number().int().positive().optional(),
    metodo: z.enum(PAYMENT_METHODS).optional(),
    estado: z.enum(PAYMENT_STATUS).optional(),
    fechaDesde: z.string().date('fechaDesde debe ser una fecha YYYY-MM-DD válida').optional(),
    fechaHasta: z.string().date('fechaHasta debe ser una fecha YYYY-MM-DD válida').optional(),
});
export const verifyPaymentSchema = z.object({
    decision: z.enum(['aprobar', 'rechazar']),
    comentario: z.string().trim().max(1000).optional(),
});
