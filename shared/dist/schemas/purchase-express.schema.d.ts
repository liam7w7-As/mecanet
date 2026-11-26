import { z } from 'zod';
export declare const EXPRESS_MARKUP = 0.25;
/** Prices here are the actual paid/customer amounts, not catalogue selling prices. */
export declare const createExpressPurchaseSchema: z.ZodEffects<z.ZodObject<{
    operationKey: z.ZodString;
    workOrderId: z.ZodNumber;
    requestId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    descripcion: z.ZodString;
    cantidad: z.ZodNumber;
    costoUnitario: z.ZodNumber;
    ventaUnitario: z.ZodNumber;
    conIva: z.ZodDefault<z.ZodBoolean>;
    metodoPago: z.ZodDefault<z.ZodEnum<["efectivo", "transferencia", "tarjeta_debito", "tarjeta_credito", "cheque", "otro"]>>;
    proveedorNombre: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    tipoDocumento: z.ZodDefault<z.ZodEnum<["factura", "boleta", "recibo", "nota_credito", "otro"]>>;
    folio: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    fechaEmision: z.ZodOptional<z.ZodString>;
    detalle: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    cantidad: number;
    descripcion: string;
    workOrderId: number;
    conIva: boolean;
    metodoPago: "transferencia" | "efectivo" | "otro" | "tarjeta_debito" | "tarjeta_credito" | "cheque";
    tipoDocumento: "factura" | "boleta" | "recibo" | "nota_credito" | "otro";
    operationKey: string;
    costoUnitario: number;
    ventaUnitario: number;
    fechaEmision?: string | undefined;
    proveedorNombre?: string | null | undefined;
    folio?: string | null | undefined;
    requestId?: number | null | undefined;
    detalle?: string | null | undefined;
}, {
    cantidad: number;
    descripcion: string;
    workOrderId: number;
    operationKey: string;
    costoUnitario: number;
    ventaUnitario: number;
    fechaEmision?: string | undefined;
    proveedorNombre?: string | null | undefined;
    conIva?: boolean | undefined;
    metodoPago?: "transferencia" | "efectivo" | "otro" | "tarjeta_debito" | "tarjeta_credito" | "cheque" | undefined;
    tipoDocumento?: "factura" | "boleta" | "recibo" | "nota_credito" | "otro" | undefined;
    folio?: string | null | undefined;
    requestId?: number | null | undefined;
    detalle?: string | null | undefined;
}>, {
    cantidad: number;
    descripcion: string;
    workOrderId: number;
    conIva: boolean;
    metodoPago: "transferencia" | "efectivo" | "otro" | "tarjeta_debito" | "tarjeta_credito" | "cheque";
    tipoDocumento: "factura" | "boleta" | "recibo" | "nota_credito" | "otro";
    operationKey: string;
    costoUnitario: number;
    ventaUnitario: number;
    fechaEmision?: string | undefined;
    proveedorNombre?: string | null | undefined;
    folio?: string | null | undefined;
    requestId?: number | null | undefined;
    detalle?: string | null | undefined;
}, {
    cantidad: number;
    descripcion: string;
    workOrderId: number;
    operationKey: string;
    costoUnitario: number;
    ventaUnitario: number;
    fechaEmision?: string | undefined;
    proveedorNombre?: string | null | undefined;
    conIva?: boolean | undefined;
    metodoPago?: "transferencia" | "efectivo" | "otro" | "tarjeta_debito" | "tarjeta_credito" | "cheque" | undefined;
    tipoDocumento?: "factura" | "boleta" | "recibo" | "nota_credito" | "otro" | undefined;
    folio?: string | null | undefined;
    requestId?: number | null | undefined;
    detalle?: string | null | undefined;
}>;
export declare const expressPurchaseLineSchema: z.ZodEffects<z.ZodObject<{
    cantidad: z.ZodNumber;
    descripcion: z.ZodString;
    requestId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    costoUnitario: z.ZodNumber;
    ventaUnitario: z.ZodNumber;
    detalle: z.ZodOptional<z.ZodNullable<z.ZodString>>;
} & {
    workOrderId: z.ZodOptional<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    cantidad: number;
    descripcion: string;
    costoUnitario: number;
    ventaUnitario: number;
    workOrderId?: number | undefined;
    requestId?: number | null | undefined;
    detalle?: string | null | undefined;
}, {
    cantidad: number;
    descripcion: string;
    costoUnitario: number;
    ventaUnitario: number;
    workOrderId?: number | undefined;
    requestId?: number | null | undefined;
    detalle?: string | null | undefined;
}>, {
    cantidad: number;
    descripcion: string;
    costoUnitario: number;
    ventaUnitario: number;
    workOrderId?: number | undefined;
    requestId?: number | null | undefined;
    detalle?: string | null | undefined;
}, {
    cantidad: number;
    descripcion: string;
    costoUnitario: number;
    ventaUnitario: number;
    workOrderId?: number | undefined;
    requestId?: number | null | undefined;
    detalle?: string | null | undefined;
}>;
export declare const createExpressPurchaseBatchSchema: z.ZodEffects<z.ZodObject<Omit<{
    operationKey: z.ZodString;
    workOrderId: z.ZodNumber;
    requestId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    descripcion: z.ZodString;
    cantidad: z.ZodNumber;
    costoUnitario: z.ZodNumber;
    ventaUnitario: z.ZodNumber;
    conIva: z.ZodDefault<z.ZodBoolean>;
    metodoPago: z.ZodDefault<z.ZodEnum<["efectivo", "transferencia", "tarjeta_debito", "tarjeta_credito", "cheque", "otro"]>>;
    proveedorNombre: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    tipoDocumento: z.ZodDefault<z.ZodEnum<["factura", "boleta", "recibo", "nota_credito", "otro"]>>;
    folio: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    fechaEmision: z.ZodOptional<z.ZodString>;
    detalle: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "cantidad" | "descripcion" | "requestId" | "costoUnitario" | "ventaUnitario"> & {
    items: z.ZodArray<z.ZodEffects<z.ZodObject<{
        cantidad: z.ZodNumber;
        descripcion: z.ZodString;
        requestId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        costoUnitario: z.ZodNumber;
        ventaUnitario: z.ZodNumber;
        detalle: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    } & {
        workOrderId: z.ZodOptional<z.ZodNumber>;
    }, "strict", z.ZodTypeAny, {
        cantidad: number;
        descripcion: string;
        costoUnitario: number;
        ventaUnitario: number;
        workOrderId?: number | undefined;
        requestId?: number | null | undefined;
        detalle?: string | null | undefined;
    }, {
        cantidad: number;
        descripcion: string;
        costoUnitario: number;
        ventaUnitario: number;
        workOrderId?: number | undefined;
        requestId?: number | null | undefined;
        detalle?: string | null | undefined;
    }>, {
        cantidad: number;
        descripcion: string;
        costoUnitario: number;
        ventaUnitario: number;
        workOrderId?: number | undefined;
        requestId?: number | null | undefined;
        detalle?: string | null | undefined;
    }, {
        cantidad: number;
        descripcion: string;
        costoUnitario: number;
        ventaUnitario: number;
        workOrderId?: number | undefined;
        requestId?: number | null | undefined;
        detalle?: string | null | undefined;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    items: {
        cantidad: number;
        descripcion: string;
        costoUnitario: number;
        ventaUnitario: number;
        workOrderId?: number | undefined;
        requestId?: number | null | undefined;
        detalle?: string | null | undefined;
    }[];
    workOrderId: number;
    conIva: boolean;
    metodoPago: "transferencia" | "efectivo" | "otro" | "tarjeta_debito" | "tarjeta_credito" | "cheque";
    tipoDocumento: "factura" | "boleta" | "recibo" | "nota_credito" | "otro";
    operationKey: string;
    fechaEmision?: string | undefined;
    proveedorNombre?: string | null | undefined;
    folio?: string | null | undefined;
    detalle?: string | null | undefined;
}, {
    items: {
        cantidad: number;
        descripcion: string;
        costoUnitario: number;
        ventaUnitario: number;
        workOrderId?: number | undefined;
        requestId?: number | null | undefined;
        detalle?: string | null | undefined;
    }[];
    workOrderId: number;
    operationKey: string;
    fechaEmision?: string | undefined;
    proveedorNombre?: string | null | undefined;
    conIva?: boolean | undefined;
    metodoPago?: "transferencia" | "efectivo" | "otro" | "tarjeta_debito" | "tarjeta_credito" | "cheque" | undefined;
    tipoDocumento?: "factura" | "boleta" | "recibo" | "nota_credito" | "otro" | undefined;
    folio?: string | null | undefined;
    detalle?: string | null | undefined;
}>, {
    items: {
        cantidad: number;
        descripcion: string;
        costoUnitario: number;
        ventaUnitario: number;
        workOrderId?: number | undefined;
        requestId?: number | null | undefined;
        detalle?: string | null | undefined;
    }[];
    workOrderId: number;
    conIva: boolean;
    metodoPago: "transferencia" | "efectivo" | "otro" | "tarjeta_debito" | "tarjeta_credito" | "cheque";
    tipoDocumento: "factura" | "boleta" | "recibo" | "nota_credito" | "otro";
    operationKey: string;
    fechaEmision?: string | undefined;
    proveedorNombre?: string | null | undefined;
    folio?: string | null | undefined;
    detalle?: string | null | undefined;
}, {
    items: {
        cantidad: number;
        descripcion: string;
        costoUnitario: number;
        ventaUnitario: number;
        workOrderId?: number | undefined;
        requestId?: number | null | undefined;
        detalle?: string | null | undefined;
    }[];
    workOrderId: number;
    operationKey: string;
    fechaEmision?: string | undefined;
    proveedorNombre?: string | null | undefined;
    conIva?: boolean | undefined;
    metodoPago?: "transferencia" | "efectivo" | "otro" | "tarjeta_debito" | "tarjeta_credito" | "cheque" | undefined;
    tipoDocumento?: "factura" | "boleta" | "recibo" | "nota_credito" | "otro" | undefined;
    folio?: string | null | undefined;
    detalle?: string | null | undefined;
}>;
/** Keep existing single-product callers compatible while the UI submits a complete receipt. */
export declare const createExpressPurchaseSubmissionSchema: z.ZodUnion<[z.ZodEffects<z.ZodObject<Omit<{
    operationKey: z.ZodString;
    workOrderId: z.ZodNumber;
    requestId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    descripcion: z.ZodString;
    cantidad: z.ZodNumber;
    costoUnitario: z.ZodNumber;
    ventaUnitario: z.ZodNumber;
    conIva: z.ZodDefault<z.ZodBoolean>;
    metodoPago: z.ZodDefault<z.ZodEnum<["efectivo", "transferencia", "tarjeta_debito", "tarjeta_credito", "cheque", "otro"]>>;
    proveedorNombre: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    tipoDocumento: z.ZodDefault<z.ZodEnum<["factura", "boleta", "recibo", "nota_credito", "otro"]>>;
    folio: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    fechaEmision: z.ZodOptional<z.ZodString>;
    detalle: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "cantidad" | "descripcion" | "requestId" | "costoUnitario" | "ventaUnitario"> & {
    items: z.ZodArray<z.ZodEffects<z.ZodObject<{
        cantidad: z.ZodNumber;
        descripcion: z.ZodString;
        requestId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        costoUnitario: z.ZodNumber;
        ventaUnitario: z.ZodNumber;
        detalle: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    } & {
        workOrderId: z.ZodOptional<z.ZodNumber>;
    }, "strict", z.ZodTypeAny, {
        cantidad: number;
        descripcion: string;
        costoUnitario: number;
        ventaUnitario: number;
        workOrderId?: number | undefined;
        requestId?: number | null | undefined;
        detalle?: string | null | undefined;
    }, {
        cantidad: number;
        descripcion: string;
        costoUnitario: number;
        ventaUnitario: number;
        workOrderId?: number | undefined;
        requestId?: number | null | undefined;
        detalle?: string | null | undefined;
    }>, {
        cantidad: number;
        descripcion: string;
        costoUnitario: number;
        ventaUnitario: number;
        workOrderId?: number | undefined;
        requestId?: number | null | undefined;
        detalle?: string | null | undefined;
    }, {
        cantidad: number;
        descripcion: string;
        costoUnitario: number;
        ventaUnitario: number;
        workOrderId?: number | undefined;
        requestId?: number | null | undefined;
        detalle?: string | null | undefined;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    items: {
        cantidad: number;
        descripcion: string;
        costoUnitario: number;
        ventaUnitario: number;
        workOrderId?: number | undefined;
        requestId?: number | null | undefined;
        detalle?: string | null | undefined;
    }[];
    workOrderId: number;
    conIva: boolean;
    metodoPago: "transferencia" | "efectivo" | "otro" | "tarjeta_debito" | "tarjeta_credito" | "cheque";
    tipoDocumento: "factura" | "boleta" | "recibo" | "nota_credito" | "otro";
    operationKey: string;
    fechaEmision?: string | undefined;
    proveedorNombre?: string | null | undefined;
    folio?: string | null | undefined;
    detalle?: string | null | undefined;
}, {
    items: {
        cantidad: number;
        descripcion: string;
        costoUnitario: number;
        ventaUnitario: number;
        workOrderId?: number | undefined;
        requestId?: number | null | undefined;
        detalle?: string | null | undefined;
    }[];
    workOrderId: number;
    operationKey: string;
    fechaEmision?: string | undefined;
    proveedorNombre?: string | null | undefined;
    conIva?: boolean | undefined;
    metodoPago?: "transferencia" | "efectivo" | "otro" | "tarjeta_debito" | "tarjeta_credito" | "cheque" | undefined;
    tipoDocumento?: "factura" | "boleta" | "recibo" | "nota_credito" | "otro" | undefined;
    folio?: string | null | undefined;
    detalle?: string | null | undefined;
}>, {
    items: {
        cantidad: number;
        descripcion: string;
        costoUnitario: number;
        ventaUnitario: number;
        workOrderId?: number | undefined;
        requestId?: number | null | undefined;
        detalle?: string | null | undefined;
    }[];
    workOrderId: number;
    conIva: boolean;
    metodoPago: "transferencia" | "efectivo" | "otro" | "tarjeta_debito" | "tarjeta_credito" | "cheque";
    tipoDocumento: "factura" | "boleta" | "recibo" | "nota_credito" | "otro";
    operationKey: string;
    fechaEmision?: string | undefined;
    proveedorNombre?: string | null | undefined;
    folio?: string | null | undefined;
    detalle?: string | null | undefined;
}, {
    items: {
        cantidad: number;
        descripcion: string;
        costoUnitario: number;
        ventaUnitario: number;
        workOrderId?: number | undefined;
        requestId?: number | null | undefined;
        detalle?: string | null | undefined;
    }[];
    workOrderId: number;
    operationKey: string;
    fechaEmision?: string | undefined;
    proveedorNombre?: string | null | undefined;
    conIva?: boolean | undefined;
    metodoPago?: "transferencia" | "efectivo" | "otro" | "tarjeta_debito" | "tarjeta_credito" | "cheque" | undefined;
    tipoDocumento?: "factura" | "boleta" | "recibo" | "nota_credito" | "otro" | undefined;
    folio?: string | null | undefined;
    detalle?: string | null | undefined;
}>, z.ZodEffects<z.ZodObject<{
    operationKey: z.ZodString;
    workOrderId: z.ZodNumber;
    requestId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    descripcion: z.ZodString;
    cantidad: z.ZodNumber;
    costoUnitario: z.ZodNumber;
    ventaUnitario: z.ZodNumber;
    conIva: z.ZodDefault<z.ZodBoolean>;
    metodoPago: z.ZodDefault<z.ZodEnum<["efectivo", "transferencia", "tarjeta_debito", "tarjeta_credito", "cheque", "otro"]>>;
    proveedorNombre: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    tipoDocumento: z.ZodDefault<z.ZodEnum<["factura", "boleta", "recibo", "nota_credito", "otro"]>>;
    folio: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    fechaEmision: z.ZodOptional<z.ZodString>;
    detalle: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    cantidad: number;
    descripcion: string;
    workOrderId: number;
    conIva: boolean;
    metodoPago: "transferencia" | "efectivo" | "otro" | "tarjeta_debito" | "tarjeta_credito" | "cheque";
    tipoDocumento: "factura" | "boleta" | "recibo" | "nota_credito" | "otro";
    operationKey: string;
    costoUnitario: number;
    ventaUnitario: number;
    fechaEmision?: string | undefined;
    proveedorNombre?: string | null | undefined;
    folio?: string | null | undefined;
    requestId?: number | null | undefined;
    detalle?: string | null | undefined;
}, {
    cantidad: number;
    descripcion: string;
    workOrderId: number;
    operationKey: string;
    costoUnitario: number;
    ventaUnitario: number;
    fechaEmision?: string | undefined;
    proveedorNombre?: string | null | undefined;
    conIva?: boolean | undefined;
    metodoPago?: "transferencia" | "efectivo" | "otro" | "tarjeta_debito" | "tarjeta_credito" | "cheque" | undefined;
    tipoDocumento?: "factura" | "boleta" | "recibo" | "nota_credito" | "otro" | undefined;
    folio?: string | null | undefined;
    requestId?: number | null | undefined;
    detalle?: string | null | undefined;
}>, {
    cantidad: number;
    descripcion: string;
    workOrderId: number;
    conIva: boolean;
    metodoPago: "transferencia" | "efectivo" | "otro" | "tarjeta_debito" | "tarjeta_credito" | "cheque";
    tipoDocumento: "factura" | "boleta" | "recibo" | "nota_credito" | "otro";
    operationKey: string;
    costoUnitario: number;
    ventaUnitario: number;
    fechaEmision?: string | undefined;
    proveedorNombre?: string | null | undefined;
    folio?: string | null | undefined;
    requestId?: number | null | undefined;
    detalle?: string | null | undefined;
}, {
    cantidad: number;
    descripcion: string;
    workOrderId: number;
    operationKey: string;
    costoUnitario: number;
    ventaUnitario: number;
    fechaEmision?: string | undefined;
    proveedorNombre?: string | null | undefined;
    conIva?: boolean | undefined;
    metodoPago?: "transferencia" | "efectivo" | "otro" | "tarjeta_debito" | "tarjeta_credito" | "cheque" | undefined;
    tipoDocumento?: "factura" | "boleta" | "recibo" | "nota_credito" | "otro" | undefined;
    folio?: string | null | undefined;
    requestId?: number | null | undefined;
    detalle?: string | null | undefined;
}>]>;
export declare const returnExpressPurchaseSchema: z.ZodObject<{
    motivo: z.ZodString;
    itemIds: z.ZodOptional<z.ZodEffects<z.ZodArray<z.ZodNumber, "many">, number[], number[]>>;
}, "strict", z.ZodTypeAny, {
    motivo: string;
    itemIds?: number[] | undefined;
}, {
    motivo: string;
    itemIds?: number[] | undefined;
}>;
export type ExpressPurchaseLineInput = z.infer<typeof expressPurchaseLineSchema>;
export type CreateExpressPurchaseBatchInput = z.infer<typeof createExpressPurchaseBatchSchema>;
export type CreateExpressPurchaseSubmission = z.infer<typeof createExpressPurchaseSubmissionSchema>;
export type ReturnExpressPurchaseInput = z.infer<typeof returnExpressPurchaseSchema>;
export declare const expressSearchSchema: z.ZodObject<{
    search: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    search?: string | undefined;
}, {
    search?: string | undefined;
}>;
export declare const expressScanResultSchema: z.ZodObject<{
    documento: z.ZodEnum<["etiqueta", "recibo", "desconocido"]>;
    proveedorNombre: z.ZodNullable<z.ZodString>;
    folio: z.ZodNullable<z.ZodString>;
    fechaEmision: z.ZodNullable<z.ZodString>;
    incluyeIva: z.ZodNullable<z.ZodBoolean>;
    items: z.ZodArray<z.ZodObject<{
        descripcion: z.ZodString;
        codigo: z.ZodNullable<z.ZodString>;
        cantidad: z.ZodNullable<z.ZodNumber>;
        costoUnitario: z.ZodNullable<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        cantidad: number | null;
        codigo: string | null;
        descripcion: string;
        costoUnitario: number | null;
    }, {
        cantidad: number | null;
        codigo: string | null;
        descripcion: string;
        costoUnitario: number | null;
    }>, "many">;
    advertencias: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    items: {
        cantidad: number | null;
        codigo: string | null;
        descripcion: string;
        costoUnitario: number | null;
    }[];
    fechaEmision: string | null;
    proveedorNombre: string | null;
    folio: string | null;
    documento: "recibo" | "etiqueta" | "desconocido";
    incluyeIva: boolean | null;
    advertencias: string[];
}, {
    items: {
        cantidad: number | null;
        codigo: string | null;
        descripcion: string;
        costoUnitario: number | null;
    }[];
    fechaEmision: string | null;
    proveedorNombre: string | null;
    folio: string | null;
    documento: "recibo" | "etiqueta" | "desconocido";
    incluyeIva: boolean | null;
    advertencias: string[];
}>;
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
