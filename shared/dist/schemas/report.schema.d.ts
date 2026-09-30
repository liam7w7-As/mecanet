import { z } from 'zod';
export declare const commercialReportQuerySchema: z.ZodEffects<z.ZodObject<{
    fechaDesde: z.ZodDefault<z.ZodString>;
    fechaHasta: z.ZodDefault<z.ZodString>;
    estadoPago: z.ZodOptional<z.ZodEnum<["total", "parcial", "por_verificar", "por_pagar", "ot_finalizado"]>>;
    asesorId: z.ZodOptional<z.ZodNumber>;
    clientId: z.ZodOptional<z.ZodNumber>;
    vehicleId: z.ZodOptional<z.ZodNumber>;
    workOrderId: z.ZodOptional<z.ZodNumber>;
    search: z.ZodOptional<z.ZodString>;
    workOrderLinked: z.ZodOptional<z.ZodEffects<z.ZodEnum<["true", "false"]>, boolean, "true" | "false">>;
}, "strip", z.ZodTypeAny, {
    fechaDesde: string;
    fechaHasta: string;
    search?: string | undefined;
    estadoPago?: "total" | "parcial" | "por_verificar" | "por_pagar" | "ot_finalizado" | undefined;
    clientId?: number | undefined;
    vehicleId?: number | undefined;
    workOrderId?: number | undefined;
    workOrderLinked?: boolean | undefined;
    asesorId?: number | undefined;
}, {
    search?: string | undefined;
    estadoPago?: "total" | "parcial" | "por_verificar" | "por_pagar" | "ot_finalizado" | undefined;
    clientId?: number | undefined;
    vehicleId?: number | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    workOrderId?: number | undefined;
    workOrderLinked?: "true" | "false" | undefined;
    asesorId?: number | undefined;
}>, {
    fechaDesde: string;
    fechaHasta: string;
    search?: string | undefined;
    estadoPago?: "total" | "parcial" | "por_verificar" | "por_pagar" | "ot_finalizado" | undefined;
    clientId?: number | undefined;
    vehicleId?: number | undefined;
    workOrderId?: number | undefined;
    workOrderLinked?: boolean | undefined;
    asesorId?: number | undefined;
}, {
    search?: string | undefined;
    estadoPago?: "total" | "parcial" | "por_verificar" | "por_pagar" | "ot_finalizado" | undefined;
    clientId?: number | undefined;
    vehicleId?: number | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    workOrderId?: number | undefined;
    workOrderLinked?: "true" | "false" | undefined;
    asesorId?: number | undefined;
}>;
export type CommercialReportFilters = z.infer<typeof commercialReportQuerySchema>;
export declare const workshopReportQuerySchema: z.ZodEffects<z.ZodObject<{
    fechaDesde: z.ZodDefault<z.ZodString>;
    fechaHasta: z.ZodDefault<z.ZodString>;
    estado: z.ZodOptional<z.ZodEnum<["borrador", "en_progreso", "esperando_repuesto", "finalizada", "entregada", "cancelada"]>>;
    mechanicId: z.ZodOptional<z.ZodNumber>;
    clientId: z.ZodOptional<z.ZodNumber>;
    vehicleId: z.ZodOptional<z.ZodNumber>;
    search: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    fechaDesde: string;
    fechaHasta: string;
    search?: string | undefined;
    estado?: "borrador" | "en_progreso" | "esperando_repuesto" | "finalizada" | "entregada" | "cancelada" | undefined;
    clientId?: number | undefined;
    vehicleId?: number | undefined;
    mechanicId?: number | undefined;
}, {
    search?: string | undefined;
    estado?: "borrador" | "en_progreso" | "esperando_repuesto" | "finalizada" | "entregada" | "cancelada" | undefined;
    clientId?: number | undefined;
    vehicleId?: number | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    mechanicId?: number | undefined;
}>, {
    fechaDesde: string;
    fechaHasta: string;
    search?: string | undefined;
    estado?: "borrador" | "en_progreso" | "esperando_repuesto" | "finalizada" | "entregada" | "cancelada" | undefined;
    clientId?: number | undefined;
    vehicleId?: number | undefined;
    mechanicId?: number | undefined;
}, {
    search?: string | undefined;
    estado?: "borrador" | "en_progreso" | "esperando_repuesto" | "finalizada" | "entregada" | "cancelada" | undefined;
    clientId?: number | undefined;
    vehicleId?: number | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    mechanicId?: number | undefined;
}>;
export type WorkshopReportFilters = z.infer<typeof workshopReportQuerySchema>;
export declare const inventoryReportQuerySchema: z.ZodEffects<z.ZodObject<{
    fechaDesde: z.ZodDefault<z.ZodString>;
    fechaHasta: z.ZodDefault<z.ZodString>;
    warehouseId: z.ZodOptional<z.ZodNumber>;
    catalogItemId: z.ZodOptional<z.ZodNumber>;
    tipo: z.ZodOptional<z.ZodEnum<["ingreso", "salida", "ajuste", "traslado_salida", "traslado_ingreso", "consumo_ot"]>>;
    stock: z.ZodDefault<z.ZodEnum<["todos", "con_stock", "sin_stock", "critico"]>>;
    search: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    stock: "todos" | "con_stock" | "sin_stock" | "critico";
    fechaDesde: string;
    fechaHasta: string;
    search?: string | undefined;
    tipo?: "ingreso" | "salida" | "ajuste" | "traslado_salida" | "traslado_ingreso" | "consumo_ot" | undefined;
    catalogItemId?: number | undefined;
    warehouseId?: number | undefined;
}, {
    search?: string | undefined;
    tipo?: "ingreso" | "salida" | "ajuste" | "traslado_salida" | "traslado_ingreso" | "consumo_ot" | undefined;
    stock?: "todos" | "con_stock" | "sin_stock" | "critico" | undefined;
    catalogItemId?: number | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    warehouseId?: number | undefined;
}>, {
    stock: "todos" | "con_stock" | "sin_stock" | "critico";
    fechaDesde: string;
    fechaHasta: string;
    search?: string | undefined;
    tipo?: "ingreso" | "salida" | "ajuste" | "traslado_salida" | "traslado_ingreso" | "consumo_ot" | undefined;
    catalogItemId?: number | undefined;
    warehouseId?: number | undefined;
}, {
    search?: string | undefined;
    tipo?: "ingreso" | "salida" | "ajuste" | "traslado_salida" | "traslado_ingreso" | "consumo_ot" | undefined;
    stock?: "todos" | "con_stock" | "sin_stock" | "critico" | undefined;
    catalogItemId?: number | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    warehouseId?: number | undefined;
}>;
export type InventoryReportFilters = z.infer<typeof inventoryReportQuerySchema>;
export declare const catalogReportQuerySchema: z.ZodEffects<z.ZodObject<{
    fechaDesde: z.ZodDefault<z.ZodString>;
    fechaHasta: z.ZodDefault<z.ZodString>;
    tipo: z.ZodOptional<z.ZodEnum<["parte", "estandar", "especifico"]>>;
    stock: z.ZodDefault<z.ZodEnum<["todos", "con_stock", "sin_stock", "critico"]>>;
    search: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    stock: "todos" | "con_stock" | "sin_stock" | "critico";
    fechaDesde: string;
    fechaHasta: string;
    search?: string | undefined;
    tipo?: "parte" | "estandar" | "especifico" | undefined;
}, {
    search?: string | undefined;
    tipo?: "parte" | "estandar" | "especifico" | undefined;
    stock?: "todos" | "con_stock" | "sin_stock" | "critico" | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
}>, {
    stock: "todos" | "con_stock" | "sin_stock" | "critico";
    fechaDesde: string;
    fechaHasta: string;
    search?: string | undefined;
    tipo?: "parte" | "estandar" | "especifico" | undefined;
}, {
    search?: string | undefined;
    tipo?: "parte" | "estandar" | "especifico" | undefined;
    stock?: "todos" | "con_stock" | "sin_stock" | "critico" | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
}>;
export type CatalogReportFilters = z.infer<typeof catalogReportQuerySchema>;
export declare const fleetReportQuerySchema: z.ZodEffects<z.ZodObject<{
    fechaDesde: z.ZodDefault<z.ZodString>;
    fechaHasta: z.ZodDefault<z.ZodString>;
    clientType: z.ZodOptional<z.ZodEnum<["cliente", "empresa"]>>;
    clientId: z.ZodOptional<z.ZodNumber>;
    vehicleId: z.ZodOptional<z.ZodNumber>;
    scope: z.ZodDefault<z.ZodEnum<["all", "clients", "vehicles"]>>;
    onlyWithHistory: z.ZodOptional<z.ZodEffects<z.ZodUnion<[z.ZodBoolean, z.ZodEnum<["true", "false"]>]>, boolean, boolean | "true" | "false">>;
    search: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    fechaDesde: string;
    fechaHasta: string;
    scope: "all" | "clients" | "vehicles";
    search?: string | undefined;
    clientId?: number | undefined;
    vehicleId?: number | undefined;
    clientType?: "cliente" | "empresa" | undefined;
    onlyWithHistory?: boolean | undefined;
}, {
    search?: string | undefined;
    clientId?: number | undefined;
    vehicleId?: number | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    clientType?: "cliente" | "empresa" | undefined;
    scope?: "all" | "clients" | "vehicles" | undefined;
    onlyWithHistory?: boolean | "true" | "false" | undefined;
}>, {
    fechaDesde: string;
    fechaHasta: string;
    scope: "all" | "clients" | "vehicles";
    search?: string | undefined;
    clientId?: number | undefined;
    vehicleId?: number | undefined;
    clientType?: "cliente" | "empresa" | undefined;
    onlyWithHistory?: boolean | undefined;
}, {
    search?: string | undefined;
    clientId?: number | undefined;
    vehicleId?: number | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    clientType?: "cliente" | "empresa" | undefined;
    scope?: "all" | "clients" | "vehicles" | undefined;
    onlyWithHistory?: boolean | "true" | "false" | undefined;
}>;
export type FleetReportFilters = z.infer<typeof fleetReportQuerySchema>;
export declare const administrationReportQuerySchema: z.ZodEffects<z.ZodObject<{
    fechaDesde: z.ZodDefault<z.ZodString>;
    fechaHasta: z.ZodDefault<z.ZodString>;
    roleId: z.ZodOptional<z.ZodNumber>;
    activo: z.ZodOptional<z.ZodEffects<z.ZodUnion<[z.ZodBoolean, z.ZodEnum<["true", "false"]>]>, boolean, boolean | "true" | "false">>;
    includeDeleted: z.ZodDefault<z.ZodEffects<z.ZodUnion<[z.ZodBoolean, z.ZodEnum<["true", "false"]>]>, boolean, boolean | "true" | "false">>;
    search: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    fechaDesde: string;
    fechaHasta: string;
    includeDeleted: boolean;
    roleId?: number | undefined;
    activo?: boolean | undefined;
    search?: string | undefined;
}, {
    roleId?: number | undefined;
    activo?: boolean | "true" | "false" | undefined;
    search?: string | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    includeDeleted?: boolean | "true" | "false" | undefined;
}>, {
    fechaDesde: string;
    fechaHasta: string;
    includeDeleted: boolean;
    roleId?: number | undefined;
    activo?: boolean | undefined;
    search?: string | undefined;
}, {
    roleId?: number | undefined;
    activo?: boolean | "true" | "false" | undefined;
    search?: string | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    includeDeleted?: boolean | "true" | "false" | undefined;
}>;
export type AdministrationReportFilters = z.infer<typeof administrationReportQuerySchema>;
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
    movimientoCategoria?: "ajuste" | "otro" | "apertura_caja" | "gasto_operativo" | "compra_repuesto" | "pago_proveedor" | "devolucion" | "retiro" | undefined;
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
    movimientoCategoria?: "ajuste" | "otro" | "apertura_caja" | "gasto_operativo" | "compra_repuesto" | "pago_proveedor" | "devolucion" | "retiro" | undefined;
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
    movimientoCategoria?: "ajuste" | "otro" | "apertura_caja" | "gasto_operativo" | "compra_repuesto" | "pago_proveedor" | "devolucion" | "retiro" | undefined;
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
    movimientoCategoria?: "ajuste" | "otro" | "apertura_caja" | "gasto_operativo" | "compra_repuesto" | "pago_proveedor" | "devolucion" | "retiro" | undefined;
    comparar?: boolean | "true" | "false" | undefined;
}>;
export type FinancialReportFilters = z.infer<typeof financialReportQuerySchema>;
