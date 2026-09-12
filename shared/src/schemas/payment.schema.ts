import { z } from 'zod';

import { paginationSchema } from './pagination.schema.js';

export const PAYMENT_METHODS = ['efectivo', 'transferencia', 'tarjeta', 'otros'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const createPaymentSchema = z.object({
  quotation_id: z.coerce.number().int().positive('ID de cotización requerido'),
  monto: z.coerce.number().positive('El monto debe ser mayor a 0'),
  metodo: z.enum(PAYMENT_METHODS).nullable().optional(),
  fecha: z
    .string()
    .datetime({ message: 'fecha debe ser una fecha ISO 8601 válida' })
    .default(() => new Date().toISOString()),
  created_by: z.coerce.number().int().positive().nullable().optional(),
});

export const updatePaymentSchema = createPaymentSchema.partial();

export const paymentQuerySchema = paginationSchema.extend({
  quotation_id: z.coerce.number().int().positive().optional(),
  metodo: z.enum(PAYMENT_METHODS).optional(),
});
