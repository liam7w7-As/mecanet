import { describe, expect, it } from 'vitest';
import { convertQuotationToWorkOrderSchema, createQuotationSchema } from '../quotation.schema.js';
import { createWorkOrderSchema, updateWorkOrderSchema } from '../work-order.schema.js';
describe('Work order reception rules', () => {
    it.each([{}, { vehicleId: null }, { vehicleId: 0 }])('requires a vehicle on creation and conversion: %j', (input) => {
        expect(createWorkOrderSchema.safeParse(input).success).toBe(false);
        expect(convertQuotationToWorkOrderSchema.safeParse(input).success).toBe(false);
    });
    it('permits a parts quotation without a vehicle', () => {
        expect(createQuotationSchema.safeParse({ clientId: 1, vehicleId: null, items: [{ tipoLinea: 'parte', descripcion: 'Filtro' }] }).success).toBe(true);
    });
    it('prevents unlinking the vehicle on an existing OT', () => {
        expect(updateWorkOrderSchema.safeParse({ vehicleId: null }).success).toBe(false);
        expect(updateWorkOrderSchema.safeParse({ vehicleId: 2 }).success).toBe(true);
    });
    it('accepts reception details but refuses browser supplied quotation items', () => {
        expect(convertQuotationToWorkOrderSchema.safeParse({ vehicleId: 1, inspection: { inventario: [] } }).success).toBe(true);
        expect(convertQuotationToWorkOrderSchema.safeParse({ vehicleId: 1, items: [] }).success).toBe(false);
    });
});
