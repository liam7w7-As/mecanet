export const PURCHASE_STATUSES = ['registrada', 'anulada'] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const PURCHASE_PAYMENT_TYPES = ['contado', 'credito'] as const;
export type PurchasePaymentType = (typeof PURCHASE_PAYMENT_TYPES)[number];

export const PURCHASE_DOCUMENT_TYPES = [
  'factura',
  'boleta',
  'recibo',
  'nota_credito',
  'otro',
] as const;
export type PurchaseDocumentType = (typeof PURCHASE_DOCUMENT_TYPES)[number];

export const PURCHASE_VEHICLE_ORIGINS = ['taller', 'flota'] as const;
export type PurchaseVehicleOrigin = (typeof PURCHASE_VEHICLE_ORIGINS)[number];

export const PURCHASE_TAX_RATE = 0.19;

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  registrada: 'Registrada',
  anulada: 'Anulada',
};

export const PURCHASE_PAYMENT_TYPE_LABELS: Record<PurchasePaymentType, string> = {
  contado: 'Contado',
  credito: 'Crédito',
};

export const PURCHASE_DOCUMENT_TYPE_LABELS: Record<PurchaseDocumentType, string> = {
  factura: 'Factura',
  boleta: 'Boleta',
  recibo: 'Recibo',
  nota_credito: 'Nota de crédito',
  otro: 'Otro',
};

export const PURCHASE_VEHICLE_ORIGIN_LABELS: Record<PurchaseVehicleOrigin, string> = {
  taller: 'Taller',
  flota: 'Flota',
};
