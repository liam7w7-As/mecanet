import { z } from 'zod';
export declare const quotationItemInputSchema: z.ZodObject<{
    catalogItemId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    descripcion: z.ZodString;
    cantidad: z.ZodDefault<z.ZodNumber>;
    precioUnitario: z.ZodDefault<z.ZodNumber>;
    estadoOperativo: z.ZodDefault<z.ZodEnum<["pendiente", "en_proceso", "completado", "omitido"]>>;
    notasOperativas: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
}, "strip", z.ZodTypeAny, {
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    estadoOperativo: "pendiente" | "en_proceso" | "completado" | "omitido";
    catalogItemId?: number | null | undefined;
    notasOperativas?: string | null | undefined;
}, {
    descripcion: string;
    catalogItemId?: number | null | undefined;
    cantidad?: number | undefined;
    precioUnitario?: number | undefined;
    estadoOperativo?: "pendiente" | "en_proceso" | "completado" | "omitido" | undefined;
    notasOperativas?: string | null | undefined;
}>;
export declare const createQuotationSchema: z.ZodEffects<z.ZodObject<{
    workOrderId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    clientId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    vehicleId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    notas: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    items: z.ZodDefault<z.ZodArray<z.ZodObject<{
        catalogItemId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        descripcion: z.ZodString;
        cantidad: z.ZodDefault<z.ZodNumber>;
        precioUnitario: z.ZodDefault<z.ZodNumber>;
        estadoOperativo: z.ZodDefault<z.ZodEnum<["pendiente", "en_proceso", "completado", "omitido"]>>;
        notasOperativas: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    }, "strip", z.ZodTypeAny, {
        descripcion: string;
        cantidad: number;
        precioUnitario: number;
        estadoOperativo: "pendiente" | "en_proceso" | "completado" | "omitido";
        catalogItemId?: number | null | undefined;
        notasOperativas?: string | null | undefined;
    }, {
        descripcion: string;
        catalogItemId?: number | null | undefined;
        cantidad?: number | undefined;
        precioUnitario?: number | undefined;
        estadoOperativo?: "pendiente" | "en_proceso" | "completado" | "omitido" | undefined;
        notasOperativas?: string | null | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    items: {
        descripcion: string;
        cantidad: number;
        precioUnitario: number;
        estadoOperativo: "pendiente" | "en_proceso" | "completado" | "omitido";
        catalogItemId?: number | null | undefined;
        notasOperativas?: string | null | undefined;
    }[];
    notas?: string | null | undefined;
    clientId?: number | null | undefined;
    vehicleId?: number | null | undefined;
    workOrderId?: number | null | undefined;
}, {
    notas?: string | null | undefined;
    clientId?: number | null | undefined;
    vehicleId?: number | null | undefined;
    items?: {
        descripcion: string;
        catalogItemId?: number | null | undefined;
        cantidad?: number | undefined;
        precioUnitario?: number | undefined;
        estadoOperativo?: "pendiente" | "en_proceso" | "completado" | "omitido" | undefined;
        notasOperativas?: string | null | undefined;
    }[] | undefined;
    workOrderId?: number | null | undefined;
}>, {
    items: {
        descripcion: string;
        cantidad: number;
        precioUnitario: number;
        estadoOperativo: "pendiente" | "en_proceso" | "completado" | "omitido";
        catalogItemId?: number | null | undefined;
        notasOperativas?: string | null | undefined;
    }[];
    notas?: string | null | undefined;
    clientId?: number | null | undefined;
    vehicleId?: number | null | undefined;
    workOrderId?: number | null | undefined;
}, {
    notas?: string | null | undefined;
    clientId?: number | null | undefined;
    vehicleId?: number | null | undefined;
    items?: {
        descripcion: string;
        catalogItemId?: number | null | undefined;
        cantidad?: number | undefined;
        precioUnitario?: number | undefined;
        estadoOperativo?: "pendiente" | "en_proceso" | "completado" | "omitido" | undefined;
        notasOperativas?: string | null | undefined;
    }[] | undefined;
    workOrderId?: number | null | undefined;
}>;
export declare const updateQuotationSchema: z.ZodEffects<z.ZodObject<{
    notas: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    items: z.ZodOptional<z.ZodArray<z.ZodObject<{
        catalogItemId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        descripcion: z.ZodString;
        cantidad: z.ZodDefault<z.ZodNumber>;
        precioUnitario: z.ZodDefault<z.ZodNumber>;
        estadoOperativo: z.ZodDefault<z.ZodEnum<["pendiente", "en_proceso", "completado", "omitido"]>>;
        notasOperativas: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    }, "strip", z.ZodTypeAny, {
        descripcion: string;
        cantidad: number;
        precioUnitario: number;
        estadoOperativo: "pendiente" | "en_proceso" | "completado" | "omitido";
        catalogItemId?: number | null | undefined;
        notasOperativas?: string | null | undefined;
    }, {
        descripcion: string;
        catalogItemId?: number | null | undefined;
        cantidad?: number | undefined;
        precioUnitario?: number | undefined;
        estadoOperativo?: "pendiente" | "en_proceso" | "completado" | "omitido" | undefined;
        notasOperativas?: string | null | undefined;
    }>, "many">>;
    estadoPago: z.ZodOptional<z.ZodEnum<["total", "parcial", "por_verificar", "por_pagar", "ot_finalizado"]>>;
}, "strip", z.ZodTypeAny, {
    notas?: string | null | undefined;
    estadoPago?: "total" | "parcial" | "por_verificar" | "por_pagar" | "ot_finalizado" | undefined;
    items?: {
        descripcion: string;
        cantidad: number;
        precioUnitario: number;
        estadoOperativo: "pendiente" | "en_proceso" | "completado" | "omitido";
        catalogItemId?: number | null | undefined;
        notasOperativas?: string | null | undefined;
    }[] | undefined;
}, {
    notas?: string | null | undefined;
    estadoPago?: "total" | "parcial" | "por_verificar" | "por_pagar" | "ot_finalizado" | undefined;
    items?: {
        descripcion: string;
        catalogItemId?: number | null | undefined;
        cantidad?: number | undefined;
        precioUnitario?: number | undefined;
        estadoOperativo?: "pendiente" | "en_proceso" | "completado" | "omitido" | undefined;
        notasOperativas?: string | null | undefined;
    }[] | undefined;
}>, {
    notas?: string | null | undefined;
    estadoPago?: "total" | "parcial" | "por_verificar" | "por_pagar" | "ot_finalizado" | undefined;
    items?: {
        descripcion: string;
        cantidad: number;
        precioUnitario: number;
        estadoOperativo: "pendiente" | "en_proceso" | "completado" | "omitido";
        catalogItemId?: number | null | undefined;
        notasOperativas?: string | null | undefined;
    }[] | undefined;
}, {
    notas?: string | null | undefined;
    estadoPago?: "total" | "parcial" | "por_verificar" | "por_pagar" | "ot_finalizado" | undefined;
    items?: {
        descripcion: string;
        catalogItemId?: number | null | undefined;
        cantidad?: number | undefined;
        precioUnitario?: number | undefined;
        estadoOperativo?: "pendiente" | "en_proceso" | "completado" | "omitido" | undefined;
        notasOperativas?: string | null | undefined;
    }[] | undefined;
}>;
export declare const quotationQuerySchema: z.ZodEffects<z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
} & {
    search: z.ZodOptional<z.ZodString>;
    estadoPago: z.ZodOptional<z.ZodEnum<["total", "parcial", "por_verificar", "por_pagar", "ot_finalizado"]>>;
    clientId: z.ZodOptional<z.ZodNumber>;
    vehicleId: z.ZodOptional<z.ZodNumber>;
    workOrderId: z.ZodOptional<z.ZodNumber>;
    fechaDesde: z.ZodOptional<z.ZodString>;
    fechaHasta: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    search?: string | undefined;
    estadoPago?: "total" | "parcial" | "por_verificar" | "por_pagar" | "ot_finalizado" | undefined;
    clientId?: number | undefined;
    vehicleId?: number | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    workOrderId?: number | undefined;
}, {
    page?: number | undefined;
    pageSize?: number | undefined;
    search?: string | undefined;
    estadoPago?: "total" | "parcial" | "por_verificar" | "por_pagar" | "ot_finalizado" | undefined;
    clientId?: number | undefined;
    vehicleId?: number | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    workOrderId?: number | undefined;
}>, {
    page: number;
    pageSize: number;
    search?: string | undefined;
    estadoPago?: "total" | "parcial" | "por_verificar" | "por_pagar" | "ot_finalizado" | undefined;
    clientId?: number | undefined;
    vehicleId?: number | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    workOrderId?: number | undefined;
}, {
    page?: number | undefined;
    pageSize?: number | undefined;
    search?: string | undefined;
    estadoPago?: "total" | "parcial" | "por_verificar" | "por_pagar" | "ot_finalizado" | undefined;
    clientId?: number | undefined;
    vehicleId?: number | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    workOrderId?: number | undefined;
}>;
export declare const convertQuotationToWorkOrderSchema: z.ZodObject<{
    kilometrajeIngreso: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    fechaIngreso: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    fechaEntrega: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    descripcion: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
}, "strip", z.ZodTypeAny, {
    fechaIngreso?: string | null | undefined;
    descripcion?: string | null | undefined;
    kilometrajeIngreso?: number | null | undefined;
    fechaEntrega?: string | null | undefined;
}, {
    fechaIngreso?: string | null | undefined;
    descripcion?: string | null | undefined;
    kilometrajeIngreso?: number | null | undefined;
    fechaEntrega?: string | null | undefined;
}>;
export type QuotationItemInput = z.infer<typeof quotationItemInputSchema>;
export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;
export type UpdateQuotationInput = z.infer<typeof updateQuotationSchema>;
export type QuotationQueryInput = z.infer<typeof quotationQuerySchema>;
export type ConvertQuotationInput = z.infer<typeof convertQuotationToWorkOrderSchema>;
