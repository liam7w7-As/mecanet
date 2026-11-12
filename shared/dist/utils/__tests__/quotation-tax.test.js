import { describe, expect, it } from 'vitest';
import { getQuotationGrossTotal, getQuotationTaxBreakdown } from '../quotation-pricing.js';
describe('IVA de cotizaciones', () => {
    it('agrega el 19% al neto redondeando al peso', () => {
        expect(getQuotationTaxBreakdown(100000)).toEqual({
            neto: 100000,
            iva: 19000,
            total: 119000,
        });
    });
    it('redondea el IVA igual que el documento PDF', () => {
        expect(getQuotationTaxBreakdown(44099).iva).toBe(8379);
        expect(getQuotationGrossTotal(44099)).toBe(52478);
    });
    it('no deja residuos decimales al sumar el IVA que impidan cerrar un pago', () => {
        expect(getQuotationTaxBreakdown(14.99)).toEqual({ neto: 14.99, iva: 3, total: 17.99 });
    });
    it('mantiene en cero los montos vacíos o inválidos', () => {
        expect(getQuotationTaxBreakdown(0)).toEqual({ neto: 0, iva: 0, total: 0 });
        expect(getQuotationTaxBreakdown(Number.NaN)).toEqual({ neto: 0, iva: 0, total: 0 });
        expect(getQuotationTaxBreakdown(-500)).toEqual({ neto: 0, iva: 0, total: 0 });
    });
});
