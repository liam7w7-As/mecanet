import { describe, expect, it } from 'vitest';
import { createPurchaseSchema, registerPurchasePaymentSchema, voidPurchaseSchema } from '../purchase.schema.js';
const today = () => new Date().toISOString().slice(0, 10);
const basePurchase = () => ({
    proveedorNombre: 'Proveedor de prueba',
    origenVehiculo: null,
    vehicleId: null,
    fleetVehicleId: null,
    workOrderId: null,
    conIva: true,
    formaPago: 'contado',
    metodoPago: 'efectivo',
    tipoDocumento: 'factura',
    folio: 'F-1001',
    fechaEmision: today(),
    montoComprobante: 11900,
    numeroOperacion: 'OP-1001',
    banco: 'Banco de Chile',
    observaciones: '  ',
    items: [
        {
            descripcion: '  Filtro de aceite  ',
            cantidad: '2',
            precioUnitario: '5000',
            afectaStock: false,
        },
    ],
});
const issuePaths = (input) => {
    const result = createPurchaseSchema.safeParse(input);
    return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
};
describe('createPurchaseSchema', () => {
    it('normaliza textos y aplica los valores por defecto', () => {
        const parsed = createPurchaseSchema.parse(basePurchase());
        expect(parsed.observaciones).toBeNull();
        expect(parsed.items[0]).toMatchObject({
            descripcion: 'Filtro de aceite',
            cantidad: 2,
            precioUnitario: 5000,
            afectaStock: false,
        });
        expect(parsed.items[0]?.catalogItemId).toBeUndefined();
        expect(parsed.items[0]?.warehouseId).toBeUndefined();
    });
    it('acepta proveedor existente o nombre nuevo, pero no ambos vacíos', () => {
        expect(createPurchaseSchema.safeParse({ ...basePurchase(), proveedorNombre: null, proveedorId: 3 })
            .success).toBe(true);
        expect(createPurchaseSchema.safeParse({ ...basePurchase(), proveedorNombre: '', proveedorId: null })
            .success).toBe(false);
        expect(issuePaths({ ...basePurchase(), proveedorNombre: '' })).toContain('proveedorNombre');
    });
    it('interpreta los booleanos enviados desde multipart', () => {
        const parsed = createPurchaseSchema.parse({
            ...basePurchase(),
            conIva: '0',
            items: [{ ...basePurchase().items[0], afectaStock: 'false' }],
        });
        expect(parsed.conIva).toBe(false);
        expect(parsed.items[0]?.afectaStock).toBe(false);
    });
    it('rechaza fechas de emisión futuras o inválidas', () => {
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        expect(createPurchaseSchema.safeParse({ ...basePurchase(), fechaEmision: tomorrow }).success).toBe(false);
        expect(createPurchaseSchema.safeParse({ ...basePurchase(), fechaEmision: '2026-02-30' }).success).toBe(false);
    });
    it('exige al menos un ítem y datos mínimos por ítem', () => {
        expect(createPurchaseSchema.safeParse({ ...basePurchase(), items: [] }).success).toBe(false);
        expect(createPurchaseSchema.safeParse({
            ...basePurchase(),
            items: [{ ...basePurchase().items[0], descripcion: ' ', cantidad: 0, precioUnitario: -1 }],
        }).success).toBe(false);
    });
    it('impide asociar vehículos de taller y flota a la vez', () => {
        expect(issuePaths({
            ...basePurchase(),
            origenVehiculo: 'taller',
            vehicleId: 1,
            fleetVehicleId: 2,
        })).toContain('fleetVehicleId');
        expect(issuePaths({ ...basePurchase(), origenVehiculo: 'flota', vehicleId: 1 })).toContain('origenVehiculo');
        expect(issuePaths({ ...basePurchase(), origenVehiculo: 'taller', fleetVehicleId: 2 })).toContain('origenVehiculo');
    });
    it('solo permite OT con vehículo de taller', () => {
        expect(issuePaths({
            ...basePurchase(),
            origenVehiculo: 'flota',
            fleetVehicleId: 2,
            workOrderId: 8,
        })).toContain('workOrderId');
        expect(issuePaths({ ...basePurchase(), workOrderId: 8 })).toContain('workOrderId');
        expect(createPurchaseSchema.safeParse({
            ...basePurchase(),
            origenVehiculo: 'taller',
            vehicleId: 1,
            workOrderId: 8,
        }).success).toBe(true);
    });
    it('exige repuesto de catálogo, almacén y cantidad entera para ingresar stock', () => {
        const stockItem = {
            ...basePurchase().items[0],
            afectaStock: true,
            catalogItemId: 5,
            warehouseId: 1,
        };
        expect(createPurchaseSchema.safeParse({ ...basePurchase(), items: [stockItem] }).success).toBe(true);
        expect(issuePaths({
            ...basePurchase(),
            items: [{ ...stockItem, catalogItemId: null }],
        })).toContain('items.0.catalogItemId');
        expect(issuePaths({
            ...basePurchase(),
            items: [{ ...stockItem, warehouseId: null }],
        })).toContain('items.0.warehouseId');
        expect(issuePaths({
            ...basePurchase(),
            items: [{ ...stockItem, cantidad: 1.5 }],
        })).toContain('items.0.cantidad');
    });
});
describe('purchase action schemas', () => {
    it('exige un motivo de anulación de al menos dos caracteres', () => {
        expect(voidPurchaseSchema.parse({ motivo: '  Duplicada  ' }).motivo).toBe('Duplicada');
        expect(voidPurchaseSchema.safeParse({ motivo: 'x' }).success).toBe(false);
    });
    it('convierte referencias vacías en null y exige un método válido', () => {
        expect(registerPurchasePaymentSchema.parse({
            metodo: 'transferencia',
            referencia: '',
            banco: ' ',
            numeroOperacion: '',
        })).toEqual({
            metodo: 'transferencia',
            referencia: null,
            banco: null,
            numeroOperacion: null,
        });
        expect(registerPurchasePaymentSchema.safeParse({ metodo: 'bitcoin' }).success).toBe(false);
    });
});
