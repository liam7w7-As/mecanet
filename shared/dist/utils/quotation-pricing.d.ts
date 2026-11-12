export declare const DISCOUNT_TYPES: readonly ["porcentaje", "fijo"];
export type DiscountType = (typeof DISCOUNT_TYPES)[number];
/** IVA aplicado a las cotizaciones. Coincide con el documento impreso. */
export declare const QUOTATION_TAX_RATE = 0.19;
export interface QuotationTaxBreakdown {
    neto: number;
    iva: number;
    total: number;
}
/**
 * Separa el neto de una cotización en neto + IVA.
 *
 * El IVA se redondea al peso igual que en el PDF (`Math.round`), de modo que
 * la vista, los abonos y el documento muestran siempre el mismo monto.
 */
export declare function getQuotationTaxBreakdown(neto: number): QuotationTaxBreakdown;
/** Monto final a cobrar: neto de la cotización más su IVA. */
export declare function getQuotationGrossTotal(neto: number): number;
export interface DiscountInput {
    descuentoTipo?: DiscountType | null;
    descuentoValor?: number | string;
}
export interface QuotationPriceLine extends DiscountInput {
    cantidad: number | string;
    precioUnitario: number | string;
}
export declare function calculateQuotationPricing(items: readonly QuotationPriceLine[], discount?: DiscountInput): {
    lines: {
        bruto: number;
        descuentoMonto: number;
        subtotal: number;
    }[];
    subtotal: number;
    descuentoLineas: number;
    descuentoGeneral: number;
    descuentoTotal: number;
    total: number;
};
