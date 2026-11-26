import { z } from 'zod';

import { PAYMENT_METHODS } from './payment.schema.js';
import { PURCHASE_DOCUMENT_TYPES } from '../constants/purchases.js';

export const EXPRESS_MARKUP = 0.25;
const money = z.coerce
  .number()
  .finite()
  .positive('Ingresa un importe mayor a cero')
  .max(99999999)
  .multipleOf(0.01, 'Usa hasta dos decimales');
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

/** Prices here are the actual paid/customer amounts, not catalogue selling prices. */
export const createExpressPurchaseSchema = z
  .object({
    operationKey: z.string().uuid(),
    workOrderId: z.coerce.number().int().positive('Selecciona una OT'),
    requestId: z.coerce.number().int().positive().nullable().optional(),
    descripcion: z.string().trim().min(2, 'Describe el accesorio').max(255),
    cantidad: z.coerce.number().int().positive().max(9999),
    costoUnitario: money,
    ventaUnitario: money,
    conIva: z.boolean().default(true),
    metodoPago: z.enum(PAYMENT_METHODS).default('efectivo'),
    proveedorNombre: optionalText(180),
    tipoDocumento: z.enum(PURCHASE_DOCUMENT_TYPES).default('recibo'),
    folio: optionalText(50),
    fechaEmision: z.string().date().optional(),
    detalle: optionalText(1000),
  })
  .superRefine((value, ctx) => {
    if (Math.round(value.ventaUnitario * 100) < Math.ceil(value.costoUnitario * 125 - 0.000001)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ventaUnitario'],
        message: 'La venta debe ser al menos un 25% mayor al precio de compra',
      });
    }
    if (value.tipoDocumento === 'nota_credito') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tipoDocumento'],
        message: 'Una nota de crédito no es una compra express',
      });
    }
    if (value.fechaEmision && value.fechaEmision > new Date().toISOString().slice(0, 10)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fechaEmision'],
        message: 'La fecha no puede ser futura',
      });
    }
    if (
      value.costoUnitario * value.cantidad > 999999999 ||
      value.ventaUnitario * value.cantidad > 999999999
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cantidad'],
        message: 'El total supera el límite permitido',
      });
    }
  });

export const expressSearchSchema = z.object({
  search: z.string().trim().max(180).optional(),
});

const scanItem = z.object({
  descripcion: z.string().trim().min(1).max(255),
  codigo: z.string().max(80).nullable(),
  cantidad: z.number().positive().max(9999).nullable(),
  costoUnitario: z.number().positive().max(99999999).nullable(),
});
export const expressScanResultSchema = z.object({
  documento: z.enum(['etiqueta', 'recibo', 'desconocido']),
  proveedorNombre: z.string().max(180).nullable(),
  folio: z.string().max(50).nullable(),
  fechaEmision: z.string().date().nullable(),
  incluyeIva: z.boolean().nullable(),
  items: z.array(scanItem).max(30),
  advertencias: z.array(z.string().max(300)).max(10),
});
export type CreateExpressPurchaseInput = z.infer<typeof createExpressPurchaseSchema>;
export type ExpressScanResult = z.infer<typeof expressScanResultSchema>;
export interface ExpressOrderOption {
  id: number;
  codigo: string;
  estado: string;
  patente: string;
  vehicleId: number;
  vehiculo: string;
  cliente: string | null;
}
export interface ExpressPurchaseRequest {
  id: number;
  estado: string;
  descripcion: string;
  cantidad: number;
  detalle: string;
  solicitadoPor: string | null;
  createdAt: string;
  order: ExpressOrderOption;
  porComprar: boolean;
}
