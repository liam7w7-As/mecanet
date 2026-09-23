export declare const FUEL_LEVELS: readonly ["vacio", "cuarto", "medio", "tres_cuartos", "lleno"];
export declare const TIRE_CONDITIONS: readonly ["no_revisado", "bueno", "regular", "desgaste_severo", "baja_presion"];
export declare const VEHICLE_INVENTORY_ITEMS: readonly ["botiquin", "chaleco_reflectante", "extintor", "triangulo", "control_remoto", "manual", "radio", "usb", "rueda_repuesto", "llave_ruedas", "gata", "herramientas", "perno_seguridad", "enganche", "antena", "tapa_combustible", "tapas_ruedas", "limpiaparabrisas"];
export declare const WORK_ORDER_INSPECTION_PHOTO_SLOTS: readonly ["frontal", "trasera", "lateral_izquierdo", "lateral_derecho", "frontal_izquierdo", "frontal_derecho", "trasero_izquierdo", "trasero_derecho", "interior"];
export type FuelLevel = (typeof FUEL_LEVELS)[number];
export type TireCondition = (typeof TIRE_CONDITIONS)[number];
export type VehicleInventoryItem = (typeof VEHICLE_INVENTORY_ITEMS)[number];
export type WorkOrderInspectionPhotoSlot = (typeof WORK_ORDER_INSPECTION_PHOTO_SLOTS)[number];
