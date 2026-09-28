export declare const NOTIFICATION_TYPES: readonly ["solicitud_creada", "solicitud_aprobada", "solicitud_rechazada", "repuesto_por_entregar", "pago_por_verificar", "pago_verificado", "pago_rechazado", "ot_estado_cambiado", "ot_entregada", "mecanico_asignado", "reingreso_creado", "fecha_entrega_vencida", "cotizacion_creada", "cotizacion_convertida"];
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export declare const NOTIFICATION_LEVELS: readonly ["info", "warning", "critical"];
export type NotificationLevel = (typeof NOTIFICATION_LEVELS)[number];
/** Destinatarios por tipo. El backend resuelve los roles a usuarios concretos. */
export declare const NOTIFICATION_RECIPIENT_ROLES: Record<NotificationType, readonly string[]>;
