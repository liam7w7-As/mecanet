import type { WorkOrderStatus } from './work-order-status.js';

export const VALID_WORK_ORDER_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  borrador: ['en_progreso', 'cancelada'],
  en_progreso: ['esperando_repuesto', 'finalizada', 'cancelada'],
  esperando_repuesto: ['en_progreso', 'cancelada'],
  finalizada: ['entregada', 'en_progreso'],
  entregada: [],
  cancelada: [],
};

export const isValidWorkOrderTransition = (
  from: WorkOrderStatus,
  to: WorkOrderStatus,
): boolean => {
  return VALID_WORK_ORDER_TRANSITIONS[from].includes(to);
};
