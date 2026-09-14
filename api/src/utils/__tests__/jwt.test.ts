import { describe, expect, it } from 'vitest';

import { ApiError } from '../ApiError.js';
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../jwt.js';

describe('JWT Utilities', () => {
  describe('Access Token', () => {
    it('firma y verifica un access token correctamente', () => {
      const payload = { sub: 123, role: 'admin' };
      const token = signAccessToken(payload);

      const verified = verifyAccessToken(token);
      expect(verified.sub).toBe(123);
      expect(verified.role).toBe('admin');
    });

    it('lanza ApiError con TOKEN_EXPIRED cuando el access token expira', async () => {
      const payload = { sub: 123, role: 'admin' };
      const token = signAccessToken(payload, { expiresIn: '1ms' });

      // Esperar 20ms para asegurar expiración
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(() => verifyAccessToken(token)).toThrowError(ApiError);
      try {
        verifyAccessToken(token);
      } catch (err) {
        expect((err as ApiError).statusCode).toBe(401);
        expect((err as ApiError).code).toBe('TOKEN_EXPIRED');
      }
    });

    it('lanza ApiError con TOKEN_INVALID si la firma o contenido es inválido', () => {
      const manipulatedToken = 'header.payload.invalidsignature';
      expect(() => verifyAccessToken(manipulatedToken)).toThrowError(ApiError);
      try {
        verifyAccessToken(manipulatedToken);
      } catch (err) {
        expect((err as ApiError).statusCode).toBe(401);
        expect((err as ApiError).code).toBe('TOKEN_INVALID');
      }
    });
  });

  describe('Refresh Token', () => {
    it('firma y verifica un refresh token con jti', () => {
      const payload = { sub: 456, jti: 'uuid-trace-random-jti' };
      const token = signRefreshToken(payload);

      const verified = verifyRefreshToken(token);
      expect(verified.sub).toBe(456);
      expect(verified.jti).toBe('uuid-trace-random-jti');
    });

    it('lanza ApiError con TOKEN_EXPIRED si el refresh token expiró', async () => {
      const payload = { sub: 456, jti: 'uuid-trace-random-jti' };
      const token = signRefreshToken(payload, { expiresIn: '1ms' });

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(() => verifyRefreshToken(token)).toThrowError(ApiError);
      try {
        verifyRefreshToken(token);
      } catch (err) {
        expect((err as ApiError).statusCode).toBe(401);
        expect((err as ApiError).code).toBe('TOKEN_EXPIRED');
      }
    });

    it('lanza ApiError con TOKEN_INVALID si el refresh token fue manipulado', () => {
      const badToken = 'invalid.refresh.token';
      expect(() => verifyRefreshToken(badToken)).toThrowError(ApiError);
      try {
        verifyRefreshToken(badToken);
      } catch (err) {
        expect((err as ApiError).statusCode).toBe(401);
        expect((err as ApiError).code).toBe('TOKEN_INVALID');
      }
    });
  });

  describe('hashToken', () => {
    it('genera un hash SHA-256 hexadecimal determinista de 64 caracteres', () => {
      const token = 'sample-jwt-token-string';
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('genera hashes distintos para tokens distintos', () => {
      const hash1 = hashToken('token-a');
      const hash2 = hashToken('token-b');
      expect(hash1).not.toBe(hash2);
    });
  });
});
