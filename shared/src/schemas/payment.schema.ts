import { z } from 'zod';

import { paginationSchema } from './pagination.schema.js';

export const PAYMENT_METHODS = [
  'efectivo',
  'transferencia',
  'tarjeta_debito',
  'tarjeta_credito',
  'cheque',
  'otro',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const createPaymentSchema = z.object({
  quotationId: z.coerce.number().int().positive('ID de cotización requerido'),
  monto: z.coerce.number().positive('El monto debe ser mayor a 0'),
  metodo: z.enum(PAYMENT_METHODS),
  fecha: z
    .string()
    .datetime({ message: 'fecha debe ser una fecha ISO 8601 válida' })
    .optional(),
});

export const updatePaymentSchema = createPaymentSchema.partial();

export const paymentQuerySchema = paginationSchema.extend({
  quotationId: z.coerce.number().int().positive().optional(),
  metodo: z.enum(PAYMENT_METHODS).optional(),
  fechaDesde: z.string().date('fechaDesde debe ser una fecha YYYY-MM-DD válida').optional(),
  fechaHasta: z.string().date('fechaHasta debe ser una fecha YYYY-MM-DD válida').optional(),
});
