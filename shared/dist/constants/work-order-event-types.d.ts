export declare const WORK_ORDER_EVENT_TYPES: readonly ["creacion", "actualizacion", "cambio_estado", "entrega", "garantia_creada", "reingreso_creado", "asignacion_mecanico", "reporte_avance", "solicitud_creada", "solicitud_revisada", "eliminacion"];
export type WorkOrderEventType = (typeof WORK_ORDER_EVENT_TYPES)[number];
