export const FLEET_VEHICLE_STATUSES = [
  'disponible',
  'en_mantencion',
  'fuera_de_servicio',
] as const;

export type FleetVehicleStatus = (typeof FLEET_VEHICLE_STATUSES)[number];

export const FLEET_DOCUMENT_EXPIRY_FILTERS = ['proximo', 'vencido'] as const;

export type FleetDocumentExpiryFilter = (typeof FLEET_DOCUMENT_EXPIRY_FILTERS)[number];

/** Días de anticipación con los que un documento empieza a mostrarse en ámbar. */
export const FLEET_EXPIRY_WARNING_DAYS = 30;

/** Días de anticipación con los que un documento pasa a rojo. */
export const FLEET_EXPIRY_CRITICAL_DAYS = 7;

export const FLEET_DOCUMENT_FILE_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type FleetDocumentFileMimeType = (typeof FLEET_DOCUMENT_FILE_MIME_TYPES)[number];
