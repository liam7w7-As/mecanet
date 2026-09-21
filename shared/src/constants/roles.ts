export const ROLES = [
  'desarrollador',
  'admin',
  'jefe',
  'mecanico',
  'vendedor',
  'bodeguero',
  'finanzas',
] as const;

export type Role = (typeof ROLES)[number];
