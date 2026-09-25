import { z } from 'zod';
export declare const PAYMENT_METHODS: readonly ["efectivo", "transferencia", "tarjeta_debito", "tarjeta_credito", "cheque", "otro"];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export declare const PAYMENT_BANKS: readonly ["Banco de Chile", "Banco Santander", "BCI", "Banco Estado"];
export type PaymentBank = (typeof PAYMENT_BANKS)[number];
export declare const PAYMENT_STATUS: readonly ["confirmado", "por_verificar", "rechazado"];
export type PaymentStatus = (typeof PAYMENT_STATUS)[number];
export declare const createPaymentSchema: z.ZodEffects<z.ZodObject<{
    quotationId: z.ZodNumber;
    monto: z.ZodNumber;
    metodo: z.ZodEnum<["efectivo", "transferencia", "tarjeta_debito", "tarjeta_credito", "cheque", "otro"]>;
    referencia: z.ZodOptional<z.ZodString>;
    bancoOrigen: z.ZodOptional<z.ZodEnum<["Banco de Chile", "Banco Santander", "BCI", "Banco Estado"]>>;
    numeroTransaccion: z.ZodOptional<z.ZodString>;
    comprobantePago: z.ZodOptional<z.ZodString>;
    fecha: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    quotationId: number;
    monto: number;
    metodo: "efectivo" | "transferencia" | "tarjeta_debito" | "tarjeta_credito" | "cheque" | "otro";
    referencia?: string | undefined;
    bancoOrigen?: "Banco de Chile" | "Banco Santander" | "BCI" | "Banco Estado" | undefined;
    numeroTransaccion?: string | undefined;
    comprobantePago?: string | undefined;
    fecha?: string | undefined;
}, {
    quotationId: number;
    monto: number;
    metodo: "efectivo" | "transferencia" | "tarjeta_debito" | "tarjeta_credito" | "cheque" | "otro";
    referencia?: string | undefined;
    bancoOrigen?: "Banco de Chile" | "Banco Santander" | "BCI" | "Banco Estado" | undefined;
    numeroTransaccion?: string | undefined;
    comprobantePago?: string | undefined;
    fecha?: string | undefined;
}>, {
    quotationId: number;
    monto: number;
    metodo: "efectivo" | "transferencia" | "tarjeta_debito" | "tarjeta_credito" | "cheque" | "otro";
    referencia?: string | undefined;
    bancoOrigen?: "Banco de Chile" | "Banco Santander" | "BCI" | "Banco Estado" | undefined;
    numeroTransaccion?: string | undefined;
    comprobantePago?: string | undefined;
    fecha?: string | undefined;
}, {
    quotationId: number;
    monto: number;
    metodo: "efectivo" | "transferencia" | "tarjeta_debito" | "tarjeta_credito" | "cheque" | "otro";
    referencia?: string | undefined;
    bancoOrigen?: "Banco de Chile" | "Banco Santander" | "BCI" | "Banco Estado" | undefined;
    numeroTransaccion?: string | undefined;
    comprobantePago?: string | undefined;
    fecha?: string | undefined;
}>;
export declare const updatePaymentSchema: z.ZodObject<{
    quotationId: z.ZodOptional<z.ZodNumber>;
    monto: z.ZodOptional<z.ZodNumber>;
    metodo: z.ZodOptional<z.ZodEnum<["efectivo", "transferencia", "tarjeta_debito", "tarjeta_credito", "cheque", "otro"]>>;
    referencia: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    bancoOrigen: z.ZodOptional<z.ZodOptional<z.ZodEnum<["Banco de Chile", "Banco Santander", "BCI", "Banco Estado"]>>>;
    numeroTransaccion: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    comprobantePago: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    fecha: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    quotationId?: number | undefined;
    monto?: number | undefined;
    metodo?: "efectivo" | "transferencia" | "tarjeta_debito" | "tarjeta_credito" | "cheque" | "otro" | undefined;
    referencia?: string | undefined;
    bancoOrigen?: "Banco de Chile" | "Banco Santander" | "BCI" | "Banco Estado" | undefined;
    numeroTransaccion?: string | undefined;
    comprobantePago?: string | undefined;
    fecha?: string | undefined;
}, {
    quotationId?: number | undefined;
    monto?: number | undefined;
    metodo?: "efectivo" | "transferencia" | "tarjeta_debito" | "tarjeta_credito" | "cheque" | "otro" | undefined;
    referencia?: string | undefined;
    bancoOrigen?: "Banco de Chile" | "Banco Santander" | "BCI" | "Banco Estado" | undefined;
    numeroTransaccion?: string | undefined;
    comprobantePago?: string | undefined;
    fecha?: string | undefined;
}>;
export declare const paymentQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
} & {
    quotationId: z.ZodOptional<z.ZodNumber>;
    metodo: z.ZodOptional<z.ZodEnum<["efectivo", "transferencia", "tarjeta_debito", "tarjeta_credito", "cheque", "otro"]>>;
    estado: z.ZodOptional<z.ZodEnum<["confirmado", "por_verificar", "rechazado"]>>;
    fechaDesde: z.ZodOptional<z.ZodString>;
    fechaHasta: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    estado?: "por_verificar" | "confirmado" | "rechazado" | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    quotationId?: number | undefined;
    metodo?: "efectivo" | "transferencia" | "tarjeta_debito" | "tarjeta_credito" | "cheque" | "otro" | undefined;
}, {
    page?: number | undefined;
    pageSize?: number | undefined;
    estado?: "por_verificar" | "confirmado" | "rechazado" | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    quotationId?: number | undefined;
    metodo?: "efectivo" | "transferencia" | "tarjeta_debito" | "tarjeta_credito" | "cheque" | "otro" | undefined;
}>;
export declare const verifyPaymentSchema: z.ZodObject<{
    decision: z.ZodEnum<["aprobar", "rechazar"]>;
    comentario: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    decision: "aprobar" | "rechazar";
    comentario?: string | undefined;
}, {
    decision: "aprobar" | "rechazar";
    comentario?: string | undefined;
}>;
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
