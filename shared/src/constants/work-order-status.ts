export const WORK_ORDER_STATUS = [
  'en_progreso',
  'esperando_repuesto',
  'finalizada',
  'entregada',
  'cancelada',
] as const;

export type WorkOrderStatus = (typeof WORK_ORDER_STATUS)[number];

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  en_progreso: 'Iniciada',
  esperando_repuesto: 'Esperando repuesto',
  finalizada: 'Finalizada',
  entregada: 'Entregada',
  cancelada: 'Cancelada',
};

export const getWorkOrderStatusLabel = (status: WorkOrderStatus): string =>
  WORK_ORDER_STATUS_LABELS[status];
