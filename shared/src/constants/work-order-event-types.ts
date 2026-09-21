export const WORK_ORDER_EVENT_TYPES = [
  'creacion',
  'actualizacion',
  'cambio_estado',
  'entrega',
  'garantia_creada',
  'reingreso_creado',
  'eliminacion',
] as const;

export type WorkOrderEventType = (typeof WORK_ORDER_EVENT_TYPES)[number];
