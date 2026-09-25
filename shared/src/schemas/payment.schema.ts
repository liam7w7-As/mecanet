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

export const PAYMENT_BANKS = ['Banco de Chile', 'Banco Santander', 'BCI', 'Banco Estado'] as const;
export type PaymentBank = (typeof PAYMENT_BANKS)[number];

export const PAYMENT_STATUS = ['confirmado', 'por_verificar', 'rechazado'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[number];

const paymentBaseSchema = z.object({
  quotationId: z.coerce.number().int().positive('ID de cotización requerido'),
  monto: z.coerce.number().positive('El monto debe ser mayor a 0'),
  metodo: z.enum(PAYMENT_METHODS),
  referencia: z.string().trim().max(120).optional(),
  bancoOrigen: z.enum(PAYMENT_BANKS).optional(),
  numeroTransaccion: z.string().trim().max(80).optional(),
  comprobantePago: z.string().trim().max(255).optional(),
  fecha: z.string().datetime({ message: 'fecha debe ser una fecha ISO 8601 válida' }).optional(),
});

export const createPaymentSchema = paymentBaseSchema.superRefine((data, ctx) => {
  if (data.metodo !== 'transferencia') return;

  if (!data.bancoOrigen) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['bancoOrigen'],
      message: 'Debe seleccionar el banco de origen',
    });
  }
  if (!data.numeroTransaccion) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['numeroTransaccion'],
      message: 'Debe ingresar el número de transacción',
    });
  }
  if (!data.comprobantePago) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['comprobantePago'],
      message: 'Debe adjuntar o registrar el comprobante de pago',
    });
  }
});

export const updatePaymentSchema = paymentBaseSchema.partial();

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

export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
