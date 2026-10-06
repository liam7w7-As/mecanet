import { describe, expect, it } from 'vitest';
import { calculateQuotationPricing } from '../../utils/quotation-pricing.js';
import { createQuotationSchema, updateQuotationSchema } from '../quotation.schema.js';
describe('Quotation discounts and conditions', () => {
    it('applies line discounts before a general discount, using cents', () => {
        expect(calculateQuotationPricing([
            { cantidad: 2, precioUnitario: 10000, descuentoTipo: 'porcentaje', descuentoValor: 10 },
            { cantidad: 1, precioUnitario: 5000, descuentoTipo: 'fijo', descuentoValor: 1000 },
        ], { descuentoTipo: 'porcentaje', descuentoValor: 5 })).toMatchObject({
            subtotal: 25000, descuentoLineas: 3000, descuentoGeneral: 1100, total: 20900,
            lines: [{ subtotal: 18000 }, { subtotal: 4000 }],
        });
        expect(calculateQuotationPricing([{ cantidad: 3, precioUnitario: 0.1 }]).total).toBe(0.3);
    });
    it('accepts fixed discounts, zero, and 100%, but rejects excessive discounts', () => {
        const lines = [{ cantidad: 1, precioUnitario: 1000 }];
        expect(calculateQuotationPricing(lines, { descuentoTipo: 'fijo', descuentoValor: 200 }).total).toBe(800);
        expect(calculateQuotationPricing(lines, { descuentoTipo: 'porcentaje', descuentoValor: 100 }).total).toBe(0);
        for (const discount of [
            { descuentoTipo: 'fijo', descuentoValor: 1001 },
            { descuentoTipo: 'porcentaje', descuentoValor: 101 },
            { descuentoTipo: 'fijo', descuentoValor: -1 },
            { descuentoTipo: null, descuentoValor: 5 },
        ])
            expect(() => calculateQuotationPricing(lines, discount)).toThrow();
    });
    it('validates conditions and both discount levels without requiring a vehicle', () => {
        const input = { clientId: 1, formaPago: 'transferencia', disponibilidadTrabajo: '  En 3 días  ', validezDias: 10,
            descuentoTipo: 'fijo', descuentoValor: 1000,
            items: [{ descripcion: 'Repuesto', cantidad: 1, precioUnitario: 5000, descuentoTipo: 'porcentaje', descuentoValor: 10 }] };
        expect(createQuotationSchema.parse(input).disponibilidadTrabajo).toBe('En 3 días');
        expect(createQuotationSchema.safeParse({ ...input, descuentoValor: 5000 }).success).toBe(false);
        for (const validezDias of [0, -1, 1.5, 366])
            expect(createQuotationSchema.safeParse({ ...input, validezDias }).success).toBe(false);
        expect(createQuotationSchema.safeParse({ ...input, formaPago: 'tarjeta_credito' }).success).toBe(false);
        expect(updateQuotationSchema.parse({ descuentoTipo: 'fijo', descuentoValor: 100 })).toEqual({ descuentoTipo: 'fijo', descuentoValor: 100 });
    });
});
