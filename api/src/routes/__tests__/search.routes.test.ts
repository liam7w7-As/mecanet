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
const TEST_EMAIL_PREFIX = 'phase33-';
const TEST_PLATE_PREFIX = 'PH33';

interface LoginCookies {
  accessToken: string;
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
  };
};

describe('Search Routes (E2E)', () => {
  let vendedorUserId: number;
  let clientId: number;
  let vehicleId: number;

  beforeAll(async () => {
    await sequelize.authenticate();

    const existingVehicles = await Vehicle.findAll({
      where: { patente: { [Op.like]: `${TEST_PLATE_PREFIX}%` } },
      paranoid: false,
    });
    await Vehicle.destroy({
      where: { id: existingVehicles.map((vehicle) => vehicle.id) },
      force: true,
    });

    const existingClients = await Client.findAll({
      where: { email: { [Op.like]: `${TEST_EMAIL_PREFIX}%` } },
      paranoid: false,
    });
    await Client.destroy({
      where: { id: existingClients.map((client) => client.id) },
      force: true,
    });

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

    const [devUser, vendedorRole] = await Promise.all([
      User.findOne({ where: { email: 'dev@unithor.local' } }),
      Role.findOne({ where: { nombre: 'vendedor' } }),
    ]);

    if (!devUser || !vendedorRole) {
      throw new Error('No se encontraron usuarios o roles base para search.routes.test');
    }

    const passwordHash = await hashPassword(TEST_PASSWORD);
    await devUser.update({ passwordHash, activo: true });

    const vendedorUser = await User.create({
      nombre: 'Vendedor Fase 33',
      email: `${TEST_EMAIL_PREFIX}vendedor@unithor.local`,
      passwordHash,
      roleId: vendedorRole.id,
      activo: true,
    });
    vendedorUserId = vendedorUser.id;

    const client = await Client.create({
      rut: '76330001',
      nombre: 'Cliente Busqueda Fase 33',
      tipo: 'cliente',
      email: `${TEST_EMAIL_PREFIX}client@unithor.local`,
      telefono: '+56 9 3300 0001',
    });
    clientId = client.id;

    const vehicle = await Vehicle.create({
      patente: 'PH3301',
      marca: 'Mazda',
      modelo: 'CX5',
      ano: 2022,
      vinChasis: 'VINPH3301',
      clientId,
    });
    vehicleId = vehicle.id;

    const deletedClient = await Client.create({
      rut: '76339999',
      nombre: 'Cliente Eliminado Fase 33',
      tipo: 'cliente',
      email: `${TEST_EMAIL_PREFIX}deleted-client@unithor.local`,
      telefono: '+56 9 3399 9999',
    });
    const deletedVehicle = await Vehicle.create({
      patente: 'PH3399',
      marca: 'Soft',
      modelo: 'Deleted',
      clientId: deletedClient.id,
    });
    await deletedVehicle.destroy();
    await deletedClient.destroy();
  });

  afterAll(async () => {
    const testVehicles = await Vehicle.findAll({
      where: { patente: { [Op.like]: `${TEST_PLATE_PREFIX}%` } },
      paranoid: false,
    });
    await Vehicle.destroy({
      where: { id: testVehicles.map((vehicle) => vehicle.id) },
      force: true,
    });

    const testClients = await Client.findAll({
      where: { email: { [Op.like]: `${TEST_EMAIL_PREFIX}%` } },
      paranoid: false,
    });
    await Client.destroy({
      where: { id: testClients.map((client) => client.id) },
      force: true,
    });

    await RefreshToken.destroy({
      where: { userId: [vendedorUserId] },
      force: true,
    });
    await User.destroy({
      where: { id: [vendedorUserId] },
      force: true,
    });
  });

  it('requiere autenticación para búsqueda rápida', async () => {
    const response = await request(app).get('/api/search/quick').query({ q: '763' });
    expect(response.status).toBe(401);
  });

  it('quickSearch por RUT devuelve cliente y conteo de vehículos asociados', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);

    const response = await request(app)
      .get('/api/search/quick')
      .query({ q: '76330001' })
      .set('Cookie', [`access_token=${vendedorCookies.accessToken}`]);

    expect(response.status).toBe(200);
    expect(response.body.clients).toEqual([
      expect.objectContaining({
        id: clientId,
        rut: '76330001',
        nombre: 'Cliente Busqueda Fase 33',
        vehiclesCount: 1,
      }),
    ]);
  });

  it('quickSearch por patente devuelve vehículo y datos del dueño', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);

    const response = await request(app)
      .get('/api/search/quick')
      .query({ q: 'ph-3301' })
      .set('Cookie', [`access_token=${vendedorCookies.accessToken}`]);

    expect(response.status).toBe(200);
    expect(response.body.vehicles).toEqual([
      expect.objectContaining({
        id: vehicleId,
        patente: 'PH3301',
        marca: 'Mazda',
        modelo: 'CX5',
        client: expect.objectContaining({
          id: clientId,
          nombre: 'Cliente Busqueda Fase 33',
          rut: '76330001',
        }),
      }),
    ]);
  });

  it('rechaza quickSearch con término de un caracter', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);

    const response = await request(app)
      .get('/api/search/quick')
      .query({ q: 'p' })
      .set('Cookie', [`access_token=${vendedorCookies.accessToken}`]);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('lookupPlate devuelve exists true con vehículo y cliente', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);

    const response = await request(app)
      .get('/api/search/plate/ph-3301')
      .set('Cookie', [`access_token=${vendedorCookies.accessToken}`]);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      exists: true,
      vehicle: {
        id: vehicleId,
        patente: 'PH3301',
        marca: 'Mazda',
        clientId,
      },
      client: {
        id: clientId,
        nombre: 'Cliente Busqueda Fase 33',
        rut: '76330001',
      },
    });
  });

  it('lookupPlate devuelve exists false para patente inexistente', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);

    const response = await request(app)
      .get('/api/search/plate/PH3300')
      .set('Cookie', [`access_token=${vendedorCookies.accessToken}`]);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      exists: false,
      vehicle: null,
      client: null,
    });
  });

  it('ignora clientes y vehículos con soft delete en resultados de búsqueda', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);

    const quickResponse = await request(app)
      .get('/api/search/quick')
      .query({ q: '3399' })
      .set('Cookie', [`access_token=${vendedorCookies.accessToken}`]);

    expect(quickResponse.status).toBe(200);
    expect(quickResponse.body.clients).toHaveLength(0);
    expect(quickResponse.body.vehicles).toHaveLength(0);

    const lookupResponse = await request(app)
      .get('/api/search/plate/PH3399')
      .set('Cookie', [`access_token=${vendedorCookies.accessToken}`]);

    expect(lookupResponse.status).toBe(200);
    expect(lookupResponse.body).toEqual({
      exists: false,
      vehicle: null,
      client: null,
    });
  });
});
