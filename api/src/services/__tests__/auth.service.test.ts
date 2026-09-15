import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import { hashToken, signRefreshToken } from '../../utils/jwt.js';
import { hashPassword } from '../../utils/password.js';
import * as authService from '../auth.service.js';

describe('auth.service', () => {
  const TEST_PASSWORD = 'TestPassword123!';
  let devUserId: number;
  let inactiveUserId: number;
  let deletedUserId: number;

  beforeAll(async () => {
    await sequelize.authenticate();

    // Obtener usuario desarrollador
    const devUser = await User.findOne({
      where: { email: 'dev@unithor.local' },
    });
    if (!devUser) {
      throw new Error('Usuario dev@unithor.local no encontrado en BD');
    }
    devUserId = devUser.id;

    // Asegurar que devUser tenga el hash correcto de la contraseña conocida
    const devHash = await hashPassword('Desarrollador2026!');
    await devUser.update({ passwordHash: devHash, activo: true });

    // Obtener rol admin
    const adminRole = await Role.findOne({ where: { nombre: 'admin' } });
    if (!adminRole) {
      throw new Error('Rol admin no encontrado');
    }

    const testPasswordHash = await hashPassword(TEST_PASSWORD);

    // Crear usuario inactivo
    const inactiveUser = await User.create({
      nombre: 'Usuario Inactivo',
      email: 'test-inactive@unithor.local',
      passwordHash: testPasswordHash,
      roleId: adminRole.id,
      activo: false,
    });
    inactiveUserId = inactiveUser.id;

    // Crear usuario soft-deleted
    const deletedUser = await User.create({
      nombre: 'Usuario Eliminado',
      email: 'test-deleted@unithor.local',
      passwordHash: testPasswordHash,
      roleId: adminRole.id,
      activo: true,
    });
    deletedUserId = deletedUser.id;
    await deletedUser.destroy(); // soft-delete
  });

  afterAll(async () => {
    // Limpiar tokens y usuarios de test
    await RefreshToken.destroy({
      where: { userId: [devUserId, inactiveUserId, deletedUserId] },
      force: true,
    });
    await User.destroy({
      where: { id: [inactiveUserId, deletedUserId] },
      force: true,
    });
  });

  describe('login', () => {
    it('inicia sesión con credenciales válidas y genera tokens', async () => {
      const result = await authService.login(
        'dev@unithor.local',
        'Desarrollador2026!',
        'Vitest Test Agent',
      );

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('csrfToken');
      expect(result.user).toEqual(expect.objectContaining({
        id: devUserId,
        nombre: 'Desarrollador UNITHOR',
        email: 'dev@unithor.local',
        role: 'desarrollador',
      }));
      expect(result.user.permissions).toHaveLength(24);
      expect(result.user).not.toHaveProperty('passwordHash');

      // Verificar que se haya guardado el token hash en BD
      const stored = await RefreshToken.findOne({
        where: { tokenHash: hashToken(result.refreshToken) },
      });
      expect(stored).toBeDefined();
      expect(stored?.userId).toBe(devUserId);
      expect(stored?.revokedAt).toBeNull();
      expect(stored?.deviceInfo).toBe('Vitest Test Agent');
    });

    it('inicia sesión usando el nombre de usuario', async () => {
      const result = await authService.login(' DEV ', 'Desarrollador2026!');

      expect(result.user.id).toBe(devUserId);
      expect(result.user.username).toBe('dev');
      expect(result.user.email).toBe('dev@unithor.local');
    });

    it('lanza 401 con mensaje genérico para email inexistente', async () => {
      await expect(
        authService.login('fantasma@unithor.local', 'cualquier-clave'),
      ).rejects.toThrowError(ApiError);

      try {
        await authService.login('fantasma@unithor.local', 'cualquier-clave');
      } catch (err) {
        expect((err as ApiError).statusCode).toBe(401);
        expect((err as ApiError).message).toBe('Credenciales inválidas');
      }
    });

    it('lanza 401 con mensaje genérico para contraseña incorrecta', async () => {
      try {
        await authService.login('dev@unithor.local', 'clave-incorrecta-999');
      } catch (err) {
        expect((err as ApiError).statusCode).toBe(401);
        expect((err as ApiError).message).toBe('Credenciales inválidas');
      }
    });

    it('lanza 401 si el usuario está inactivo (activo = false)', async () => {
      try {
        await authService.login('test-inactive@unithor.local', TEST_PASSWORD);
      } catch (err) {
        expect((err as ApiError).statusCode).toBe(401);
        expect((err as ApiError).message).toBe('Credenciales inválidas');
      }
    });

    it('lanza 401 si el usuario fue eliminado (deleted_at != null)', async () => {
      try {
        await authService.login('test-deleted@unithor.local', TEST_PASSWORD);
      } catch (err) {
        expect((err as ApiError).statusCode).toBe(401);
        expect((err as ApiError).message).toBe('Credenciales inválidas');
      }
    });
  });

  describe('refresh y rotación de tokens', () => {
    it('rota tokens exitosamente invalidando el refresh token previo', async () => {
      const loginRes = await authService.login(
        'dev@unithor.local',
        'Desarrollador2026!',
      );
      const oldRefreshToken = loginRes.refreshToken;

      const refreshRes = await authService.refresh(
        oldRefreshToken,
        'Rotated Device',
      );

      expect(refreshRes).toHaveProperty('accessToken');
      expect(refreshRes).toHaveProperty('refreshToken');
      expect(refreshRes.refreshToken).not.toBe(oldRefreshToken);

      // El token anterior debe estar revocado en la BD
      const oldStored = await RefreshToken.findOne({
        where: { tokenHash: hashToken(oldRefreshToken) },
      });
      expect(oldStored?.revokedAt).not.toBeNull();

      // El nuevo token debe estar activo
      const newStored = await RefreshToken.findOne({
        where: { tokenHash: hashToken(refreshRes.refreshToken) },
      });
      expect(newStored?.revokedAt).toBeNull();
    });

    it('detecta reuso de token revocado y revoca todos los tokens activos del usuario', async () => {
      const loginRes = await authService.login(
        'dev@unithor.local',
        'Desarrollador2026!',
      );
      const token1 = loginRes.refreshToken;

      // Primer refresh: rota y revoca token1
      const refreshRes = await authService.refresh(token1);
      const token2 = refreshRes.refreshToken;

      // Token2 está activo
      const token2Record = await RefreshToken.findOne({
        where: { tokenHash: hashToken(token2) },
      });
      expect(token2Record?.revokedAt).toBeNull();

      // Intento malicioso de reutilizar token1 (ya revocado)
      try {
        await authService.refresh(token1);
        expect.unreachable();
      } catch (err) {
        expect((err as ApiError).statusCode).toBe(401);
        expect((err as ApiError).code).toBe('TOKEN_REUSED');
      }

      // Reuso detectado: token2 debió ser revocado también
      const token2After = await RefreshToken.findOne({
        where: { tokenHash: hashToken(token2) },
      });
      expect(token2After?.revokedAt).not.toBeNull();
    });

    it('lanza 401 TOKEN_EXPIRED si el token de refresco expiró', async () => {
      // Firmar token con 1ms de expiración
      const expiredToken = signRefreshToken(
        { sub: devUserId, jti: 'expired-jti' },
        { expiresIn: '1ms' },
      );

      await new Promise((resolve) => setTimeout(resolve, 20));

      try {
        await authService.refresh(expiredToken);
        expect.unreachable();
      } catch (err) {
        expect((err as ApiError).statusCode).toBe(401);
        expect((err as ApiError).code).toBe('TOKEN_EXPIRED');
      }
    });

    it('lanza 401 TOKEN_INVALID si el refresh token fue manipulado', async () => {
      try {
        await authService.refresh('invalid.jwt.token');
        expect.unreachable();
      } catch (err) {
        expect((err as ApiError).statusCode).toBe(401);
        expect((err as ApiError).code).toBe('TOKEN_INVALID');
      }
    });
  });

  describe('logout y logoutAll', () => {
    it('logout marca el refresh token como revocado y es idempotente', async () => {
      const loginRes = await authService.login(
        'dev@unithor.local',
        'Desarrollador2026!',
      );

      await authService.logout(loginRes.refreshToken);

      const record = await RefreshToken.findOne({
        where: { tokenHash: hashToken(loginRes.refreshToken) },
      });
      expect(record?.revokedAt).not.toBeNull();

      // Segunda llamada idempotente
      await expect(
        authService.logout(loginRes.refreshToken),
      ).resolves.not.toThrow();
    });

    it('logoutAll revoca todas las sesiones activas del usuario', async () => {
      await authService.login('dev@unithor.local', 'Desarrollador2026!');
      await authService.login('dev@unithor.local', 'Desarrollador2026!');

      await authService.logoutAll(devUserId);

      const activeCount = await RefreshToken.count({
        where: { userId: devUserId, revokedAt: null },
      });
      expect(activeCount).toBe(0);
    });
  });

  describe('getMe', () => {
    it('retorna la información pública del usuario autenticado', async () => {
      const me = await authService.getMe(devUserId);

      expect(me).toEqual(expect.objectContaining({
        id: devUserId,
        nombre: 'Desarrollador UNITHOR',
        email: 'dev@unithor.local',
        role: 'desarrollador',
      }));
      expect(me.permissions).toHaveLength(24);
      expect(me).not.toHaveProperty('passwordHash');
    });

    it('lanza 401 si el usuario no existe', async () => {
      try {
        await authService.getMe(999999);
        expect.unreachable();
      } catch (err) {
        expect((err as ApiError).statusCode).toBe(401);
      }
    });
  });
});
