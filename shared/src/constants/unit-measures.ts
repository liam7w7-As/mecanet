export const UNIT_MEASURES = [
  'unidad',
  'litro',
  'mililitro',
  'kilogramo',
  'juego',
  'servicio',
] as const;

export type UnitMeasure = (typeof UNIT_MEASURES)[number];

export const UNIT_MEASURE_LABELS: Record<UnitMeasure, string> = {
  unidad: 'Unidad',
  litro: 'Litro',
  mililitro: 'Mililitro',
  kilogramo: 'Kilogramo',
  juego: 'Juego',
  servicio: 'Servicio',
};
