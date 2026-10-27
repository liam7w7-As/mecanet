import { z } from 'zod';
export declare const purchaseItemSchema: z.ZodObject<{
    catalogItemId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    descripcion: z.ZodString;
    cantidad: z.ZodNumber;
    precioUnitario: z.ZodNumber;
    afectaStock: z.ZodDefault<z.ZodEffects<z.ZodUnion<[z.ZodBoolean, z.ZodEnum<["true", "false", "1", "0"]>]>, boolean, boolean | "0" | "1" | "true" | "false">>;
    warehouseId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    cantidad: number;
    precioUnitario: number;
    descripcion: string;
    afectaStock: boolean;
    catalogItemId?: number | null | undefined;
    warehouseId?: number | null | undefined;
}, {
    cantidad: number;
    precioUnitario: number;
    descripcion: string;
    catalogItemId?: number | null | undefined;
    warehouseId?: number | null | undefined;
    afectaStock?: boolean | "0" | "1" | "true" | "false" | undefined;
}>;
export declare const createPurchaseSchema: z.ZodEffects<z.ZodObject<{
    proveedorId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    proveedorNombre: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    origenVehiculo: z.ZodOptional<z.ZodNullable<z.ZodEnum<["taller", "flota"]>>>;
    vehicleId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    fleetVehicleId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    workOrderId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    conIva: z.ZodDefault<z.ZodEffects<z.ZodUnion<[z.ZodBoolean, z.ZodEnum<["true", "false", "1", "0"]>]>, boolean, boolean | "0" | "1" | "true" | "false">>;
    formaPago: z.ZodDefault<z.ZodEnum<["contado", "credito"]>>;
    metodoPago: z.ZodDefault<z.ZodEnum<["efectivo", "transferencia", "tarjeta_debito", "tarjeta_credito", "cheque", "otro"]>>;
    tipoDocumento: z.ZodEnum<["factura", "boleta", "recibo", "nota_credito", "otro"]>;
    folio: z.ZodString;
    fechaEmision: z.ZodEffects<z.ZodString, string, string>;
    montoComprobante: z.ZodNumber;
    numeroOperacion: z.ZodString;
    banco: z.ZodString;
    observaciones: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    items: z.ZodArray<z.ZodObject<{
        catalogItemId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        descripcion: z.ZodString;
        cantidad: z.ZodNumber;
        precioUnitario: z.ZodNumber;
        afectaStock: z.ZodDefault<z.ZodEffects<z.ZodUnion<[z.ZodBoolean, z.ZodEnum<["true", "false", "1", "0"]>]>, boolean, boolean | "0" | "1" | "true" | "false">>;
        warehouseId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        cantidad: number;
        precioUnitario: number;
        descripcion: string;
        afectaStock: boolean;
        catalogItemId?: number | null | undefined;
        warehouseId?: number | null | undefined;
    }, {
        cantidad: number;
        precioUnitario: number;
        descripcion: string;
        catalogItemId?: number | null | undefined;
        warehouseId?: number | null | undefined;
        afectaStock?: boolean | "0" | "1" | "true" | "false" | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    items: {
        cantidad: number;
        precioUnitario: number;
        descripcion: string;
        afectaStock: boolean;
        catalogItemId?: number | null | undefined;
        warehouseId?: number | null | undefined;
    }[];
    fechaEmision: string;
    formaPago: "contado" | "credito";
    conIva: boolean;
    metodoPago: "transferencia" | "efectivo" | "otro" | "tarjeta_debito" | "tarjeta_credito" | "cheque";
    tipoDocumento: "factura" | "boleta" | "recibo" | "nota_credito" | "otro";
    folio: string;
    montoComprobante: number;
    numeroOperacion: string;
    banco: string;
    observaciones?: string | null | undefined;
    vehicleId?: number | null | undefined;
    workOrderId?: number | null | undefined;
    proveedorId?: number | null | undefined;
    proveedorNombre?: string | null | undefined;
    origenVehiculo?: "taller" | "flota" | null | undefined;
    fleetVehicleId?: number | null | undefined;
}, {
    items: {
        cantidad: number;
        precioUnitario: number;
        descripcion: string;
        catalogItemId?: number | null | undefined;
        warehouseId?: number | null | undefined;
        afectaStock?: boolean | "0" | "1" | "true" | "false" | undefined;
    }[];
    fechaEmision: string;
    tipoDocumento: "factura" | "boleta" | "recibo" | "nota_credito" | "otro";
    folio: string;
    montoComprobante: number;
    numeroOperacion: string;
    banco: string;
    observaciones?: string | null | undefined;
    vehicleId?: number | null | undefined;
    workOrderId?: number | null | undefined;
    formaPago?: "contado" | "credito" | undefined;
    proveedorId?: number | null | undefined;
    proveedorNombre?: string | null | undefined;
    origenVehiculo?: "taller" | "flota" | null | undefined;
    fleetVehicleId?: number | null | undefined;
    conIva?: boolean | "0" | "1" | "true" | "false" | undefined;
    metodoPago?: "transferencia" | "efectivo" | "otro" | "tarjeta_debito" | "tarjeta_credito" | "cheque" | undefined;
}>, {
    items: {
        cantidad: number;
        precioUnitario: number;
        descripcion: string;
        afectaStock: boolean;
        catalogItemId?: number | null | undefined;
        warehouseId?: number | null | undefined;
    }[];
    fechaEmision: string;
    formaPago: "contado" | "credito";
    conIva: boolean;
    metodoPago: "transferencia" | "efectivo" | "otro" | "tarjeta_debito" | "tarjeta_credito" | "cheque";
    tipoDocumento: "factura" | "boleta" | "recibo" | "nota_credito" | "otro";
    folio: string;
    montoComprobante: number;
    numeroOperacion: string;
    banco: string;
    observaciones?: string | null | undefined;
    vehicleId?: number | null | undefined;
    workOrderId?: number | null | undefined;
    proveedorId?: number | null | undefined;
    proveedorNombre?: string | null | undefined;
    origenVehiculo?: "taller" | "flota" | null | undefined;
    fleetVehicleId?: number | null | undefined;
}, {
    items: {
        cantidad: number;
        precioUnitario: number;
        descripcion: string;
        catalogItemId?: number | null | undefined;
        warehouseId?: number | null | undefined;
        afectaStock?: boolean | "0" | "1" | "true" | "false" | undefined;
    }[];
    fechaEmision: string;
    tipoDocumento: "factura" | "boleta" | "recibo" | "nota_credito" | "otro";
    folio: string;
    montoComprobante: number;
    numeroOperacion: string;
    banco: string;
    observaciones?: string | null | undefined;
    vehicleId?: number | null | undefined;
    workOrderId?: number | null | undefined;
    formaPago?: "contado" | "credito" | undefined;
    proveedorId?: number | null | undefined;
    proveedorNombre?: string | null | undefined;
    origenVehiculo?: "taller" | "flota" | null | undefined;
    fleetVehicleId?: number | null | undefined;
    conIva?: boolean | "0" | "1" | "true" | "false" | undefined;
    metodoPago?: "transferencia" | "efectivo" | "otro" | "tarjeta_debito" | "tarjeta_credito" | "cheque" | undefined;
}>;
export declare const purchaseQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
} & {
    search: z.ZodOptional<z.ZodString>;
    estado: z.ZodOptional<z.ZodEnum<["registrada", "anulada"]>>;
    formaPago: z.ZodOptional<z.ZodEnum<["contado", "credito"]>>;
    tipoDocumento: z.ZodOptional<z.ZodEnum<["factura", "boleta", "recibo", "nota_credito", "otro"]>>;
    proveedorId: z.ZodOptional<z.ZodNumber>;
    fechaDesde: z.ZodOptional<z.ZodString>;
    fechaHasta: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    search?: string | undefined;
    estado?: "registrada" | "anulada" | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    formaPago?: "contado" | "credito" | undefined;
    proveedorId?: number | undefined;
    tipoDocumento?: "factura" | "boleta" | "recibo" | "nota_credito" | "otro" | undefined;
}, {
    page?: number | undefined;
    pageSize?: number | undefined;
    search?: string | undefined;
    estado?: "registrada" | "anulada" | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    formaPago?: "contado" | "credito" | undefined;
    proveedorId?: number | undefined;
    tipoDocumento?: "factura" | "boleta" | "recibo" | "nota_credito" | "otro" | undefined;
}>;
export declare const purchaseReportQuerySchema: z.ZodObject<Omit<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
} & {
    search: z.ZodOptional<z.ZodString>;
    estado: z.ZodOptional<z.ZodEnum<["registrada", "anulada"]>>;
    formaPago: z.ZodOptional<z.ZodEnum<["contado", "credito"]>>;
    tipoDocumento: z.ZodOptional<z.ZodEnum<["factura", "boleta", "recibo", "nota_credito", "otro"]>>;
    proveedorId: z.ZodOptional<z.ZodNumber>;
    fechaDesde: z.ZodOptional<z.ZodString>;
    fechaHasta: z.ZodOptional<z.ZodString>;
}, "page" | "pageSize">, "strip", z.ZodTypeAny, {
    search?: string | undefined;
    estado?: "registrada" | "anulada" | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    formaPago?: "contado" | "credito" | undefined;
    proveedorId?: number | undefined;
    tipoDocumento?: "factura" | "boleta" | "recibo" | "nota_credito" | "otro" | undefined;
}, {
    search?: string | undefined;
    estado?: "registrada" | "anulada" | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    formaPago?: "contado" | "credito" | undefined;
    proveedorId?: number | undefined;
    tipoDocumento?: "factura" | "boleta" | "recibo" | "nota_credito" | "otro" | undefined;
}>;
export declare const voidPurchaseSchema: z.ZodObject<{
    motivo: z.ZodString;
}, "strip", z.ZodTypeAny, {
    motivo: string;
}, {
    motivo: string;
}>;
export declare const registerPurchasePaymentSchema: z.ZodObject<{
    metodo: z.ZodEnum<["efectivo", "transferencia", "tarjeta_debito", "tarjeta_credito", "cheque", "otro"]>;
    referencia: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    banco: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    numeroOperacion: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
}, "strip", z.ZodTypeAny, {
    metodo: "transferencia" | "efectivo" | "otro" | "tarjeta_debito" | "tarjeta_credito" | "cheque";
    referencia?: string | null | undefined;
    numeroOperacion?: string | null | undefined;
    banco?: string | null | undefined;
}, {
    metodo: "transferencia" | "efectivo" | "otro" | "tarjeta_debito" | "tarjeta_credito" | "cheque";
    referencia?: string | null | undefined;
    numeroOperacion?: string | null | undefined;
    banco?: string | null | undefined;
}>;
export type PurchaseItemInput = z.infer<typeof purchaseItemSchema>;
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type PurchaseQueryInput = z.infer<typeof purchaseQuerySchema>;
export type PurchaseReportQueryInput = z.infer<typeof purchaseReportQuerySchema>;
export type VoidPurchaseInput = z.infer<typeof voidPurchaseSchema>;
export type RegisterPurchasePaymentInput = z.infer<typeof registerPurchasePaymentSchema>;
