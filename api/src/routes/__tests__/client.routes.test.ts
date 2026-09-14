import { Op } from 'sequelize';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { Client } from '../../models/Client.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { Vehicle } from '../../models/Vehicle.js';
import { hashPassword } from '../../utils/password.js';

const TEST_PASSWORD = 'Desarrollador2026!';
const TEST_EMAIL_PREFIX = 'phase31-';
const TEST_RUT_PREFIX = '7631000';

interface LoginCookies {
  accessToken: string;
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

    cookies[pair.slice(0, separatorIndex).trim()] = pair
      .slice(separatorIndex + 1)
      .trim();
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
    csrfToken: cookies.csrf_token,
  };
};

const authCookie = (cookies: LoginCookies): string[] => [
  `access_token=${cookies.accessToken}`,
  `csrf_token=${cookies.csrfToken}`,
];

describe('Client Routes (E2E)', () => {
  let devUserId: number;
  let vendedorUserId: number;
  let bodegueroUserId: number;
  let vendedorRoleId: number;
  let bodegueroRoleId: number;

  beforeAll(async () => {
    await sequelize.authenticate();

    const existingClients = await Client.findAll({
      where: { email: { [Op.like]: `${TEST_EMAIL_PREFIX}%` } },
      paranoid: false,
    });
    await Vehicle.destroy({
      where: { clientId: existingClients.map((client) => client.id) },
      force: true,
    });
    await Client.destroy({
      where: { id: existingClients.map((client) => client.id) },
      force: true,
    });

    const passwordHash = await hashPassword(TEST_PASSWORD);
    const [devUser, vendedorRole, bodegueroRole] = await Promise.all([
      User.findOne({ where: { email: 'dev@unithor.local' } }),
      Role.findOne({ where: { nombre: 'vendedor' } }),
      Role.findOne({ where: { nombre: 'bodeguero' } }),
    ]);

    if (!devUser || !vendedorRole || !bodegueroRole) {
      throw new Error('No se encontraron usuarios o roles base para client.routes.test');
    }

    await devUser.update({ passwordHash, activo: true });
    devUserId = devUser.id;
    vendedorRoleId = vendedorRole.id;
    bodegueroRoleId = bodegueroRole.id;

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

    const [vendedorUser, bodegueroUser] = await Promise.all([
      User.create({
        nombre: 'Vendedor Fase 31',
        email: `${TEST_EMAIL_PREFIX}vendedor@unithor.local`,
        passwordHash,
        roleId: vendedorRoleId,
        activo: true,
      }),
      User.create({
        nombre: 'Bodeguero Fase 31',
        email: `${TEST_EMAIL_PREFIX}bodeguero@unithor.local`,
        passwordHash,
        roleId: bodegueroRoleId,
        activo: true,
      }),
    ]);

    vendedorUserId = vendedorUser.id;
    bodegueroUserId = bodegueroUser.id;
  });

  afterAll(async () => {
    const testClients = await Client.findAll({
      where: { email: { [Op.like]: `${TEST_EMAIL_PREFIX}%` } },
      paranoid: false,
    });
    await Vehicle.destroy({
      where: { clientId: testClients.map((client) => client.id) },
      force: true,
    });
    await Client.destroy({
      where: { id: testClients.map((client) => client.id) },
      force: true,
    });

    await RefreshToken.destroy({
      where: { userId: [devUserId, vendedorUserId, bodegueroUserId] },
      force: true,
    });
    await User.destroy({
      where: { id: [vendedorUserId, bodegueroUserId] },
      force: true,
    });
  });

  it('requiere autenticación para listar clientes', async () => {
    const response = await request(app).get('/api/clients');
    expect(response.status).toBe(401);
  });

  it('deniega creación a un rol sin permiso comercial o taller create', async () => {
    const bodegueroCookies = await loginAs(`${TEST_EMAIL_PREFIX}bodeguero@unithor.local`);

    const response = await request(app)
      .post('/api/clients')
      .set('Cookie', authCookie(bodegueroCookies))
      .set('X-CSRF-Token', bodegueroCookies.csrfToken)
      .send({
        rut: `${TEST_RUT_PREFIX}1-1`,
        nombre: 'Cliente Bloqueado Fase 31',
        tipo: 'cliente',
        email: `${TEST_EMAIL_PREFIX}blocked@unithor.local`,
      });

    expect(response.status).toBe(403);
  });

  it('crea clientes persona natural y empresa', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);

    const naturalResponse = await request(app)
      .post('/api/clients')
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        rut: `${TEST_RUT_PREFIX}2-2`,
        nombre: 'Cliente Natural Fase 31',
        tipo: 'cliente',
        email: `${TEST_EMAIL_PREFIX}natural@unithor.local`,
        telefono: '+56 9 1111 2222',
      });
    expect(naturalResponse.status).toBe(201);
    expect(naturalResponse.body.client).toMatchObject({
      rut: `${TEST_RUT_PREFIX}22`,
      nombre: 'Cliente Natural Fase 31',
      tipo: 'cliente',
      email: `${TEST_EMAIL_PREFIX}natural@unithor.local`,
    });

    const empresaResponse = await request(app)
      .post('/api/clients')
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        rut: `${TEST_RUT_PREFIX}3-3`,
        nombre: 'Empresa Fase 31 Spa',
        tipo: 'empresa',
        email: `${TEST_EMAIL_PREFIX}empresa@unithor.local`,
        direccion: 'Av. Principal 123',
      });
    expect(empresaResponse.status).toBe(201);
    expect(empresaResponse.body.client.tipo).toBe('empresa');
  });

  it('responde 409 al registrar un RUT repetido', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);

    const response = await request(app)
      .post('/api/clients')
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        rut: `${TEST_RUT_PREFIX}2-2`,
        nombre: 'Cliente Rut Duplicado',
        tipo: 'cliente',
        email: `${TEST_EMAIL_PREFIX}duplicate@unithor.local`,
      });

    expect(response.status).toBe(409);
    expect(response.body.error.message).toBe('Ya existe un cliente con ese RUT');
  });

  it('lista con paginación, búsqueda por texto y filtro por tipo', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);

    await Client.bulkCreate([
      {
        rut: `${TEST_RUT_PREFIX}44`,
        nombre: 'Buscable Fase Cliente Uno',
        tipo: 'cliente',
        email: `${TEST_EMAIL_PREFIX}search-one@unithor.local`,
      },
      {
        rut: `${TEST_RUT_PREFIX}55`,
        nombre: 'Buscable Fase Empresa Dos',
        tipo: 'empresa',
        email: `${TEST_EMAIL_PREFIX}search-two@unithor.local`,
      },
      {
        rut: `${TEST_RUT_PREFIX}66`,
        nombre: 'Buscable Fase Empresa Tres',
        tipo: 'empresa',
        email: `${TEST_EMAIL_PREFIX}search-three@unithor.local`,
      },
    ]);

    const response = await request(app)
      .get('/api/clients')
      .query({ page: 1, pageSize: 2, search: 'Buscable Fase', tipo: 'empresa' })
      .set('Cookie', [`access_token=${vendedorCookies.accessToken}`]);

    expect(response.status).toBe(200);
    expect(response.body.page).toBe(1);
    expect(response.body.pageSize).toBe(2);
    expect(response.body.total).toBeGreaterThanOrEqual(2);
    expect(response.body.items).toHaveLength(2);
    expect(
      response.body.items.every((client: { tipo: string }) => client.tipo === 'empresa'),
    ).toBe(true);
  });

  it('obtiene cliente por ID con y sin vehículos asociados', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);
    const client = await Client.create({
      rut: `${TEST_RUT_PREFIX}77`,
      nombre: 'Cliente Con Vehiculo Fase 31',
      tipo: 'cliente',
      email: `${TEST_EMAIL_PREFIX}vehicle-owner@unithor.local`,
    });
    await Vehicle.create({
      patente: 'PH3101',
      marca: 'Toyota',
      modelo: 'Yaris',
      ano: 2021,
      clientId: client.id,
    });

    const responseWithoutVehicles = await request(app)
      .get(`/api/clients/${client.id}`)
      .set('Cookie', [`access_token=${vendedorCookies.accessToken}`]);
    expect(responseWithoutVehicles.status).toBe(200);
    expect(responseWithoutVehicles.body.client).not.toHaveProperty('vehicles');

    const responseWithVehicles = await request(app)
      .get(`/api/clients/${client.id}`)
      .query({ includeVehicles: 'true' })
      .set('Cookie', [`access_token=${vendedorCookies.accessToken}`]);
    expect(responseWithVehicles.status).toBe(200);
    expect(responseWithVehicles.body.client.vehicles).toEqual([
      expect.objectContaining({
        patente: 'PH3101',
        marca: 'Toyota',
        modelo: 'Yaris',
      }),
    ]);
  });

  it('aplica soft delete y excluye el cliente eliminado del listado', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);
    const client = await Client.create({
      rut: `${TEST_RUT_PREFIX}88`,
      nombre: 'Cliente Eliminable Fase 31',
      tipo: 'cliente',
      email: `${TEST_EMAIL_PREFIX}delete-target@unithor.local`,
    });

    const deleteResponse = await request(app)
      .delete(`/api/clients/${client.id}`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken);
    expect(deleteResponse.status).toBe(204);

    const deleted = await Client.findByPk(client.id, { paranoid: false });
    expect(deleted?.deletedAt).not.toBeNull();

    const listResponse = await request(app)
      .get('/api/clients')
      .query({ search: 'Cliente Eliminable Fase 31' })
      .set('Cookie', [`access_token=${vendedorCookies.accessToken}`]);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.items).toHaveLength(0);
  });
});
