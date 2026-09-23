export declare const MODULES: readonly ["taller", "comercial", "finanzas", "flota", "almacen", "admin"];
export type Module = (typeof MODULES)[number];
export declare const ACTIONS: readonly ["read", "create", "update", "delete", "export", "import"];
export type Action = (typeof ACTIONS)[number];
export interface PermissionDefinition {
    modulo: Module;
    accion: Action;
}
export type Permission = `${Module}:${Action}`;
export declare const PERMISSIONS: readonly PermissionDefinition[];
