export const MODULES = ['taller', 'comercial', 'finanzas', 'flota', 'admin'];
export const ACTIONS = ['read', 'create', 'update', 'delete', 'export', 'import'];
export const PERMISSIONS = MODULES.flatMap((modulo) => ACTIONS.map((accion) => ({ modulo, accion })));
