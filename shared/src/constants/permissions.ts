export const MODULES = ['taller', 'comercial', 'flota', 'admin'] as const;
export type Module = (typeof MODULES)[number];

export const ACTIONS = ['read', 'create', 'update', 'delete', 'export', 'import'] as const;
export type Action = (typeof ACTIONS)[number];

export type Permission = `${Module}:${Action}`;

export const PERMISSIONS: readonly Permission[] = MODULES.flatMap((module) =>
  ACTIONS.map((action) => `${module}:${action}` as Permission),
);
