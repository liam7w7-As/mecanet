export const ITEM_OPERATIONAL_STATUS = [
  'pendiente',
  'en_proceso',
  'completado',
  'omitido',
] as const;

export type ItemOperationalStatus = (typeof ITEM_OPERATIONAL_STATUS)[number];
