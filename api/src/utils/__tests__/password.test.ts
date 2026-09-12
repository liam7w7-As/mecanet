import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from '../password.js';

describe('password utility', () => {
  it('genera un hash válido de bcrypt y con salteado único', async () => {
    const plain = 'superSecretPassword123';
    const hash1 = await hashPassword(plain);
    const hash2 = await hashPassword(plain);

    expect(hash1).toMatch(/^\$2[aby]\$\d+\$/);
    expect(hash2).toMatch(/^\$2[aby]\$\d+\$/);
    expect(hash1).not.toBe(hash2); // Las sales deben ser distintas
  });

  it('verifica exitosamente contraseñas válidas', async () => {
    const plain = 'mypassword!123';
    const hash = await hashPassword(plain);

    const isValid = await verifyPassword(plain, hash);
    expect(isValid).toBe(true);
  });

  it('rechaza contraseñas incorrectas', async () => {
    const plain = 'mypassword!123';
    const hash = await hashPassword(plain);

    const isValid = await verifyPassword('wrongpassword', hash);
    expect(isValid).toBe(false);
  });
});
