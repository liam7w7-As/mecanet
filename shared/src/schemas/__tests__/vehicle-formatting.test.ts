import { describe, expect, it } from 'vitest';

import { createFleetVehicleSchema } from '../fleet-vehicle.schema.js';
import { lookupByPlateSchema } from '../search.schema.js';
import { createVehicleSchema, formatChilePatente } from '../vehicle.schema.js';

describe('Formato de patentes y compatibilidad con registros antiguos', () => {
  it.each([
    ['ab1234', 'AB-1234'], ['AB-1234', 'AB-1234'], ['bcdf71', 'BCDF-71'],
    [' BC DF-71 ', 'BCDF-71'], ['AR-123AB', 'AR-123AB'], ['1234-XYZ', '1234-XYZ'],
  ])('presenta %s como %s sin acumular guiones', (input, expected) => {
    expect(formatChilePatente(input)).toBe(expected);
    expect(formatChilePatente(expected)).toBe(expected);
  });

  it('busca la misma patente chilena con o sin guion y conserva identificadores extranjeros', () => {
    expect(lookupByPlateSchema.parse({ patente: 'bcdf-71' }).patente).toBe('BCDF71');
    expect(lookupByPlateSchema.parse({ patente: 'BCDF71' }).patente).toBe('BCDF71');
    expect(lookupByPlateSchema.parse({ patente: 'ar-123ab' }).patente).toBe('AR-123AB');
  });

  it('acepta una patente extranjera en ambos directorios únicamente cuando se indica', () => {
    for (const schema of [createVehicleSchema, createFleetVehicleSchema]) {
      expect(schema.safeParse({ patente: 'AR-123AB' }).success).toBe(false);
      expect(schema.parse({ patente: 'ar-123ab', esExtranjera: true }).patente).toBe('AR-123AB');
    }
  });
});
