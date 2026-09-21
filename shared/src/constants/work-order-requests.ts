export const WORK_ORDER_REQUEST_TYPES = ['repuesto', 'aumento_precio'] as const;
export type WorkOrderRequestType = (typeof WORK_ORDER_REQUEST_TYPES)[number];

export const WORK_ORDER_REQUEST_STATUS = [
  'pendiente',
  'aprobada',
  'rechazada',
  'cancelada',
] as const;
export type WorkOrderRequestStatus = (typeof WORK_ORDER_REQUEST_STATUS)[number];
