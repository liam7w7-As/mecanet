import { z } from 'zod';
import { PAYMENT_METHODS } from './payment.schema.js';
const todayIso = () => new Date().toISOString().slice(0, 10);
const accountingDateSchema = z
    .string()
    .date('La fecha debe tener formato YYYY-MM-DD')
    .refine((value) => value <= todayIso(), 'No se puede operar sobre una fecha futura');
export const financeDayQuerySchema = z.object({
    fecha: accountingDateSchema.default(todayIso),
});
export const closeCashDaySchema = z.object({
    fecha: accountingDateSchema.default(todayIso),
    efectivoDeclarado: z.coerce.number().nonnegative('El efectivo declarado no puede ser negativo'),
    observaciones: z.string().trim().max(1000).optional(),
});
export const CASH_MOVEMENT_TYPES = ['ingreso', 'egreso'];
export const CASH_MOVEMENT_CATEGORIES = [
    'apertura_caja',
    'gasto_operativo',
    'compra_repuesto',
    'pago_proveedor',
    'devolucion',
    'retiro',
    'ajuste',
    'otro',
];
export const createCashMovementSchema = z.object({
    tipo: z.enum(CASH_MOVEMENT_TYPES),
    categoria: z.enum(CASH_MOVEMENT_CATEGORIES),
    monto: z.coerce.number().positive('El monto debe ser mayor a 0'),
    metodo: z.enum(PAYMENT_METHODS),
    descripcion: z.string().trim().min(2).max(255),
    referencia: z.string().trim().max(120).optional(),
    fecha: z
        .string()
        .datetime({ message: 'fecha debe ser una fecha ISO 8601 válida' })
        .refine((value) => value.slice(0, 10) <= todayIso(), 'No se puede operar sobre una fecha futura')
        .optional(),
});
export const voidCashMovementSchema = z.object({
    motivo: z.string().trim().min(2, 'Indique el motivo de la anulación').max(500),
});
