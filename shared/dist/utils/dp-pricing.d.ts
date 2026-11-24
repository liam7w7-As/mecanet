import type { DpConfiguration, DpQuoteInput, DpWorkQuote } from '../schemas/dp-configuration.schema.js';
export type DpPricingErrorCode = 'STALE_CONFIGURATION' | 'INVALID_SELECTION' | 'MISSING_TARIFF' | 'INVALID_PRICE';
export declare class DpPricingError extends Error {
    readonly code: DpPricingErrorCode;
    constructor(code: DpPricingErrorCode, message: string);
}
/**
 * Quote one D&P work with an immutable-by-copy selection, tariff breakdown and
 * five-step template snapshot. Discounts are explicit per operation, never automatic.
 */
export declare function calculateDpWorkQuote(configuration: DpConfiguration, selection: DpQuoteInput, revision: number): DpWorkQuote;
