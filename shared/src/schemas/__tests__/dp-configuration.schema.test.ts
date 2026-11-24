import { describe, expect, it } from 'vitest';

import { createDefaultDpConfiguration } from '../../constants/dp-configuration.js';
import {
  dpConfigurationRecordSchema, dpConfigurationSchema, dpQuoteInputSchema, updateDpConfigurationSchema,
} from '../dp-configuration.schema.js';

describe('Contrato de configuración D&P', () => {
  it('acepta la configuración inicial y su registro con revisión y editor', () => {
    const configuration = createDefaultDpConfiguration();
    expect(dpConfigurationRecordSchema.safeParse({ configuration, revision: 1,
      updatedAt: '2026-11-24T12:00:00.000Z', lastEditor: null }).success).toBe(true);
    expect(dpConfigurationRecordSchema.safeParse({ configuration, revision: 2,
      updatedAt: '2026-11-24T12:00:00.000Z', lastEditor: { id: 3, nombre: 'Jefe de taller' } }).success).toBe(true);
    expect(updateDpConfigurationSchema.safeParse({ configuration, expectedRevision: 1 }).success).toBe(true);
    expect(updateDpConfigurationSchema.safeParse({ configuration }).success).toBe(false);
    expect(updateDpConfigurationSchema.safeParse({ configuration, expectedRevision: 0 }).success).toBe(false);
  });

  it('acepta precios pendientes como null y un precio cero explícito, sin confundirlos', () => {
    const config = createDefaultDpConfiguration();
    config.tables[0].basePrice = 0;
    const parsed = dpConfigurationSchema.parse(config);
    expect(parsed.tables[0].basePrice).toBe(0);
    expect(parsed.tables.find((table) => table.id === 'polishing')?.basePrice).toBeNull();
    expect(parsed.operations.find((operation) => operation.id === 'painting_retouch')?.multiplier).toBeNull();
  });

  it.each([-1, 0.001, Infinity, Number.NaN, 10000000000])('rechaza una base monetaria inválida: %s', (price) => {
    const config = createDefaultDpConfiguration();
    config.tables[0].basePrice = price;
    expect(dpConfigurationSchema.safeParse(config).success).toBe(false);
  });

  it('rechaza IDs repetidos en tarifas, operaciones y tamaños y referencias rotas', () => {
    const cases = [
      () => { const config = createDefaultDpConfiguration(); config.rates.push({ ...config.rates[0] }); return config; },
      () => { const config = createDefaultDpConfiguration(); config.operations.push({ ...config.operations[0] }); return config; },
      () => { const config = createDefaultDpConfiguration(); config.bodyTypes[0].sizes.push({ ...config.bodyTypes[0].sizes[0] }); return config; },
      () => { const config = createDefaultDpConfiguration(); config.rates[0].bodyTypeId = 'inexistente'; return config; },
      () => { const config = createDefaultDpConfiguration(); config.rates[0].pieceId = 'inexistente'; return config; },
      () => { const config = createDefaultDpConfiguration(); config.operations[0].tableId = 'inexistente'; return config; },
    ];
    for (const makeConfig of cases) expect(dpConfigurationSchema.safeParse(makeConfig()).success).toBe(false);
  });

  it('mantiene cinco pasos distintos y no permite quitarles las especialidades', () => {
    const config = createDefaultDpConfiguration();
    config.stages[1].label = 'Preparación';
    expect(dpConfigurationSchema.safeParse(config).success).toBe(true);
    config.stages[1].specialties = [];
    expect(dpConfigurationSchema.safeParse(config).success).toBe(false);
    config.stages[1].specialties = ['preparador'];
    config.stages[4].key = config.stages[0].key;
    expect(dpConfigurationSchema.safeParse(config).success).toBe(false);
    config.stages.pop();
    expect(dpConfigurationSchema.safeParse(config).success).toBe(false);
  });

  it('exige una tarifa propia fija para los servicios globales', () => {
    const config = createDefaultDpConfiguration();
    config.operations.find((operation) => operation.scope === 'global')!.tableId = 'painting';
    expect(dpConfigurationSchema.safeParse(config).success).toBe(false);
  });
});

describe('Contrato de selección de trabajo D&P', () => {
  const input = () => ({ configurationRevision: 1, bodyTypeId: 'hatchback', sizeId: 'S',
    pieceId: 'parachoque', positionId: 'F', operations: [{ operationId: 'painting_full' }] });

  it('normaliza el alcance por pieza y exige una ubicación sin aceptar importes inventados', () => {
    expect(dpQuoteInputSchema.parse(input()).scope).toBe('piece');
    expect(dpQuoteInputSchema.safeParse({ ...input(), positionId: undefined }).success).toBe(false);
    expect(dpQuoteInputSchema.safeParse({ ...input(), precioUnitario: 1 }).success).toBe(false);
    expect(dpQuoteInputSchema.safeParse({ ...input(), operations: [{ operationId: 'painting_full', precio: 1 }] }).success).toBe(false);
  });

  it('acepta un alcance global únicamente sin pieza ni posición', () => {
    const global = { ...input(), scope: 'global', pieceId: undefined, positionId: undefined,
      operations: [{ operationId: 'global_polishing' }] };
    expect(dpQuoteInputSchema.safeParse(global).success).toBe(true);
    expect(dpQuoteInputSchema.safeParse({ ...global, pieceId: 'parachoque' }).success).toBe(false);
    expect(dpQuoteInputSchema.safeParse({ ...global, positionId: 'F' }).success).toBe(false);
  });

  it('exige una operación y no permite cobrar dos veces el mismo ID', () => {
    expect(dpQuoteInputSchema.safeParse({ ...input(), operations: [] }).success).toBe(false);
    expect(dpQuoteInputSchema.safeParse({ ...input(), operations: [
      { operationId: 'dismantling' }, { operationId: 'dismantling' },
    ] }).success).toBe(false);
  });

  it('acepta descuentos por concepto y rechaza campos extra para descuentos automáticos', () => {
    expect(dpQuoteInputSchema.safeParse({ ...input(), operations: [
      { operationId: 'painting_full', descuentoTipo: 'porcentaje', descuentoValor: 15 },
    ] }).success).toBe(true);
    expect(dpQuoteInputSchema.safeParse({ ...input(), automaticDiscount: true }).success).toBe(false);
  });
});
