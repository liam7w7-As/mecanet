export const FLEET_VEHICLE_STATUSES = [
    'disponible',
    'en_mantencion',
    'fuera_de_servicio',
    'dado_de_baja',
];
export const FLEET_DOCUMENT_EXPIRY_FILTERS = ['proximo', 'vencido'];
/** Días de anticipación con los que un documento empieza a mostrarse en ámbar. */
export const FLEET_EXPIRY_WARNING_DAYS = 30;
/** Días de anticipación con los que un documento pasa a rojo. */
export const FLEET_EXPIRY_CRITICAL_DAYS = 7;
export const FLEET_DOCUMENT_FILE_MIME_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
];
/** Fixed reception slots; records and previous files remain in fleet_documents. */
export const FLEET_REQUIRED_DOCUMENTS = [
    { type: 'permiso_circulacion', nombre: 'Permiso de circulación' },
    { type: 'soap', nombre: 'Seguro obligatorio SOAP' },
    { type: 'revision_tecnica', nombre: 'Revisión técnica' },
];
