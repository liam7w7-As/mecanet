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

  it('accepts a RUN/RUT pasted with a typographic dash', () => {
    expect(rutSchema.parse('12.232.378–8')).toBe('122323788');
    expect(formatRut('12.232.378–8')).toBe('12.232.378-8');
    expect(isValidRut('12.232.378–8')).toBe(true);
  });

  it('accepts a lowercase K without changing the verifier', () => {
    expect(rutSchema.parse('6.000.000-k')).toBe('6000000K');
    expect(formatRut('6000000k')).toBe('6.000.000-K');
  });

  it('accepts a RUN/RUT whose verifier is not the computed one', () => {
    expect(rutSchema.parse('12.232.378-8')).toBe('122323788');
    expect(rutSchema.parse('12.345.678-9')).toBe('123456789');
  });

  it.each(['123456785a', '0-0', '00000000-0', '123456789-0'])(
    'rejects a RUN/RUT without the expected format %s',
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

  it.each(['912345678', '+56 9 1234 5678', '+51 912345678', 'anexo 1234', 'abcdefghi'])(
    'stores the phone exactly as entered: %s',
    (phone) => {
      expect(chilePhoneSchema.parse(phone)).toBe(phone);
    },
  );

  it('turns blank phones into null and rejects values longer than 30 characters', () => {
    expect(chilePhoneSchema.parse('  ')).toBe(null);
    expect(chilePhoneSchema.safeParse('9'.repeat(31)).success).toBe(false);
  });
});
