export const FLEET_VEHICLE_STATUSES = [
  'disponible',
  'en_mantencion',
  'fuera_de_servicio',
  'dado_de_baja',
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

/** Fixed reception slots; records and previous files remain in fleet_documents. */
export const FLEET_REQUIRED_DOCUMENTS = [
  { type: 'permiso_circulacion', nombre: 'Permiso de circulación' },
  { type: 'soap', nombre: 'Seguro obligatorio SOAP' },
  { type: 'revision_tecnica', nombre: 'Revisión técnica' },
] as const;

export type FleetRequiredDocumentType = (typeof FLEET_REQUIRED_DOCUMENTS)[number]['type'];
