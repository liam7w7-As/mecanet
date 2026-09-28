import { z } from 'zod';
export declare const notificationSchema: z.ZodObject<{
    id: z.ZodNumber;
    tipo: z.ZodEnum<["solicitud_creada", "solicitud_aprobada", "solicitud_rechazada", "repuesto_por_entregar", "pago_por_verificar", "pago_verificado", "pago_rechazado", "ot_estado_cambiado", "ot_entregada", "mecanico_asignado", "reingreso_creado", "fecha_entrega_vencida", "cotizacion_creada", "cotizacion_convertida"]>;
    nivel: z.ZodEnum<["info", "warning", "critical"]>;
    titulo: z.ZodString;
    mensaje: z.ZodString;
    href: z.ZodString;
    leida: z.ZodBoolean;
    workOrderId: z.ZodNullable<z.ZodNumber>;
    quotationId: z.ZodNullable<z.ZodNumber>;
    paymentId: z.ZodNullable<z.ZodNumber>;
    actor: z.ZodNullable<z.ZodObject<{
        id: z.ZodNumber;
        nombre: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        nombre: string;
        id: number;
    }, {
        nombre: string;
        id: number;
    }>>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    tipo: "reingreso_creado" | "solicitud_creada" | "solicitud_aprobada" | "solicitud_rechazada" | "repuesto_por_entregar" | "pago_por_verificar" | "pago_verificado" | "pago_rechazado" | "ot_estado_cambiado" | "ot_entregada" | "mecanico_asignado" | "fecha_entrega_vencida" | "cotizacion_creada" | "cotizacion_convertida";
    id: number;
    href: string;
    createdAt: string;
    workOrderId: number | null;
    quotationId: number | null;
    nivel: "info" | "warning" | "critical";
    titulo: string;
    mensaje: string;
    leida: boolean;
    paymentId: number | null;
    actor: {
        nombre: string;
        id: number;
    } | null;
}, {
    tipo: "reingreso_creado" | "solicitud_creada" | "solicitud_aprobada" | "solicitud_rechazada" | "repuesto_por_entregar" | "pago_por_verificar" | "pago_verificado" | "pago_rechazado" | "ot_estado_cambiado" | "ot_entregada" | "mecanico_asignado" | "fecha_entrega_vencida" | "cotizacion_creada" | "cotizacion_convertida";
    id: number;
    href: string;
    createdAt: string;
    workOrderId: number | null;
    quotationId: number | null;
    nivel: "info" | "warning" | "critical";
    titulo: string;
    mensaje: string;
    leida: boolean;
    paymentId: number | null;
    actor: {
        nombre: string;
        id: number;
    } | null;
}>;
export declare const notificationListQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
} & {
    soloNoLeidas: z.ZodDefault<z.ZodEffects<z.ZodUnion<[z.ZodBoolean, z.ZodEnum<["true", "false"]>]>, boolean, boolean | "true" | "false">>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    soloNoLeidas: boolean;
}, {
    page?: number | undefined;
    pageSize?: number | undefined;
    soloNoLeidas?: boolean | "true" | "false" | undefined;
}>;
export declare const markNotificationsReadSchema: z.ZodEffects<z.ZodObject<{
    ids: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    todas: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    todas: boolean;
    ids?: number[] | undefined;
}, {
    ids?: number[] | undefined;
    todas?: boolean | undefined;
}>, {
    todas: boolean;
    ids?: number[] | undefined;
}, {
    ids?: number[] | undefined;
    todas?: boolean | undefined;
}>;
export type Notification = z.infer<typeof notificationSchema>;
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
export type MarkNotificationsReadInput = z.infer<typeof markNotificationsReadSchema>;
