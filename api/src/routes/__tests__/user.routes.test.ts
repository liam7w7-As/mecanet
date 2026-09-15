import { Op } from 'sequelize';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { hashToken } from '../../utils/jwt.js';
import { hashPassword } from '../../utils/password.js';

const TEST_PASSWORD = 'Desarrollador2026!';
const TEST_EMAIL_PREFIX = 'phase22-';

interface LoginCookies {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
}

const extractCookies = (res: request.Response): Record<string, string> => {
  const rawHeader = res.headers['set-cookie'];
  const rawCookies: string[] = Array.isArray(rawHeader)
    ? rawHeader
    : typeof rawHeader === 'string'
      ? [rawHeader]
      : [];

  return rawCookies.reduce<Record<string, string>>((cookies, cookieStr) => {
    const [pair] = cookieStr.split(';');
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex <= 0) {
      return cookies;
    }

    const name = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1).trim();
    cookies[name] = value;
    return cookies;
  }, {});
};

const loginAs = async (email: string): Promise<LoginCookies> => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });

  expect(response.status).toBe(200);
  const cookies = extractCookies(response);

  return {
    accessToken: cookies.access_token,
    refreshToken: cookies.refresh_token,
    csrfToken: cookies.csrf_token,
  };
};

const authCookie = (cookies: LoginCookies): string[] => [
  `access_token=${cookies.accessToken}`,
  `csrf_token=${cookies.csrfToken}`,
];

describe('User Routes (E2E)', () => {
  let devUserId: number;
  let adminUserId: number;
  let adminRoleId: number;
  let vendedorRoleId: number;
  let bodegueroRoleId: number;

  beforeAll(async () => {
    await sequelize.authenticate();

    const testUsers = await User.findAll({
      where: { email: { [Op.like]: `${TEST_EMAIL_PREFIX}%` } },
      paranoid: false,
    });
    await User.destroy({
      where: { id: testUsers.map((user) => user.id) },
      force: true,
    });

    const [devUser, adminRole, vendedorRole, bodegueroRole] = await Promise.all([
      User.findOne({ where: { email: 'dev@unithor.local' } }),
      Role.findOne({ where: { nombre: 'admin' } }),
      Role.findOne({ where: { nombre: 'vendedor' } }),
      Role.findOne({ where: { nombre: 'bodeguero' } }),
    ]);

    if (!devUser || !adminRole || !vendedorRole || !bodegueroRole) {
      throw new Error('No se encontraron usuarios o roles base para user.routes.test');
    }

    const passwordHash = await hashPassword(TEST_PASSWORD);
    await devUser.update({ passwordHash, activo: true });
    devUserId = devUser.id;
    adminRoleId = adminRole.id;
    vendedorRoleId = vendedorRole.id;
    bodegueroRoleId = bodegueroRole.id;

    const [adminUser] = await Promise.all([
      User.create({
        nombre: 'Admin Fase 22',
        email: `${TEST_EMAIL_PREFIX}admin@unithor.local`,
        passwordHash,
        roleId: adminRoleId,
        activo: true,
      }),
      User.create({
        nombre: 'Vendedor Fase 22',
        email: `${TEST_EMAIL_PREFIX}vendedor@unithor.local`,
        passwordHash,
        roleId: vendedorRoleId,
        activo: true,
      }),
    ]);

    adminUserId = adminUser.id;
  });

  afterAll(async () => {
    const testUsers = await User.findAll({
      where: { email: { [Op.like]: `${TEST_EMAIL_PREFIX}%` } },
      paranoid: false,
    });
    await RefreshToken.destroy({
      where: { userId: testUsers.map((user) => user.id) },
      force: true,
    });
    await User.destroy({
      where: { id: testUsers.map((user) => user.id) },
      force: true,
    });
    await RefreshToken.destroy({ where: { userId: devUserId }, force: true });
  });

  it('requiere autenticación para listar usuarios', async () => {
    const response = await request(app).get('/api/users');
    expect(response.status).toBe(401);
  });

  it('deniega acceso a vendedor al listar y crear usuarios', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);

    const listResponse = await request(app)
      .get('/api/users')
      .set('Cookie', [`access_token=${vendedorCookies.accessToken}`]);
    expect(listResponse.status).toBe(403);

    const createResponse = await request(app)
      .post('/api/users')
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        nombre: 'Usuario Bloqueado',
        username: `${TEST_EMAIL_PREFIX}blocked`,
        email: `${TEST_EMAIL_PREFIX}blocked@unithor.local`,
        password: TEST_PASSWORD,
        roleId: bodegueroRoleId,
      });
    expect(createResponse.status).toBe(403);
  });

  it('permite a desarrollador crear usuario y guarda password con hash bcrypt', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const email = `${TEST_EMAIL_PREFIX}created@unithor.local`;

    const response = await request(app)
      .post('/api/users')
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({
        nombre: 'Usuario Creado Fase',
        username: `${TEST_EMAIL_PREFIX}created`,
        email,
        password: TEST_PASSWORD,
        roleId: bodegueroRoleId,
      });

    expect(response.status).toBe(201);
    expect(response.body.user.username).toBe(`${TEST_EMAIL_PREFIX}created`);
    expect(response.body.user.email).toBe(email);
    expect(response.body.user.role.nombre).toBe('bodeguero');
    expect(response.body.user).not.toHaveProperty('passwordHash');

    const stored = await User.findOne({ where: { email } });
    expect(stored?.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(stored?.passwordHash).not.toBe(TEST_PASSWORD);
  });

  it('responde 409 al crear usuario con email duplicado', async () => {
    const devCookies = await loginAs('dev@unithor.local');

    const response = await request(app)
      .post('/api/users')
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({
        nombre: 'Duplicado Fase',
        username: `${TEST_EMAIL_PREFIX}duplicate-email`,
        email: `${TEST_EMAIL_PREFIX}created@unithor.local`,
        password: TEST_PASSWORD,
        roleId: bodegueroRoleId,
      });

    expect(response.status).toBe(409);
    expect(response.body.error.message).toBe('El email ya está registrado');
  });

  it('responde 409 al crear usuario con username duplicado', async () => {
    const devCookies = await loginAs('dev@unithor.local');

    const response = await request(app)
      .post('/api/users')
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({
        nombre: 'Duplicado Username',
        username: `${TEST_EMAIL_PREFIX}created`,
        email: `${TEST_EMAIL_PREFIX}duplicate-username@unithor.local`,
        password: TEST_PASSWORD,
        roleId: bodegueroRoleId,
      });

    expect(response.status).toBe(409);
    expect(response.body.error.message).toBe('El nombre de usuario ya está registrado');
  });

  it('permite actualizar datos y reasignar rol sin exponer passwordHash', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const user = await User.create({
      nombre: 'Usuario A Reasignar',
      email: `${TEST_EMAIL_PREFIX}reassign@unithor.local`,
      passwordHash: await hashPassword(TEST_PASSWORD),
      roleId: vendedorRoleId,
      activo: true,
    });

    const response = await request(app)
      .patch(`/api/users/${user.id}`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({
        nombre: 'Usuario Reasignado',
        roleId: bodegueroRoleId,
      });

    expect(response.status).toBe(200);
    expect(response.body.user.nombre).toBe('Usuario Reasignado');
    expect(response.body.user.role.nombre).toBe('bodeguero');
    expect(response.body.user).not.toHaveProperty('passwordHash');
  });

  it('impide que un usuario se elimine o desactive a sí mismo', async () => {
    const adminCookies = await loginAs(`${TEST_EMAIL_PREFIX}admin@unithor.local`);

    const deleteResponse = await request(app)
      .delete(`/api/users/${adminUserId}`)
      .set('Cookie', authCookie(adminCookies))
      .set('X-CSRF-Token', adminCookies.csrfToken);
    expect(deleteResponse.status).toBe(400);

    const deactivateResponse = await request(app)
      .patch(`/api/users/${adminUserId}/status`)
      .set('Cookie', authCookie(adminCookies))
      .set('X-CSRF-Token', adminCookies.csrfToken)
      .send({ activo: false });
    expect(deactivateResponse.status).toBe(400);
  });

  it('elimina con soft delete y revoca refresh tokens del usuario eliminado', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const passwordHash = await hashPassword(TEST_PASSWORD);
    const target = await User.create({
      nombre: 'Usuario Eliminable',
      email: `${TEST_EMAIL_PREFIX}delete-target@unithor.local`,
      passwordHash,
      roleId: vendedorRoleId,
      activo: true,
    });

    const targetCookies = await loginAs(`${TEST_EMAIL_PREFIX}delete-target@unithor.local`);
    const tokenBeforeDelete = await RefreshToken.findOne({
      where: { tokenHash: hashToken(targetCookies.refreshToken) },
    });
    expect(tokenBeforeDelete?.revokedAt).toBeNull();

    const response = await request(app)
      .delete(`/api/users/${target.id}`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken);

    expect(response.status).toBe(204);

    const deleted = await User.findByPk(target.id, { paranoid: false });
    expect(deleted?.deletedAt).not.toBeNull();
    expect(deleted?.activo).toBe(false);

    const tokenAfterDelete = await RefreshToken.findOne({
      where: { tokenHash: hashToken(targetCookies.refreshToken) },
    });
    expect(tokenAfterDelete?.revokedAt).not.toBeNull();
  });

  it('pagina y busca usuarios por nombre o email', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const passwordHash = await hashPassword(TEST_PASSWORD);
    await User.bulkCreate([
      {
        nombre: 'Searchable Phase Uno',
        email: `${TEST_EMAIL_PREFIX}search-one@unithor.local`,
        passwordHash,
        roleId: vendedorRoleId,
        activo: true,
      },
      {
        nombre: 'Searchable Phase Dos',
        email: `${TEST_EMAIL_PREFIX}search-two@unithor.local`,
        passwordHash,
        roleId: vendedorRoleId,
        activo: true,
      },
      {
        nombre: 'Searchable Phase Tres',
        email: `${TEST_EMAIL_PREFIX}search-three@unithor.local`,
        passwordHash,
        roleId: vendedorRoleId,
        activo: true,
      },
    ]);

    const response = await request(app)
      .get('/api/users')
      .query({ page: 1, pageSize: 2, search: 'Searchable Phase' })
      .set('Cookie', [`access_token=${devCookies.accessToken}`]);

    expect(response.status).toBe(200);
    expect(response.body.meta.page).toBe(1);
    expect(response.body.meta.limit).toBe(2);
    expect(response.body.meta.total).toBeGreaterThanOrEqual(3);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data[0]).not.toHaveProperty('passwordHash');
  });
});
