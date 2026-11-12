import { describe, expect, it } from 'vitest';
import { getFleetRequiredDocumentSummary, getFleetRequiredDocumentType } from '../fleet-documents.js';
describe('Fleet required document classification', () => {
    it.each([
        [' Permiso de circulación ', 'permiso_circulacion'], ['PERMISO CIRCULACION', 'permiso_circulacion'],
        ['SOAP', 'soap'], ['Seguro obligatorio', 'soap'], ['Seguro obligatorio (SOAP)', 'soap'],
        ['Seguro obligatorio de accidentes personales', 'soap'], ['REVISIÓN TÉCNICA', 'revision_tecnica'],
        ['Certificado de revisión técnica', 'revision_tecnica'],
    ])('reuses the registered name %s as %s', (name, type) => {
        expect(getFleetRequiredDocumentType(name)).toBe(type);
    });
    it.each(['Seguro complementario', 'Certificado de emisiones', 'Padrón del vehículo', 'Mantención preventiva', 'Solicitud de revisión técnica', ''])('keeps %s as an additional document', (name) => {
        expect(getFleetRequiredDocumentType(name)).toBeNull();
    });
    it('shows all three missing slots without creating any records', () => {
        expect(getFleetRequiredDocumentSummary([])).toEqual({
            total: 3, registered: 0, complete: 0,
            pending: ['permiso_circulacion', 'soap', 'revision_tecnica'],
            missing: ['permiso_circulacion', 'soap', 'revision_tecnica'], missingFiles: [], missingExpiryDates: [],
        });
    });
    it('does not mistake metadata or additional files for a complete required document', () => {
        expect(getFleetRequiredDocumentSummary([
            { nombre: 'Seguro obligatorio', tieneArchivo: false, fechaVencimiento: '2027-03-31' },
            { nombre: 'Revisión técnica', tieneArchivo: true, fechaVencimiento: null },
            { nombre: 'Mantención preventiva', tieneArchivo: true, fechaVencimiento: '2027-03-31' },
        ])).toMatchObject({ total: 3, registered: 2, complete: 0,
            missing: ['permiso_circulacion'], missingFiles: ['soap'], missingExpiryDates: ['revision_tecnica'],
            pending: ['permiso_circulacion', 'soap', 'revision_tecnica'] });
    });
    it('counts slots once while preserving duplicate registrations', () => {
        const documents = [
            { nombre: 'Permiso de circulación', tieneArchivo: true, fechaVencimiento: '2027-03-31' },
            { nombre: 'SOAP', tieneArchivo: true, fechaVencimiento: null },
            { nombre: 'Seguro obligatorio', tieneArchivo: false, fechaVencimiento: '2027-03-31' },
            { nombre: 'Revisión técnica', tieneArchivo: true, fechaVencimiento: '2027-03-31' },
        ];
        const before = JSON.stringify(documents);
        expect(getFleetRequiredDocumentSummary(documents)).toMatchObject({ registered: 3, complete: 2, pending: ['soap'] });
        expect(JSON.stringify(documents)).toBe(before);
        documents.push({ nombre: 'Seguro obligatorio SOAP', tieneArchivo: true, fechaVencimiento: '2027-03-31' });
        expect(getFleetRequiredDocumentSummary(documents)).toMatchObject({ registered: 3, complete: 3, pending: [] });
    });
});
