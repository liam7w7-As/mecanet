import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { convertQuotationToWorkOrderSchema } from '../quotation.schema.js';
import { createWorkOrderSchema, updateWorkOrderSchema, workOrderItemInputSchema } from '../work-order.schema.js';
describe('Work order discount inputs', () => {
    it('keeps creation and line schemas extendable and preserves submitted discounts', () => {
        expect(createWorkOrderSchema).toBeInstanceOf(z.ZodObject);
        expect(workOrderItemInputSchema).toBeInstanceOf(z.ZodObject);
        const input = {
            vehicleId: 1, descuentoTipo: 'porcentaje', descuentoValor: '10',
            items: [{ descripcion: 'Servicio', precioUnitario: 100, descuentoTipo: 'fijo', descuentoValor: '5', assignedUserId: 2 }],
        };
        expect(createWorkOrderSchema.parse(input)).toMatchObject({
            descuentoTipo: 'porcentaje', descuentoValor: 10,
            items: [{ descuentoTipo: 'fijo', descuentoValor: 5, assignedUserId: 2 }],
        });
        expect(workOrderItemInputSchema.extend({ extra: z.boolean() }).parse({ ...input.items[0], extra: true }).extra).toBe(true);
    });
    it('does not default omitted discounts during operational edits', () => {
        const result = updateWorkOrderSchema.parse({ items: [{ id: 1, descripcion: 'Servicio', precioUnitario: 100 }] });
        expect(result).not.toHaveProperty('descuentoTipo');
        expect(result).not.toHaveProperty('descuentoValor');
        expect(result.items[0]).not.toHaveProperty('descuentoTipo');
        expect(result.items[0]).not.toHaveProperty('descuentoValor');
        expect(updateWorkOrderSchema.parse({ descuentoTipo: null, descuentoValor: 0 })).toEqual({ descuentoTipo: null, descuentoValor: 0 });
    });
    it.each([-1, Infinity, NaN, 0.001, 10000000000])('rejects invalid discount values at either level: %s', (descuentoValor) => {
        expect(createWorkOrderSchema.safeParse({ vehicleId: 1, descuentoValor }).success).toBe(false);
        expect(updateWorkOrderSchema.safeParse({ descuentoValor }).success).toBe(false);
        expect(workOrderItemInputSchema.safeParse({ descripcion: 'Servicio', descuentoValor }).success).toBe(false);
    });
    it.each([{ descuentoTipo: 'fijo' }, { descuentoValor: 0 }, { items: [] }])('rejects financial overrides during conversion: %j', (extra) => {
        expect(convertQuotationToWorkOrderSchema.safeParse({ vehicleId: 1, ...extra }).success).toBe(false);
    });
    it('accepts reception and assignments without client-side prices or discounts', () => {
        expect(convertQuotationToWorkOrderSchema.parse({ vehicleId: 1, itemAssignments: [{ quotationItemId: 1, assignedUserId: 2 }] })).toMatchObject({ vehicleId: 1 });
    });
});
