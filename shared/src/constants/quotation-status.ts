export const QUOTATION_STATUS = [
  'total',
  'parcial',
  'por_verificar',
  'por_pagar',
  'ot_finalizado',
] as const;

export type QuotationStatus = (typeof QUOTATION_STATUS)[number];
