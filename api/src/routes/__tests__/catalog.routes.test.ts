import { Op } from 'sequelize';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { CatalogItem } from '../../models/CatalogItem.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { hashPassword } from '../../utils/password.js';

const TEST_PASSWORD = 'Desarrollador2026!';
const TEST_EMAIL_PREFIX = 'phase61-';
const TEST_CODE_PREFIX = 'PH61-';
const TEST_NAME_MARKER = 'Fase 61';

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

const removeCatalogFixtures = async (): Promise<void> => {
  await CatalogItem.destroy({
    where: {
      [Op.or]: [
        { codigo: { [Op.like]: `${TEST_CODE_PREFIX}%` } },
        { nombre: { [Op.like]: `%${TEST_NAME_MARKER}%` } },
      ],
    },
    force: true,
  });
};

const removeUserFixtures = async (): Promise<void> => {
  const users = await User.findAll({
    where: { email: { [Op.like]: `${TEST_EMAIL_PREFIX}%` } },
    paranoid: false,
  });
  const userIds = users.map((user) => user.id);
  if (userIds.length > 0) {
    await RefreshToken.destroy({ where: { userId: userIds }, force: true });
    await User.destroy({ where: { id: userIds }, force: true });
  }
};

describe('Catalog Routes (E2E)', () => {
  let devUserId: number;
  let bodegueroUserId: number;
  let bodegueroEmail: string;
  let standardItemId: number;
  let partItemId: number;
  let zeroStockPartId: number;

  beforeAll(async () => {
    await sequelize.authenticate();
    await removeCatalogFixtures();
    await removeUserFixtures();

    const passwordHash = await hashPassword(TEST_PASSWORD);
    const [devUser, bodegueroRole] = await Promise.all([
      User.findOne({ where: { email: 'dev@unithor.local' } }),
      Role.findOne({ where: { nombre: 'bodeguero' } }),
    ]);
    if (!devUser || !bodegueroRole) {
      throw new Error('No se encontraron los usuarios o roles base para catalog.routes.test');
    }

    await devUser.update({ passwordHash, activo: true });
    devUserId = devUser.id;
    bodegueroEmail = `${TEST_EMAIL_PREFIX}bodeguero@unithor.local`;

    const bodeguero = await User.create({
      nombre: 'Bodeguero Catálogo Fase 61',
      email: bodegueroEmail,
      passwordHash,
      roleId: bodegueroRole.id,
      activo: true,
    });
    bodegueroUserId = bodeguero.id;
  });

  afterAll(async () => {
    await removeCatalogFixtures();
    await RefreshToken.destroy({
      where: { userId: [devUserId, bodegueroUserId] },
      force: true,
    });
    await removeUserFixtures();
  });

  it('requiere autenticación para listar el catálogo', async () => {
    const response = await request(app).get('/api/catalog');
    expect(response.status).toBe(401);
  });

  it('fuerza stock cero al crear servicios estándar y específicos', async () => {
    const cookies = await loginAs('dev@unithor.local');

    const standardResponse = await request(app)
      .post('/api/catalog')
      .set('Cookie', authCookie(cookies))
      .set('X-CSRF-Token', cookies.csrfToken)
      .send({
        tipo: 'estandar',
        codigo: `${TEST_CODE_PREFIX}SRV-01`,
        nombre: `Servicio estándar ${TEST_NAME_MARKER}`,
        descripcion: 'Servicio de mantenimiento programado',
        precio: 25000,
        stock: 12,
      });

    expect(standardResponse.status).toBe(201);
    expect(standardResponse.body.item).toMatchObject({
      tipo: 'estandar',
      stock: 0,
      precio: 25000,
    });
    standardItemId = standardResponse.body.item.id as number;

    const specificResponse = await request(app)
      .post('/api/catalog')
      .set('Cookie', authCookie(cookies))
      .set('X-CSRF-Token', cookies.csrfToken)
      .send({
        tipo: 'especifico',
        nombre: `Diagnóstico específico ${TEST_NAME_MARKER}`,
        precio: 18000,
        stock: 7,
      });

    expect(specificResponse.status).toBe(201);
    expect(specificResponse.body.item).toMatchObject({
      tipo: 'especifico',
      codigo: null,
      stock: 0,
    });
  });

  it('crea un repuesto con código normalizado y stock inicial', async () => {
    const cookies = await loginAs('dev@unithor.local');
    const response = await request(app)
      .post('/api/catalog')
      .set('Cookie', authCookie(cookies))
      .set('X-CSRF-Token', cookies.csrfToken)
      .send({
        tipo: 'parte',
        codigo: `  ${TEST_CODE_PREFIX.toLowerCase()}rep-01  `,
        nombre: `Repuesto ${TEST_NAME_MARKER} Principal`,
        descripcion: 'Filtro para prueba de inventario',
        precio: 12500,
        stock: 10,
      });

    expect(response.status).toBe(201);
    expect(response.body.item).toMatchObject({
      tipo: 'parte',
      codigo: `${TEST_CODE_PREFIX}REP-01`,
      stock: 10,
    });
    partItemId = response.body.item.id as number;
  });

  it('responde 409 al registrar un código activo repetido', async () => {
    const cookies = await loginAs('dev@unithor.local');
    const response = await request(app)
      .post('/api/catalog')
      .set('Cookie', authCookie(cookies))
      .set('X-CSRF-Token', cookies.csrfToken)
      .send({
        tipo: 'parte',
        codigo: `${TEST_CODE_PREFIX.toLowerCase()}rep-01`,
        nombre: `Repuesto duplicado ${TEST_NAME_MARKER}`,
        stock: 1,
      });

    expect(response.status).toBe(409);
    expect(response.body.error.message).toBe('Ya existe un item con ese código');
  });

  it('permite al bodeguero incrementar y reducir stock disponible', async () => {
    const cookies = await loginAs(bodegueroEmail);
    const incrementResponse = await request(app)
      .post(`/api/catalog/${partItemId}/stock`)
      .set('Cookie', authCookie(cookies))
      .set('X-CSRF-Token', cookies.csrfToken)
      .send({ delta: 5, motivo: 'Ingreso proveedor' });

    expect(incrementResponse.status).toBe(200);
    expect(incrementResponse.body).toMatchObject({
      stockAnterior: 10,
      nuevoStock: 15,
      delta: 5,
      motivo: 'Ingreso proveedor',
      item: { id: partItemId, stock: 15 },
    });

    const reductionResponse = await request(app)
      .post(`/api/catalog/${partItemId}/stock`)
      .set('Cookie', authCookie(cookies))
      .set('X-CSRF-Token', cookies.csrfToken)
      .send({ delta: -4, motivo: 'Consumo taller' });

    expect(reductionResponse.status).toBe(200);
    expect(reductionResponse.body).toMatchObject({
      stockAnterior: 15,
      nuevoStock: 11,
      delta: -4,
      item: { stock: 11 },
    });
  });

  it('rechaza una rebaja superior al stock disponible', async () => {
    const cookies = await loginAs(bodegueroEmail);
    const response = await request(app)
      .post(`/api/catalog/${partItemId}/stock`)
      .set('Cookie', authCookie(cookies))
      .set('X-CSRF-Token', cookies.csrfToken)
      .send({ delta: -12, motivo: 'Rebaja inválida' });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe(
      'Stock insuficiente. Stock actual: 11, intento de rebaja: 12',
    );

    const item = await CatalogItem.findByPk(partItemId);
    expect(item?.stock).toBe(11);
  });

  it('rechaza ajustes de inventario para servicios', async () => {
    const cookies = await loginAs(bodegueroEmail);
    const response = await request(app)
      .post(`/api/catalog/${standardItemId}/stock`)
      .set('Cookie', authCookie(cookies))
      .set('X-CSRF-Token', cookies.csrfToken)
      .send({ delta: 2 });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe(
      'Solo los repuestos (tipo parte) manejan inventario de stock',
    );
  });

  it('obtiene y actualiza un item sin permitir stock en servicios', async () => {
    const cookies = await loginAs('dev@unithor.local');
    const updateResponse = await request(app)
      .patch(`/api/catalog/${standardItemId}`)
      .set('Cookie', authCookie(cookies))
      .set('X-CSRF-Token', cookies.csrfToken)
      .send({ precio: 29000, stock: 99 });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.item).toMatchObject({
      id: standardItemId,
      precio: 29000,
      stock: 0,
    });

    const getResponse = await request(app)
      .get(`/api/catalog/${standardItemId}`)
      .set('Cookie', authCookie(cookies));
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.item.precio).toBe(29000);
  });

  it('lista con paginación, búsqueda, tipo y filtro de stock', async () => {
    const cookies = await loginAs(bodegueroEmail);
    const createCookies = await loginAs('dev@unithor.local');
    const createResponse = await request(app)
      .post('/api/catalog')
      .set('Cookie', authCookie(createCookies))
      .set('X-CSRF-Token', createCookies.csrfToken)
      .send({
        tipo: 'parte',
        codigo: `${TEST_CODE_PREFIX}REP-02`,
        nombre: `Repuesto ${TEST_NAME_MARKER} Secundario`,
        precio: 8000,
        stock: 0,
      });
    expect(createResponse.status).toBe(201);
    zeroStockPartId = createResponse.body.item.id as number;

    const paginatedResponse = await request(app)
      .get('/api/catalog')
      .query({ tipo: 'parte', search: `Repuesto ${TEST_NAME_MARKER}`, page: 1, pageSize: 1 })
      .set('Cookie', authCookie(cookies));

    expect(paginatedResponse.status).toBe(200);
    expect(paginatedResponse.body).toMatchObject({
      total: 2,
      page: 1,
      pageSize: 1,
      totalPages: 2,
    });
    expect(paginatedResponse.body.items).toHaveLength(1);

    const stockResponse = await request(app)
      .get('/api/catalog')
      .query({ search: `Repuesto ${TEST_NAME_MARKER}`, soloConStock: true })
      .set('Cookie', authCookie(cookies));

    expect(stockResponse.status).toBe(200);
    expect(stockResponse.body.total).toBe(1);
    expect(stockResponse.body.items[0]).toMatchObject({ id: partItemId, stock: 11 });
  });

  it('aplica soft delete y excluye el item de consultas ordinarias', async () => {
    const cookies = await loginAs('dev@unithor.local');
    const response = await request(app)
      .delete(`/api/catalog/${zeroStockPartId}`)
      .set('Cookie', authCookie(cookies))
      .set('X-CSRF-Token', cookies.csrfToken);

    expect(response.status).toBe(204);
    expect(await CatalogItem.findByPk(zeroStockPartId)).toBeNull();

    const deleted = await CatalogItem.findByPk(zeroStockPartId, { paranoid: false });
    expect(deleted).not.toBeNull();
    expect(deleted?.deletedAt).not.toBeNull();
  });
});
