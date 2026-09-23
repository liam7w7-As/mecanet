export declare const WORK_ORDER_REQUEST_TYPES: readonly ["repuesto", "aumento_precio"];
export type WorkOrderRequestType = (typeof WORK_ORDER_REQUEST_TYPES)[number];
export declare const WORK_ORDER_REQUEST_STATUS: readonly ["pendiente", "aprobada", "rechazada", "cancelada"];
export type WorkOrderRequestStatus = (typeof WORK_ORDER_REQUEST_STATUS)[number];
