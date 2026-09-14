import { describe, expect, it } from 'vitest';

import {
  CATALOG_TYPES,
  MODULES,
  PERMISSIONS,
  QUOTATION_STATUS,
  ROLES,
  WORK_ORDER_STATUS,
  createClientSchema,
  createVehicleSchema,
  createWorkOrderSchema,
  loginSchema,
  paginationSchema,
} from './index.js';

describe('Shared Package Constants & Schemas', () => {
  it('debe exportar roles y permisos válidos', () => {
    expect(ROLES).toContain('admin');
    expect(ROLES).toContain('desarrollador');
    expect(MODULES).toContain('taller');
    expect(PERMISSIONS.length).toBeGreaterThan(0);
    expect(CATALOG_TYPES).toEqual(['parte', 'estandar', 'especifico']);
    expect(QUOTATION_STATUS).toContain('por_pagar');
    expect(WORK_ORDER_STATUS).toContain('borrador');
  });

  it('valida createClientSchema con datos correctos y rechaza inválidos', () => {
    const validClient = createClientSchema.safeParse({
      nombre: 'Taller Mecánico Central',
      rut: '12.345.678-5',
      tipo: 'empresa',
      email: 'contacto@central.cl',
    });
    expect(validClient.success).toBe(true);

    const invalidRutClient = createClientSchema.safeParse({
      nombre: 'Juan Perez',
      rut: 'rut-invalido-123',
    });
    expect(invalidRutClient.success).toBe(false);

    const emptyNameClient = createClientSchema.safeParse({
      nombre: '   ',
    });
    expect(emptyNameClient.success).toBe(false);
  });

  it('valida paginationSchema con límites (page >= 1, pageSize 1-100)', () => {
    const validDefault = paginationSchema.parse({});
    expect(validDefault.page).toBe(1);
    expect(validDefault.pageSize).toBe(20);

    const validCustom = paginationSchema.safeParse({ page: 2, pageSize: 50 });
    expect(validCustom.success).toBe(true);

    const zeroPage = paginationSchema.safeParse({ page: 0 });
    expect(zeroPage.success).toBe(false);

    const overLimitSize = paginationSchema.safeParse({ pageSize: 101 });
    expect(overLimitSize.success).toBe(false);
  });

  it('valida createWorkOrderSchema con cabecera e items', () => {
    const validOT = createWorkOrderSchema.safeParse({
      clientId: 1,
      vehicleId: 1,
      fechaIngreso: '2026-09-12T12:00:00Z',
      items: [{ descripcion: 'Cambio de aceite', cantidad: 2, precioUnitario: 10000 }],
    });
    expect(validOT.success).toBe(true);

    const invalidDateOT = createWorkOrderSchema.safeParse({
      fechaIngreso: 'fecha-invalida',
    });
    expect(invalidDateOT.success).toBe(false);

    const invalidItemOT = createWorkOrderSchema.safeParse({
      items: [{ descripcion: 'x', cantidad: 0, precioUnitario: 10000 }],
    });
    expect(invalidItemOT.success).toBe(false);
  });

  it('valida que createVehicleSchema normalice la patente', () => {
    const res = createVehicleSchema.parse({ patente: 'ab-cd-12' });
    expect(res.patente).toBe('ABCD12');
  });

  it('valida loginSchema', () => {
    const valid = loginSchema.safeParse({ email: 'test@unithor.com', password: 'password123' });
    expect(valid.success).toBe(true);
  });
});
