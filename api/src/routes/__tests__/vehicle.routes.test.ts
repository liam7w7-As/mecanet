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
const TEST_EMAIL_PREFIX = 'phase32-';
const TEST_PLATE_PREFIX = 'PH32';

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

describe('Vehicle Routes (E2E)', () => {
  let devUserId: number;
  let vendedorUserId: number;
  let vendedorRoleId: number;
  let clientOneId: number;
  let clientTwoId: number;
  let associatedVehicleId: number;

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

    const passwordHash = await hashPassword(TEST_PASSWORD);
    const [devUser, vendedorRole] = await Promise.all([
      User.findOne({ where: { email: 'dev@unithor.local' } }),
      Role.findOne({ where: { nombre: 'vendedor' } }),
    ]);

    if (!devUser || !vendedorRole) {
      throw new Error('No se encontraron usuarios o roles base para vehicle.routes.test');
    }

    await devUser.update({ passwordHash, activo: true });
    devUserId = devUser.id;
    vendedorRoleId = vendedorRole.id;

    const [vendedorUser, clientOne, clientTwo] = await Promise.all([
      User.create({
        nombre: 'Vendedor Fase 32',
        email: `${TEST_EMAIL_PREFIX}vendedor@unithor.local`,
        passwordHash,
        roleId: vendedorRoleId,
        activo: true,
      }),
      Client.create({
        rut: '76320001',
        nombre: 'Cliente Vehiculo Uno Fase 32',
        tipo: 'cliente',
        email: `${TEST_EMAIL_PREFIX}client-one@unithor.local`,
        telefono: '+56 9 3200 0001',
      }),
      Client.create({
        rut: '76320002',
        nombre: 'Cliente Vehiculo Dos Fase 32',
        tipo: 'empresa',
        email: `${TEST_EMAIL_PREFIX}client-two@unithor.local`,
        telefono: '+56 9 3200 0002',
      }),
    ]);

    vendedorUserId = vendedorUser.id;
    clientOneId = clientOne.id;
    clientTwoId = clientTwo.id;
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
      where: { userId: [devUserId, vendedorUserId] },
      force: true,
    });
    await User.destroy({
      where: { id: [vendedorUserId] },
      force: true,
    });
  });

  it('requiere autenticación para listar vehículos', async () => {
    const response = await request(app).get('/api/vehicles');
    expect(response.status).toBe(401);
  });

  it('crea vehículo con patente normalizada a mayúsculas sin espacios ni guiones', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);

    const response = await request(app)
      .post('/api/vehicles')
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        patente: 'ph 32-01',
        marca: 'Toyota',
        modelo: 'Yaris',
        ano: 2021,
        vinChasis: 'vin fase 32',
      });

    expect(response.status).toBe(201);
    expect(response.body.vehicle).toMatchObject({
      patente: 'PH3201',
      marca: 'Toyota',
      modelo: 'Yaris',
      vinChasis: 'VIN FASE 32',
      clientId: null,
    });

    const stored = await Vehicle.findOne({ where: { patente: 'PH3201' } });
    expect(stored?.patente).toBe('PH3201');
  });

  it('responde 409 al registrar una patente existente', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);

    const response = await request(app)
      .post('/api/vehicles')
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        patente: 'PH-32 01',
        marca: 'Toyota',
      });

    expect(response.status).toBe(409);
    expect(response.body.error.message).toBe('Ya existe un vehículo con esa patente');
  });

  it('crea vehículo asociado a un cliente y lo devuelve con datos del dueño', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);

    const createResponse = await request(app)
      .post('/api/vehicles')
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        patente: 'ph3202',
        marca: 'Nissan',
        modelo: 'Versa',
        clientId: clientOneId,
      });

    expect(createResponse.status).toBe(201);
    associatedVehicleId = createResponse.body.vehicle.id as number;
    expect(createResponse.body.vehicle.client).toMatchObject({
      id: clientOneId,
      nombre: 'Cliente Vehiculo Uno Fase 32',
      tipo: 'cliente',
    });

    const getResponse = await request(app)
      .get(`/api/vehicles/${associatedVehicleId}`)
      .set('Cookie', [`access_token=${vendedorCookies.accessToken}`]);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.vehicle.client).toMatchObject({
      id: clientOneId,
      rut: '76320001',
      telefono: '+56 9 3200 0001',
    });
  });

  it('permite crear un vehículo sin cliente asignado', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);

    const response = await request(app)
      .post('/api/vehicles')
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        patente: 'ph3203',
        marca: 'Kia',
        clientId: null,
      });

    expect(response.status).toBe(201);
    expect(response.body.vehicle.clientId).toBeNull();
    expect(response.body.vehicle.client).toBeNull();
  });

  it('busca por patente exacta normalizada', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);

    const response = await request(app)
      .get('/api/vehicles/patente/ph-3202')
      .set('Cookie', [`access_token=${vendedorCookies.accessToken}`]);

    expect(response.status).toBe(200);
    expect(response.body.vehicle).toMatchObject({
      id: associatedVehicleId,
      patente: 'PH3202',
    });
  });

  it('reasigna el vehículo a otro cliente mediante PATCH', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);

    const response = await request(app)
      .patch(`/api/vehicles/${associatedVehicleId}`)
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        clientId: clientTwoId,
        kilometraje: 45500,
      });

    expect(response.status).toBe(200);
    expect(response.body.vehicle.clientId).toBe(clientTwoId);
    expect(response.body.vehicle.kilometraje).toBe(45500);
    expect(response.body.vehicle.client).toMatchObject({
      id: clientTwoId,
      nombre: 'Cliente Vehiculo Dos Fase 32',
      tipo: 'empresa',
    });
  });

  it('aplica soft delete y excluye el vehículo eliminado de búsquedas ordinarias', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);
    const vehicle = await Vehicle.create({
      patente: 'PH3299',
      marca: 'Hyundai',
      modelo: 'Accent',
      clientId: clientOneId,
    });

    const deleteResponse = await request(app)
      .delete(`/api/vehicles/${vehicle.id}`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken);
    expect(deleteResponse.status).toBe(204);

    const deleted = await Vehicle.findByPk(vehicle.id, { paranoid: false });
    expect(deleted?.deletedAt).not.toBeNull();

    const listResponse = await request(app)
      .get('/api/vehicles')
      .query({ search: 'PH3299' })
      .set('Cookie', [`access_token=${vendedorCookies.accessToken}`]);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.items).toHaveLength(0);
  });
});
