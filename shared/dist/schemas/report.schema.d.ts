import { z } from 'zod';
export declare const commercialReportQuerySchema: z.ZodEffects<z.ZodObject<{
    fechaDesde: z.ZodDefault<z.ZodString>;
    fechaHasta: z.ZodDefault<z.ZodString>;
    estadoPago: z.ZodOptional<z.ZodEnum<["total", "parcial", "por_verificar", "por_pagar", "ot_finalizado"]>>;
    asesorId: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    fechaDesde: string;
    fechaHasta: string;
    estadoPago?: "total" | "parcial" | "por_verificar" | "por_pagar" | "ot_finalizado" | undefined;
    asesorId?: number | undefined;
}, {
    estadoPago?: "total" | "parcial" | "por_verificar" | "por_pagar" | "ot_finalizado" | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    asesorId?: number | undefined;
}>, {
    fechaDesde: string;
    fechaHasta: string;
    estadoPago?: "total" | "parcial" | "por_verificar" | "por_pagar" | "ot_finalizado" | undefined;
    asesorId?: number | undefined;
}, {
    estadoPago?: "total" | "parcial" | "por_verificar" | "por_pagar" | "ot_finalizado" | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    asesorId?: number | undefined;
}>;
export type CommercialReportFilters = z.infer<typeof commercialReportQuerySchema>;
export declare const financialReportQuerySchema: z.ZodEffects<z.ZodObject<{
    fechaDesde: z.ZodDefault<z.ZodString>;
    fechaHasta: z.ZodDefault<z.ZodString>;
    agruparPor: z.ZodDefault<z.ZodEnum<["dia", "semana", "mes"]>>;
    asesorId: z.ZodOptional<z.ZodNumber>;
    clientId: z.ZodOptional<z.ZodNumber>;
    estadoPago: z.ZodOptional<z.ZodEnum<["total", "parcial", "por_verificar", "por_pagar", "ot_finalizado"]>>;
    metodo: z.ZodOptional<z.ZodEnum<["efectivo", "transferencia", "tarjeta_debito", "tarjeta_credito", "cheque", "otro"]>>;
    catalogType: z.ZodOptional<z.ZodEnum<["parte", "estandar", "especifico"]>>;
    movimientoTipo: z.ZodOptional<z.ZodEnum<["ingreso", "egreso"]>>;
    movimientoCategoria: z.ZodOptional<z.ZodEnum<["apertura_caja", "gasto_operativo", "compra_repuesto", "pago_proveedor", "devolucion", "retiro", "ajuste", "otro"]>>;
    comparar: z.ZodDefault<z.ZodEffects<z.ZodUnion<[z.ZodBoolean, z.ZodEnum<["true", "false"]>]>, boolean, boolean | "true" | "false">>;
}, "strip", z.ZodTypeAny, {
    fechaDesde: string;
    fechaHasta: string;
    agruparPor: "dia" | "semana" | "mes";
    comparar: boolean;
    estadoPago?: "total" | "parcial" | "por_verificar" | "por_pagar" | "ot_finalizado" | undefined;
    clientId?: number | undefined;
    metodo?: "efectivo" | "transferencia" | "tarjeta_debito" | "tarjeta_credito" | "cheque" | "otro" | undefined;
    asesorId?: number | undefined;
    catalogType?: "parte" | "estandar" | "especifico" | undefined;
    movimientoTipo?: "ingreso" | "egreso" | undefined;
    movimientoCategoria?: "otro" | "apertura_caja" | "gasto_operativo" | "compra_repuesto" | "pago_proveedor" | "devolucion" | "retiro" | "ajuste" | undefined;
}, {
    estadoPago?: "total" | "parcial" | "por_verificar" | "por_pagar" | "ot_finalizado" | undefined;
    clientId?: number | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    metodo?: "efectivo" | "transferencia" | "tarjeta_debito" | "tarjeta_credito" | "cheque" | "otro" | undefined;
    asesorId?: number | undefined;
    agruparPor?: "dia" | "semana" | "mes" | undefined;
    catalogType?: "parte" | "estandar" | "especifico" | undefined;
    movimientoTipo?: "ingreso" | "egreso" | undefined;
    movimientoCategoria?: "otro" | "apertura_caja" | "gasto_operativo" | "compra_repuesto" | "pago_proveedor" | "devolucion" | "retiro" | "ajuste" | undefined;
    comparar?: boolean | "true" | "false" | undefined;
}>, {
    fechaDesde: string;
    fechaHasta: string;
    agruparPor: "dia" | "semana" | "mes";
    comparar: boolean;
    estadoPago?: "total" | "parcial" | "por_verificar" | "por_pagar" | "ot_finalizado" | undefined;
    clientId?: number | undefined;
    metodo?: "efectivo" | "transferencia" | "tarjeta_debito" | "tarjeta_credito" | "cheque" | "otro" | undefined;
    asesorId?: number | undefined;
    catalogType?: "parte" | "estandar" | "especifico" | undefined;
    movimientoTipo?: "ingreso" | "egreso" | undefined;
    movimientoCategoria?: "otro" | "apertura_caja" | "gasto_operativo" | "compra_repuesto" | "pago_proveedor" | "devolucion" | "retiro" | "ajuste" | undefined;
}, {
    estadoPago?: "total" | "parcial" | "por_verificar" | "por_pagar" | "ot_finalizado" | undefined;
    clientId?: number | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    metodo?: "efectivo" | "transferencia" | "tarjeta_debito" | "tarjeta_credito" | "cheque" | "otro" | undefined;
    asesorId?: number | undefined;
    agruparPor?: "dia" | "semana" | "mes" | undefined;
    catalogType?: "parte" | "estandar" | "especifico" | undefined;
    movimientoTipo?: "ingreso" | "egreso" | undefined;
    movimientoCategoria?: "otro" | "apertura_caja" | "gasto_operativo" | "compra_repuesto" | "pago_proveedor" | "devolucion" | "retiro" | "ajuste" | undefined;
    comparar?: boolean | "true" | "false" | undefined;
}>;
export type FinancialReportFilters = z.infer<typeof financialReportQuerySchema>;
