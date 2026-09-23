import { z } from 'zod';
export declare const financeDayQuerySchema: z.ZodObject<{
    fecha: z.ZodDefault<z.ZodEffects<z.ZodString, string, string>>;
}, "strip", z.ZodTypeAny, {
    fecha: string;
}, {
    fecha?: string | undefined;
}>;
export declare const closeCashDaySchema: z.ZodObject<{
    fecha: z.ZodDefault<z.ZodEffects<z.ZodString, string, string>>;
    efectivoDeclarado: z.ZodNumber;
    observaciones: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    fecha: string;
    efectivoDeclarado: number;
    observaciones?: string | undefined;
}, {
    efectivoDeclarado: number;
    observaciones?: string | undefined;
    fecha?: string | undefined;
}>;
export declare const CASH_MOVEMENT_TYPES: readonly ["ingreso", "egreso"];
export declare const CASH_MOVEMENT_CATEGORIES: readonly ["apertura_caja", "gasto_operativo", "compra_repuesto", "pago_proveedor", "devolucion", "retiro", "ajuste", "otro"];
export declare const createCashMovementSchema: z.ZodObject<{
    tipo: z.ZodEnum<["ingreso", "egreso"]>;
    categoria: z.ZodEnum<["apertura_caja", "gasto_operativo", "compra_repuesto", "pago_proveedor", "devolucion", "retiro", "ajuste", "otro"]>;
    monto: z.ZodNumber;
    metodo: z.ZodEnum<["efectivo", "transferencia", "tarjeta_debito", "tarjeta_credito", "cheque", "otro"]>;
    descripcion: z.ZodString;
    referencia: z.ZodOptional<z.ZodString>;
    fecha: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
}, "strip", z.ZodTypeAny, {
    tipo: "ingreso" | "egreso";
    descripcion: string;
    monto: number;
    metodo: "efectivo" | "transferencia" | "tarjeta_debito" | "tarjeta_credito" | "cheque" | "otro";
    categoria: "ajuste" | "otro" | "apertura_caja" | "gasto_operativo" | "compra_repuesto" | "pago_proveedor" | "devolucion" | "retiro";
    referencia?: string | undefined;
    fecha?: string | undefined;
}, {
    tipo: "ingreso" | "egreso";
    descripcion: string;
    monto: number;
    metodo: "efectivo" | "transferencia" | "tarjeta_debito" | "tarjeta_credito" | "cheque" | "otro";
    categoria: "ajuste" | "otro" | "apertura_caja" | "gasto_operativo" | "compra_repuesto" | "pago_proveedor" | "devolucion" | "retiro";
    referencia?: string | undefined;
    fecha?: string | undefined;
}>;
export declare const voidCashMovementSchema: z.ZodObject<{
    motivo: z.ZodString;
}, "strip", z.ZodTypeAny, {
    motivo: string;
}, {
    motivo: string;
}>;
export type CashMovementType = (typeof CASH_MOVEMENT_TYPES)[number];
export type CashMovementCategory = (typeof CASH_MOVEMENT_CATEGORIES)[number];
export type CreateCashMovementInput = z.infer<typeof createCashMovementSchema>;
export type VoidCashMovementInput = z.infer<typeof voidCashMovementSchema>;
export type FinanceDayQueryInput = z.infer<typeof financeDayQuerySchema>;
export type CloseCashDayInput = z.infer<typeof closeCashDaySchema>;
