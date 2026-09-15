export const FUEL_LEVELS = ['vacio', 'cuarto', 'medio', 'tres_cuartos', 'lleno'] as const;

export const TIRE_CONDITIONS = [
  'no_revisado',
  'bueno',
  'regular',
  'desgaste_severo',
  'baja_presion',
] as const;

export const VEHICLE_INVENTORY_ITEMS = [
  'botiquin',
  'chaleco_reflectante',
  'extintor',
  'triangulo',
  'control_remoto',
  'manual',
  'radio',
  'usb',
  'rueda_repuesto',
  'llave_ruedas',
  'gata',
  'herramientas',
  'perno_seguridad',
  'enganche',
  'antena',
  'tapa_combustible',
  'tapas_ruedas',
  'limpiaparabrisas',
] as const;

export type FuelLevel = (typeof FUEL_LEVELS)[number];
export type TireCondition = (typeof TIRE_CONDITIONS)[number];
export type VehicleInventoryItem = (typeof VEHICLE_INVENTORY_ITEMS)[number];
