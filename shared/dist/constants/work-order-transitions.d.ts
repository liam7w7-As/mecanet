import type { WorkOrderStatus } from './work-order-status.js';
export declare const VALID_WORK_ORDER_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]>;
export declare const isValidWorkOrderTransition: (from: WorkOrderStatus, to: WorkOrderStatus) => boolean;
