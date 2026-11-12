import { FLEET_REQUIRED_DOCUMENTS } from '../constants/fleet.js';
const aliases = {
    permiso_circulacion: ['permiso de circulacion', 'permiso circulacion'],
    soap: ['soap', 'seguro obligatorio', 'seguro obligatorio soap', 'seguro obligatorio de accidentes personales'],
    revision_tecnica: ['revision tecnica', 'certificado revision tecnica', 'certificado de revision tecnica'],
};
/** Match known names only: complementary insurance and other certificates remain additional. */
export const getFleetRequiredDocumentType = (nombre) => {
    const normalized = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    return FLEET_REQUIRED_DOCUMENTS.find(({ type }) => aliases[type].includes(normalized))?.type ?? null;
};
/** Completeness is separate from expiry: missing files/dates must not appear up to date. */
export const getFleetRequiredDocumentSummary = (documents) => {
    const result = {
        total: FLEET_REQUIRED_DOCUMENTS.length, registered: 0, complete: 0, pending: [], missing: [], missingFiles: [], missingExpiryDates: [],
    };
    for (const { type } of FLEET_REQUIRED_DOCUMENTS) {
        const matches = documents.filter((document) => getFleetRequiredDocumentType(document.nombre) === type);
        if (matches.some((document) => document.tieneArchivo && document.fechaVencimiento))
            result.complete += 1;
        else
            result.pending.push(type);
        if (!matches.length) {
            result.missing.push(type);
            continue;
        }
        result.registered += 1;
        if (!matches.some((document) => document.tieneArchivo))
            result.missingFiles.push(type);
        if (!matches.some((document) => document.fechaVencimiento))
            result.missingExpiryDates.push(type);
    }
    return result;
};
