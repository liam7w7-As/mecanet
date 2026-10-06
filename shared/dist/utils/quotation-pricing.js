export const DISCOUNT_TYPES = ['porcentaje', 'fijo'];
const MAX_CENTS = 999_999_999_999;
const cents = (value) => {
    const result = Math.round((value + Number.EPSILON) * 100);
    if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(result) || result > MAX_CENTS) {
        throw new Error('El importe debe ser positivo o cero y estar dentro del límite permitido');
    }
    return result;
};
const discountCents = (base, discount) => {
    const value = Number(discount.descuentoValor ?? 0);
    if (!Number.isFinite(value) || value < 0)
        throw new Error('El descuento no puede ser negativo');
    if (!discount.descuentoTipo) {
        if (value !== 0)
            throw new Error('Seleccione el tipo de descuento');
        return 0;
    }
    if (discount.descuentoTipo === 'porcentaje' && value > 100) {
        throw new Error('El descuento porcentual no puede superar el 100%');
    }
    const amount = discount.descuentoTipo === 'porcentaje' ? Math.round(base * value / 100) : cents(value);
    if (amount > base)
        throw new Error('El descuento no puede superar el importe al que se aplica');
    return amount;
};
// Work in cents: line discounts first, then the general discount on the remaining amount.
export function calculateQuotationPricing(items, discount = {}) {
    const lines = items.map((item) => {
        const gross = cents(Number(item.cantidad) * Number(item.precioUnitario));
        const reduction = discountCents(gross, item);
        return { bruto: gross / 100, descuentoMonto: reduction / 100, subtotal: (gross - reduction) / 100 };
    });
    const gross = cents(lines.reduce((sum, line) => sum + line.bruto, 0));
    const lineDiscount = cents(lines.reduce((sum, line) => sum + line.descuentoMonto, 0));
    const generalDiscount = discountCents(gross - lineDiscount, discount);
    return {
        lines,
        subtotal: gross / 100,
        descuentoLineas: lineDiscount / 100,
        descuentoGeneral: generalDiscount / 100,
        descuentoTotal: (lineDiscount + generalDiscount) / 100,
        total: (gross - lineDiscount - generalDiscount) / 100,
    };
}
