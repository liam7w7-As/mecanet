export const WORK_ORDER_LABOR_SESSION_KINDS = ['cronometro', 'ajuste'] as const;
export type WorkOrderLaborSessionKind = (typeof WORK_ORDER_LABOR_SESSION_KINDS)[number];

export const WORK_ORDER_LABOR_SESSION_STATUS = ['abierta', 'cerrada'] as const;
export type WorkOrderLaborSessionStatus = (typeof WORK_ORDER_LABOR_SESSION_STATUS)[number];

export const WORK_ORDER_LABOR_CLOSE_REASONS = [
  'pausa',
  'completado',
  'omitido',
  'cierre_manual',
  'sistema',
] as const;
export type WorkOrderLaborCloseReason = (typeof WORK_ORDER_LABOR_CLOSE_REASONS)[number];

export const WORK_ORDER_PRICE_SUGGESTION_SCOPES = ['ot', 'catalogo', 'ambos'] as const;
export type WorkOrderPriceSuggestionScope =
  (typeof WORK_ORDER_PRICE_SUGGESTION_SCOPES)[number];

export const WORK_ORDER_PRICE_SUGGESTION_STATUS = [
  'pendiente',
  'aprobada',
  'rechazada',
] as const;
export type WorkOrderPriceSuggestionStatus =
  (typeof WORK_ORDER_PRICE_SUGGESTION_STATUS)[number];

export const WORK_ORDER_OBSERVATION_FILE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;
export type WorkOrderObservationFileMimeType =
  (typeof WORK_ORDER_OBSERVATION_FILE_MIME_TYPES)[number];

export const WORK_ORDER_OBSERVATION_MAX_FILES = 5;
export const WORK_ORDER_OBSERVATION_MAX_FILE_BYTES = 10 * 1024 * 1024;
