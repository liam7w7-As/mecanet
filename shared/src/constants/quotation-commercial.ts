export const QUOTATION_PAYMENT_METHODS = ['transferencia', 'efectivo', 'efectivo_transferencia', 'a_convenir'] as const;
export type QuotationPaymentMethod = (typeof QUOTATION_PAYMENT_METHODS)[number];
export const QUOTATION_PAYMENT_LABELS: Record<QuotationPaymentMethod, string> = {
  transferencia: 'Transferencia bancaria',
  efectivo: 'Efectivo',
  efectivo_transferencia: 'Efectivo o transferencia',
  a_convenir: 'A convenir',
};

export const QUOTATION_BANK_ACCOUNTS = [
  { banco: 'BCI', cuenta: '89938 640', tipo: 'Cuenta corriente' },
  { banco: 'BANCO DE CHILE', cuenta: '1073164200', tipo: 'Cuenta corriente' },
] as const;
export const QUOTATION_BANK_RECIPIENT = {
  rut: '77.374.788-1',
  empresa: 'UNITHOR SERVICIOS INTEGRALES SpA',
  contacto: 'CONTACTO@UNITHOR.CL',
} as const;
