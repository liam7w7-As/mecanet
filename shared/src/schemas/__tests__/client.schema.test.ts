import { describe, expect, it } from 'vitest';

import { chilePhoneSchema, createClientSchema, rutSchema } from '../client.schema.js';
import { formatRut, isValidRut } from '../../utils/rut.js';

describe('Client identity and contact validation', () => {
  it.each(['123456785', '12.345.678-5', ' 12 345 678 - 5 '])(
    'accepts and normalizes RUN/RUT %s',
    (rut) => {
      expect(rutSchema.parse(rut)).toBe('123456785');
      expect(formatRut(rut)).toBe('12.345.678-5');
    },
  );

  it('accepts a lowercase K without changing the verifier', () => {
    expect(rutSchema.parse('6.000.000-k')).toBe('6000000K');
    expect(formatRut('6000000k')).toBe('6.000.000-K');
  });

  it.each(['12.345.678-9', '12.345.678', '123456785a', '0-0', '00000000-0', '123456789-0'])(
    'rejects an invalid RUN/RUT %s',
    (rut) => {
      expect(rutSchema.safeParse(rut).success).toBe(false);
      expect(isValidRut(rut)).toBe(false);
    },
  );

  it('allows registration with only a name and client type', () => {
    expect(
      createClientSchema.parse({
        nombre: ' Ana Pérez ',
        tipo: 'cliente',
        rut: '',
        telefono: '',
        email: '',
      }),
    ).toMatchObject({ nombre: 'Ana Pérez', rut: null, telefono: null, email: null });
  });

  it.each([
    ['912345678', '+56912345678'],
    ['+56 9 1234 5678', '+56912345678'],
    ['2 2345 6789', '+56223456789'],
    ['(32) 234 5678', '+56322345678'],
    ['+56 55 234 5678', '+56552345678'],
    ['56 234 5678', '+56562345678'],
    ['600123456', '+56600123456'],
  ])('accepts a mobile or regional number %s', (phone, expected) => {
    expect(chilePhoneSchema.parse(phone)).toBe(expected);
    expect(chilePhoneSchema.parse(expected)).toBe(expected);
  });

  it.each(['12345', '91234567', '+51 912345678', '+912345678', '9+12345678', 'abcdefghi'])(
    'rejects an invalid phone %s',
    (phone) => {
      expect(chilePhoneSchema.safeParse(phone).success).toBe(false);
    },
  );
});
