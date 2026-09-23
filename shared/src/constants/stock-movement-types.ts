export const STOCK_MOVEMENT_TYPES = [
  'ingreso',
  'salida',
  'ajuste',
  'traslado_salida',
  'traslado_ingreso',
  'consumo_ot',
] as const;

export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];
