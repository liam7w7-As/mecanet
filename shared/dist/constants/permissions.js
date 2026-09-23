export const MODULES = ['taller', 'comercial', 'finanzas', 'flota', 'almacen', 'admin'];
export const ACTIONS = ['read', 'create', 'update', 'delete', 'export', 'import'];
export const PERMISSIONS = MODULES.flatMap((modulo) => ACTIONS.map((accion) => ({ modulo, accion })));
