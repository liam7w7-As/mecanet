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

  it.each([createWorkOrderSchema, convertQuotationToWorkOrderSchema])('validates editable billing details on creation and conversion', (schema) => {
    const billing = { nombre: 'Empresa de prueba', tipo: 'empresa', rut: '77.374.788-1', email: ' FACTURAS@EXAMPLE.COM ', direccion: 'Calle 123' };
    const result = schema.parse({ vehicleId: 1, billingClientId: 2, billing });
    expect(result.billing).toMatchObject({ nombre: billing.nombre, rut: '773747881', email: 'facturas@example.com' });
    expect(schema.safeParse({ vehicleId: 1, billing: { ...billing, email: 'correo inválido' } }).success).toBe(false);
    expect(schema.safeParse({ vehicleId: 1, billing: { ...billing, nombre: '' } }).success).toBe(false);
  });
});
