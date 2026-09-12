export const ROLES = ['desarrollador', 'admin', 'jefe', 'vendedor', 'bodeguero'] as const;

export type Role = (typeof ROLES)[number];
