import type { FleetRequiredDocumentType } from '../constants/fleet.js';
/** Match known names only: complementary insurance and other certificates remain additional. */
export declare const getFleetRequiredDocumentType: (nombre: string) => FleetRequiredDocumentType | null;
export interface FleetRequiredDocumentSummary {
    total: number;
    registered: number;
    complete: number;
    pending: FleetRequiredDocumentType[];
    missing: FleetRequiredDocumentType[];
    missingFiles: FleetRequiredDocumentType[];
    missingExpiryDates: FleetRequiredDocumentType[];
}
interface DocumentRequirement {
    nombre: string;
    tieneArchivo: boolean;
    fechaVencimiento?: string | null;
}
/** Completeness is separate from expiry: missing files/dates must not appear up to date. */
export declare const getFleetRequiredDocumentSummary: (documents: readonly DocumentRequirement[]) => FleetRequiredDocumentSummary;
export {};
