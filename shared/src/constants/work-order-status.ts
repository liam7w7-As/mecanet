export const WORK_ORDER_STATUS = [
  'borrador',
  'en_progreso',
  'esperando_repuesto',
  'finalizada',
  'entregada',
  'cancelada',
] as const;

export type WorkOrderStatus = (typeof WORK_ORDER_STATUS)[number];
