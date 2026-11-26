import { describe, expect, it } from 'vitest';
import { expressMinimumSale, expressNetSale } from '../../utils/purchase-express.js';
import { getQuotationGrossTotal } from '../../utils/quotation-pricing.js';
import { createExpressPurchaseBatchSchema, createExpressPurchaseSchema, createExpressPurchaseSubmissionSchema, returnExpressPurchaseSchema } from '../purchase-express.schema.js';
const draft = () => ({
    operationKey: '12345678-1234-4234-8234-123456789abc',
    workOrderId: 3,
    descripcion: 'Filtro de aceite',
    cantidad: 2,
    costoUnitario: 11900,
    ventaUnitario: 14875,
});
describe('Compras express con varios productos', () => {
    const batch = () => {
        const { operationKey, workOrderId, ...line } = draft();
        return { operationKey, workOrderId, items: [line, { ...line, descripcion: 'Ampolleta', workOrderId: 9 }] };
    };
    it('hereda la OT inicial y permite otra OT por producto', () => {
        const parsed = createExpressPurchaseBatchSchema.parse(batch());
        expect(parsed.items[0].workOrderId).toBeUndefined();
        expect(parsed.items[1].workOrderId).toBe(9);
        expect(parsed.workOrderId).toBe(3);
        expect(createExpressPurchaseSubmissionSchema.safeParse(draft()).success).toBe(true);
    });
    it('valida el margen de cada producto, sin compensarlo con el margen de otro', () => {
        const data = batch();
        data.items[1].ventaUnitario = 14874.99;
        const result = createExpressPurchaseBatchSchema.safeParse(data);
        expect(result.success).toBe(false);
        if (!result.success)
            expect(result.error.issues[0].path).toEqual(['items', 1, 'ventaUnitario']);
    });
    it('rechaza listas vacías, repetición de solicitudes y totales acumulados excesivos', () => {
        expect(createExpressPurchaseBatchSchema.safeParse({ ...batch(), items: [] }).success).toBe(false);
        expect(createExpressPurchaseBatchSchema.safeParse({ ...batch(), items: batch().items.map((line) => ({ ...line, requestId: 8 })) }).success).toBe(false);
        expect(createExpressPurchaseBatchSchema.safeParse({ ...batch(), items: batch().items.map((line) => ({ ...line, cantidad: 9999, costoUnitario: 60000, ventaUnitario: 75000 })) }).success).toBe(false);
    });
    it('no degrada una lista inválida a una compra de un solo producto', () => {
        expect(createExpressPurchaseSubmissionSchema.safeParse({ ...draft(), items: [] }).success).toBe(false);
    });
    it('permite seleccionar productos para devolver e impide selecciones vacías o repetidas', () => {
        expect(returnExpressPurchaseSchema.parse({ motivo: 'No se usó', itemIds: [2, 3] }).itemIds).toEqual([2, 3]);
        expect(returnExpressPurchaseSchema.safeParse({ motivo: 'No se usó', itemIds: [] }).success).toBe(false);
        expect(returnExpressPurchaseSchema.safeParse({ motivo: 'No se usó', itemIds: [2, 2] }).success).toBe(false);
    });
});
describe('Compras express: precios y validaciones', () => {
    it('acepta captura manual sin inventar datos bancarios ni comprobantes', () => {
        const parsed = createExpressPurchaseSchema.parse(draft());
        expect(parsed.metodoPago).toBe('efectivo');
        expect(parsed.proveedorNombre).toBeUndefined();
    });
    it.each([0, -1, NaN, Infinity])('rechaza costo inválido %s', (cost) => {
        expect(createExpressPurchaseSchema.safeParse({ ...draft(), costoUnitario: cost }).success).toBe(false);
    });
    it('impide venta inferior al 125%, incluso por un centavo', () => {
        expect(createExpressPurchaseSchema.safeParse({ ...draft(), ventaUnitario: 14874.99 }).success).toBe(false);
        expect(createExpressPurchaseSchema.safeParse({ ...draft(), ventaUnitario: 14875 }).success).toBe(true);
    });
    it('no admite nota de crédito ni fecha futura', () => {
        expect(createExpressPurchaseSchema.safeParse({ ...draft(), tipoDocumento: 'nota_credito' }).success).toBe(false);
        expect(createExpressPurchaseSchema.safeParse({ ...draft(), fechaEmision: '2999-01-01' }).success).toBe(false);
    });
    it.each([
        [11900, 1],
        [10000, 2],
        [14.99, 3],
        [0.01, 1],
        [14990, 9],
    ])('preserva el mínimo al convertir %s x %s al IVA de cotización', (cost, quantity) => {
        const minimum = expressMinimumSale(cost);
        const net = expressNetSale(minimum, quantity);
        expect(getQuotationGrossTotal(Math.round(net * quantity * 100) / 100)).toBeGreaterThanOrEqual(minimum * quantity - 0.000001);
        expect(minimum).toBeGreaterThanOrEqual(cost * 1.25 - 0.000001);
    });
    it('separa exactamente un precio pagado con IVA cuando coincide con el neto', () => {
        expect(expressNetSale(14875, 2)).toBe(12500);
        expect(getQuotationGrossTotal(expressNetSale(12500))).toBe(12500);
    });
    it.each([Infinity, NaN, 1e40, -1])('keeps previews safe for an invalid or oversized amount %s', (value) => {
        expect(expressNetSale(value)).toBe(0);
        expect(expressMinimumSale(value)).toBe(0);
    });
});
