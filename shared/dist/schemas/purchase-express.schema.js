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
const optionalText = (max) => z.string().trim().max(max).nullable().optional();
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
    .strict()
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
    if (value.costoUnitario * value.cantidad > 999999999 ||
        value.ventaUnitario * value.cantidad > 999999999) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['cantidad'],
            message: 'El total supera el límite permitido',
        });
    }
});
const singlePurchaseFields = createExpressPurchaseSchema.innerType();
export const expressPurchaseLineSchema = singlePurchaseFields
    .pick({
    workOrderId: true,
    requestId: true,
    descripcion: true,
    cantidad: true,
    costoUnitario: true,
    ventaUnitario: true,
    detalle: true,
})
    .extend({ workOrderId: z.coerce.number().int().positive().optional() })
    .strict()
    .superRefine((line, ctx) => {
    if (Math.round(line.ventaUnitario * 100) < Math.ceil(line.costoUnitario * 125 - 0.000001)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['ventaUnitario'],
            message: 'La venta debe ser al menos un 25% mayor al precio de compra',
        });
    }
});
export const createExpressPurchaseBatchSchema = singlePurchaseFields
    .omit({
    requestId: true,
    descripcion: true,
    cantidad: true,
    costoUnitario: true,
    ventaUnitario: true,
})
    .extend({ items: z.array(expressPurchaseLineSchema).min(1, 'Agrega un producto').max(30) })
    .strict()
    .superRefine((value, ctx) => {
    if (value.tipoDocumento === 'nota_credito') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tipoDocumento'], message: 'Una nota de crédito no es una compra express' });
    }
    if (value.fechaEmision && value.fechaEmision > new Date().toISOString().slice(0, 10)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fechaEmision'], message: 'La fecha no puede ser futura' });
    }
    const requested = new Set();
    let cost = 0;
    let sale = 0;
    value.items.forEach((line, index) => {
        cost += Math.round(line.costoUnitario * 100) * line.cantidad;
        sale += Math.round(line.ventaUnitario * 100) * line.cantidad;
        if (line.requestId) {
            if (requested.has(line.requestId)) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items', index, 'requestId'], message: 'Esta solicitud ya está incluida en la compra' });
            }
            requested.add(line.requestId);
        }
    });
    if (cost > 99999999900 || sale > 99999999900) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: 'El total supera el límite permitido' });
    }
});
/** Keep existing single-product callers compatible while the UI submits a complete receipt. */
export const createExpressPurchaseSubmissionSchema = z.union([
    createExpressPurchaseBatchSchema,
    createExpressPurchaseSchema,
]);
export const returnExpressPurchaseSchema = z.object({
    motivo: z.string().trim().min(2, 'Explica el motivo de la devolución').max(500),
    itemIds: z.array(z.number().int().positive()).min(1).max(30)
        .refine((ids) => new Set(ids).size === ids.length, 'Hay productos repetidos').optional(),
}).strict();
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
