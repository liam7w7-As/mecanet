export declare const DISCOUNT_TYPES: readonly ["porcentaje", "fijo"];
export type DiscountType = (typeof DISCOUNT_TYPES)[number];
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
