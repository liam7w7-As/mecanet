import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { signAccessToken } from '../../utils/jwt.js';
import { hashPassword } from '../../utils/password.js';
import { apiRouter } from '../index.js';

describe('Auth Routes (E2E)', () => {
  let devUserId: number;
  let vendedorUserId: number;

  beforeAll(async () => {
    await sequelize.authenticate();

    // Obtener y asegurar dev user
    const devUser = await User.findOne({
      where: { email: 'dev@unithor.local' },
    });
    if (!devUser) {
      throw new Error('dev@unithor.local no existe en BD');
    }
    devUserId = devUser.id;
    const devHash = await hashPassword('Desarrollador2026!');
    await devUser.update({ passwordHash: devHash, activo: true });

    // Rol vendedor y usuario vendedor
    const vendedorRole = await Role.findOne({ where: { nombre: 'vendedor' } });
    if (!vendedorRole) {
      throw new Error('Rol vendedor no encontrado');
    }

    let vendedorUser = await User.findOne({
      where: { email: 'e2e-vendedor@unithor.local' },
      paranoid: false,
    });
    if (!vendedorUser) {
      vendedorUser = await User.create({
        nombre: 'Vendedor E2E',
        email: 'e2e-vendedor@unithor.local',
        passwordHash: devHash,
        roleId: vendedorRole.id,
        activo: true,
      });
    } else {
      await vendedorUser.restore();
      await vendedorUser.update({ activo: true, roleId: vendedorRole.id });
    }
    vendedorUserId = vendedorUser.id;

    // Montar ruta temporal para verificar authorize
    apiRouter.get(
      '/_test/protected-admin',
      authenticate,
      authorize('admin', 'read'),
      (_req, res) => {
        res.status(200).json({ ok: true });
      },
    );
  });

  afterAll(async () => {
    await RefreshToken.destroy({
      where: { userId: [devUserId, vendedorUserId] },
      force: true,
    });
    await User.destroy({
      where: { id: vendedorUserId },
      force: true,
    });
  });

  const extractCookies = (res: request.Response) => {
    const rawHeader = res.headers['set-cookie'];
    const rawCookies: string[] = Array.isArray(rawHeader)
      ? rawHeader
      : typeof rawHeader === 'string'
        ? [rawHeader]
        : [];
    const cookies: Record<string, string> = {};
    for (const cookieStr of rawCookies) {
      const [pair] = cookieStr.split(';');
      const [name, value] = pair.split('=');
      if (name && value) {
        cookies[name.trim()] = value.trim();
      }
    }
    return { rawCookies, cookies };
  };

  describe('POST /api/auth/login', () => {
    it('inicia sesión exitosamente sin requerir CSRF inicial y setea cookies', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'dev@unithor.local', password: 'Desarrollador2026!' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('dev@unithor.local');
      expect(response.body.user.role).toBe('desarrollador');

      const { rawCookies, cookies } = extractCookies(response);
      expect(cookies.access_token).toBeDefined();
      expect(cookies.refresh_token).toBeDefined();
      expect(cookies.csrf_token).toBeDefined();

      // Verificar que access_token y refresh_token sean HttpOnly
      const accessCookieStr = rawCookies.find((c) =>
        c.startsWith('access_token='),
      );
      const refreshCookieStr = rawCookies.find((c) =>
        c.startsWith('refresh_token='),
      );
      const csrfCookieStr = rawCookies.find((c) => c.startsWith('csrf_token='));

      expect(accessCookieStr?.toLowerCase()).toContain('httponly');
      expect(refreshCookieStr?.toLowerCase()).toContain('httponly');

      // csrf_token NO debe ser HttpOnly para que JS lo pueda leer
      expect(csrfCookieStr?.toLowerCase()).not.toContain('httponly');
    });

    it('inicia sesión con username y retorna la identidad normalizada', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ identifier: ' DEV ', password: 'Desarrollador2026!' });

      expect(response.status).toBe(200);
      expect(response.body.user.username).toBe('dev');
      expect(response.body.user.email).toBe('dev@unithor.local');
    });

    it('responde 400 cuando el body es inválido (falta email)', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ password: 'Password123!' });

      expect(response.status).toBe(400);
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
      expect(response.body.error).toHaveProperty('details');
    });

    it('responde 400 cuando el email es inválido', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'no-es-email', password: 'Password123!' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('rota tokens exitosamente cuando se envía cookie refresh_token válida', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'dev@unithor.local', password: 'Desarrollador2026!' });

      const { cookies } = extractCookies(loginRes);

      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`refresh_token=${cookies.refresh_token}`]);

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body).toHaveProperty('user');

      const { cookies: newCookies } = extractCookies(refreshRes);
      expect(newCookies.access_token).toBeDefined();
      expect(newCookies.refresh_token).toBeDefined();
      expect(newCookies.refresh_token).not.toBe(cookies.refresh_token);
    });

    it('responde 401 si no se envía la cookie de refresh', async () => {
      const response = await request(app).post('/api/auth/refresh');
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('responde 200 con el perfil del usuario si la cookie de acceso es válida', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'dev@unithor.local', password: 'Desarrollador2026!' });

      const { cookies } = extractCookies(loginRes);

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', [`access_token=${cookies.access_token}`]);

      expect(meRes.status).toBe(200);
      expect(meRes.body.user).toEqual(expect.objectContaining({
        id: devUserId,
        nombre: 'Desarrollador UNITHOR',
        email: 'dev@unithor.local',
        role: 'desarrollador',
      }));
      expect(meRes.body.user.permissions).toHaveLength(30);
      expect(meRes.body.user.permissions).toContainEqual({ modulo: 'admin', accion: 'read' });
    });

    it('responde 401 si no hay cookie access_token', async () => {
      const meRes = await request(app).get('/api/auth/me');
      expect(meRes.status).toBe(401);
    });

    it('responde 401 TOKEN_EXPIRED si el access token expiró', async () => {
      const expiredToken = signAccessToken(
        { sub: devUserId, role: 'desarrollador' },
        { expiresIn: '1ms' },
      );

      await new Promise((resolve) => setTimeout(resolve, 20));

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', [`access_token=${expiredToken}`]);

      expect(meRes.status).toBe(401);
      expect(meRes.body.error.code).toBe('TOKEN_EXPIRED');
    });
  });

  describe('POST /api/auth/logout y CSRF Protection', () => {
    it('rechaza logout con 403 si falta el header X-CSRF-Token', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'dev@unithor.local', password: 'Desarrollador2026!' });

      const { cookies } = extractCookies(loginRes);

      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', [
          `access_token=${cookies.access_token}`,
          `refresh_token=${cookies.refresh_token}`,
          `csrf_token=${cookies.csrf_token}`,
        ]);

      expect(logoutRes.status).toBe(403);
      expect(logoutRes.body.error.code).toBe('CSRF_INVALID');
    });

    it('rechaza logout con 403 si el header X-CSRF-Token no coincide con la cookie', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'dev@unithor.local', password: 'Desarrollador2026!' });

      const { cookies } = extractCookies(loginRes);

      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', [
          `access_token=${cookies.access_token}`,
          `refresh_token=${cookies.refresh_token}`,
          `csrf_token=${cookies.csrf_token}`,
        ])
        .set('X-CSRF-Token', 'token-csrf-manipulado');

      expect(logoutRes.status).toBe(403);
      expect(logoutRes.body.error.code).toBe('CSRF_INVALID');
    });

    it('ejecuta logout con 204 y limpia cookies cuando el CSRF es válido', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'dev@unithor.local', password: 'Desarrollador2026!' });

      const { cookies } = extractCookies(loginRes);

      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', [
          `access_token=${cookies.access_token}`,
          `refresh_token=${cookies.refresh_token}`,
          `csrf_token=${cookies.csrf_token}`,
        ])
        .set('X-CSRF-Token', cookies.csrf_token);

      expect(logoutRes.status).toBe(204);

      // Las cookies deben haber sido limpiadas (max-age=0 o expires en el pasado)
      const { rawCookies: rawAfter } = extractCookies(logoutRes);
      expect(rawAfter.some((c) => c.includes('access_token=;'))).toBe(true);
    });

    it('POST /api/auth/logout-all cierra todas las sesiones con auth y CSRF válidos', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'dev@unithor.local', password: 'Desarrollador2026!' });

      const { cookies } = extractCookies(loginRes);

      const res = await request(app)
        .post('/api/auth/logout-all')
        .set('Cookie', [
          `access_token=${cookies.access_token}`,
          `csrf_token=${cookies.csrf_token}`,
        ])
        .set('X-CSRF-Token', cookies.csrf_token);

      expect(res.status).toBe(204);
    });
  });

  describe('Control de acceso RBAC con authorize', () => {
    it('permite acceso con rol desarrollador (bypass total)', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'dev@unithor.local', password: 'Desarrollador2026!' });

      const { cookies } = extractCookies(loginRes);

      const res = await request(app)
        .get('/api/_test/protected-admin')
        .set('Cookie', [`access_token=${cookies.access_token}`]);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('deniega acceso con 403 para usuario sin permiso específico', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'e2e-vendedor@unithor.local',
          password: 'Desarrollador2026!',
        });

      const { cookies } = extractCookies(loginRes);

      const res = await request(app)
        .get('/api/_test/protected-admin')
        .set('Cookie', [`access_token=${cookies.access_token}`]);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('responde 401 si no está autenticado', async () => {
      const res = await request(app).get('/api/_test/protected-admin');
      expect(res.status).toBe(401);
    });
  });
});
