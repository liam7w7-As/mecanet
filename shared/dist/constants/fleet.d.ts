export declare const FLEET_VEHICLE_STATUSES: readonly ["disponible", "en_mantencion", "fuera_de_servicio"];
export type FleetVehicleStatus = (typeof FLEET_VEHICLE_STATUSES)[number];
export declare const FLEET_DOCUMENT_EXPIRY_FILTERS: readonly ["proximo", "vencido"];
export type FleetDocumentExpiryFilter = (typeof FLEET_DOCUMENT_EXPIRY_FILTERS)[number];
/** Días de anticipación con los que un documento empieza a mostrarse en ámbar. */
export declare const FLEET_EXPIRY_WARNING_DAYS = 30;
/** Días de anticipación con los que un documento pasa a rojo. */
export declare const FLEET_EXPIRY_CRITICAL_DAYS = 7;
export declare const FLEET_DOCUMENT_FILE_MIME_TYPES: readonly ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export type FleetDocumentFileMimeType = (typeof FLEET_DOCUMENT_FILE_MIME_TYPES)[number];
