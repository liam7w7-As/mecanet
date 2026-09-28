export const NOTIFICATION_TYPES = [
    // Solicitudes de taller
    'solicitud_creada',
    'solicitud_aprobada',
    'solicitud_rechazada',
    'repuesto_por_entregar',
    // Pagos
    'pago_por_verificar',
    'pago_verificado',
    'pago_rechazado',
    // Órdenes de trabajo
    'ot_estado_cambiado',
    'ot_entregada',
    'mecanico_asignado',
    'reingreso_creado',
    'fecha_entrega_vencida',
    // Cotizaciones
    'cotizacion_creada',
    'cotizacion_convertida',
];
export const NOTIFICATION_LEVELS = ['info', 'warning', 'critical'];
/**
 * Destinatarios por tipo cuando el aviso es un broadcast por rol. El backend
 * resuelve los roles a usuarios concretos.
 *
 * Los tipos dirigidos a una sola persona se dejan vacíos a propósito: su
 * destinatario se calcula en el servicio (el solicitante, el mecánico
 * asignado) y se envía con `notifyUsers`. Una lista vacía hace que un
 * `notifyByType` accidental no notifique a nadie, en vez de repartir el aviso
 * entre todo el rol.
 */
export const NOTIFICATION_RECIPIENT_ROLES = {
    solicitud_creada: ['desarrollador', 'admin', 'jefe'],
    // Dirigido al solicitante de la orden.
    solicitud_aprobada: [],
    solicitud_rechazada: [],
    repuesto_por_entregar: ['desarrollador', 'admin', 'bodeguero'],
    pago_por_verificar: ['desarrollador', 'admin', 'finanzas'],
    pago_verificado: ['desarrollador', 'admin', 'vendedor'],
    pago_rechazado: ['desarrollador', 'admin', 'vendedor'],
    ot_estado_cambiado: ['desarrollador', 'admin', 'jefe', 'mecanico', 'vendedor'],
    ot_entregada: ['desarrollador', 'admin', 'jefe', 'vendedor', 'finanzas'],
    // Dirigido al mecánico al que se le asigna la orden.
    mecanico_asignado: [],
    reingreso_creado: ['desarrollador', 'admin', 'jefe', 'mecanico'],
    fecha_entrega_vencida: ['desarrollador', 'admin', 'jefe', 'mecanico', 'vendedor'],
    cotizacion_creada: ['desarrollador', 'admin', 'jefe'],
    cotizacion_convertida: ['desarrollador', 'admin', 'jefe'],
};
