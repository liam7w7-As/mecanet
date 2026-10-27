export interface PurchasePricingItem {
    cantidad: number;
    precioUnitario: number;
}
export interface PurchasePricingResult {
    neto: number;
    iva: number;
    total: number;
    /** Subtotal de cada ítem, en el mismo orden recibido. */
    subtotales: number[];
}
/**
 * Precios unitarios netos. El IVA se calcula una sola vez sobre el neto total
 * para que el documento calce con la suma de las líneas.
 */
export declare const calculatePurchaseTotals: (items: readonly PurchasePricingItem[], conIva: boolean) => PurchasePricingResult;
/**
 * Un proveedor se considera completo cuando tiene nombre, RUT y al menos un
 * canal de contacto. Mientras no lo esté, queda marcado para que el admin lo
 * complete después.
 */
export declare const isSupplierDataComplete: (supplier: {
    nombre?: string | null;
    rut?: string | null;
    telefono?: string | null;
    email?: string | null;
}) => boolean;
export declare const formatPurchaseCode: (sequence: number) => string;
