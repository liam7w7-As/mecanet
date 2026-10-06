export declare const WORK_ORDER_STATUS: readonly ["en_progreso", "esperando_repuesto", "finalizada", "entregada", "cancelada"];
export type WorkOrderStatus = (typeof WORK_ORDER_STATUS)[number];
export declare const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string>;
export declare const getWorkOrderStatusLabel: (status: WorkOrderStatus) => string;
