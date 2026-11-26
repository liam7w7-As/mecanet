import { getQuotationGrossTotal, QUOTATION_TAX_RATE } from './quotation-pricing.js';
import { EXPRESS_MARKUP } from '../schemas/purchase-express.schema.js';
export const expressMinimumSale = (cost) => Number.isFinite(cost) && cost > 0 && cost <= 99999999
    ? Math.ceil(cost * (1 + EXPRESS_MARKUP) * 100 - 0.000001) / 100
    : 0;
/** Adapt gross mobile input to existing quotation IVA rounding, without changing that logic. */
export function expressNetSale(gross, quantity = 1) {
    if (!Number.isFinite(gross) ||
        gross <= 0 ||
        gross > 999999999 ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 9999)
        return 0;
    const target = Math.round(gross * quantity * 100) / 100;
    const tax = Math.round((target * QUOTATION_TAX_RATE) / (1 + QUOTATION_TAX_RATE));
    let net = Math.ceil(((target - tax) / quantity) * 100 - 0.000001) / 100;
    for (let attempt = 0; attempt < 200 &&
        getQuotationGrossTotal(Math.round(net * quantity * 100) / 100) + 0.000001 < gross * quantity; attempt += 1) {
        net = Math.round((net + 0.01) * 100) / 100;
    }
    return net;
}
