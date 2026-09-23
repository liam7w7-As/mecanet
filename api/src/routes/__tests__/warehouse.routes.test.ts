import { Op } from 'sequelize';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { CatalogItem } from '../../models/CatalogItem.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { StockBalance } from '../../models/StockBalance.js';
import { StockMovement } from '../../models/StockMovement.js';
import { User } from '../../models/User.js';
import { Warehouse } from '../../models/Warehouse.js';
import { hashPassword } from '../../utils/password.js';

const TEST_PASSWORD = 'Desarrollador2026!';
const TEST_EMAIL_PREFIX = 'phase62-';
const TEST_CODE_PREFIX = 'WH62-';
const TEST_NAME_MARKER = 'Fase 62';

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

    cookies[pair.slice(0, separatorIndex).trim()] = pair.slice(separatorIndex + 1).trim();
    return cookies;
  }, {});
};

const loginAs = async (email: string): Promise<LoginCookies> => {
  const response = await request(app).post('/api/auth/login').send({ email, password: TEST_PASSWORD });

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

describe('Warehouse Routes (E2E)', () => {
  let devUserId: number;
  let bodegueroUserId: number;
  let vendedorUserId: number;
  let partItemId: number;
  let serviceItemId: number;
  let warehouseId: number;

  beforeAll(async () => {
    await sequelize.authenticate();

    const passwordHash = await hashPassword(TEST_PASSWORD);
    const [devUser, bodegueroRole, vendedorRole] = await Promise.all([
      User.findOne({ where: { email: 'dev@unithor.local' } }),
      Role.findOne({ where: { nombre: 'bodeguero' } }),
      Role.findOne({ where: { nombre: 'vendedor' } }),
    ]);
    if (!devUser || !bodegueroRole || !vendedorRole) {
      throw new Error('No se encontraron los usuarios o roles base para warehouse.routes.test');
    }

    await devUser.update({ passwordHash, activo: true });
    devUserId = devUser.id;

    const [bodeguero, vendedor] = await Promise.all([
      User.create({
        nombre: `Bodeguero Almacén ${TEST_NAME_MARKER}`,
        email: `${TEST_EMAIL_PREFIX}bodeguero@unithor.local`,
        passwordHash,
        roleId: bodegueroRole.id,
        activo: true,
      }),
      User.create({
        nombre: `Vendedor Almacén ${TEST_NAME_MARKER}`,
        email: `${TEST_EMAIL_PREFIX}vendedor@unithor.local`,
        passwordHash,
        roleId: vendedorRole.id,
        activo: true,
      }),
    ]);
    bodegueroUserId = bodeguero.id;
    vendedorUserId = vendedor.id;

    const [part, service] = await Promise.all([
      CatalogItem.create({
        tipo: 'parte',
        codigo: `${TEST_CODE_PREFIX}PRT-01`,
        nombre: `Repuesto ${TEST_NAME_MARKER}`,
        descripcion: null,
        precio: 5000,
        stock: 0,
      }),
      CatalogItem.create({
        tipo: 'estandar',
        codigo: null,
        nombre: `Servicio ${TEST_NAME_MARKER}`,
        descripcion: null,
        precio: 10000,
        stock: 0,
      }),
    ]);
    partItemId = part.id;
    serviceItemId = service.id;
  });

  afterAll(async () => {
    await StockMovement.destroy({ where: { catalogItemId: [partItemId, serviceItemId] }, force: true });
    await StockBalance.destroy({ where: { catalogItemId: [partItemId, serviceItemId] }, force: true });
    await Warehouse.destroy({ where: { codigo: { [Op.like]: `${TEST_CODE_PREFIX}%` } }, force: true });
    await CatalogItem.destroy({ where: { id: [partItemId, serviceItemId] }, force: true });
    await RefreshToken.destroy({ where: { userId: [devUserId, bodegueroUserId, vendedorUserId] }, force: true });
    await User.destroy({ where: { id: [bodegueroUserId, vendedorUserId] }, force: true });
  });

  it('requiere autenticación para listar almacenes', async () => {
    const response = await request(app).get('/api/warehouses');
    expect(response.status).toBe(401);
  });

  it('crea un almacén y rechaza códigos duplicados', async () => {
    const cookies = await loginAs('dev@unithor.local');

    const created = await request(app)
      .post('/api/warehouses')
      .set('Cookie', authCookie(cookies))
      .set('X-CSRF-Token', cookies.csrfToken)
      .send({ codigo: `${TEST_CODE_PREFIX}BOD-01`, nombre: `Bodega ${TEST_NAME_MARKER}` });

    expect(created.status).toBe(201);
    expect(created.body.warehouse.codigo).toBe(`${TEST_CODE_PREFIX}BOD-01`);
    warehouseId = created.body.warehouse.id;

    const duplicated = await request(app)
      .post('/api/warehouses')
      .set('Cookie', authCookie(cookies))
      .set('X-CSRF-Token', cookies.csrfToken)
      .send({ codigo: `${TEST_CODE_PREFIX}BOD-01`, nombre: 'Otra bodega' });

    expect(duplicated.status).toBe(409);
  });

  it('registra ingreso, salida y valida stock insuficiente', async () => {
    const cookies = await loginAs('dev@unithor.local');
    const headers = { Cookie: authCookie(cookies), 'X-CSRF-Token': cookies.csrfToken };
    const payload = { catalogItemId: partItemId, warehouseId, motivo: `Movimiento ${TEST_NAME_MARKER}` };

    const ingreso = await request(app).post('/api/warehouses/movements').set(headers).send({
      ...payload,
      tipo: 'ingreso',
      cantidad: 10,
    });
    expect(ingreso.status).toBe(201);
    expect(ingreso.body.movement.saldoResultante).toBe(10);

    const salida = await request(app).post('/api/warehouses/movements').set(headers).send({
      ...payload,
      tipo: 'salida',
      cantidad: 4,
    });
    expect(salida.status).toBe(201);
    expect(salida.body.movement.saldoResultante).toBe(6);

    const sinStock = await request(app).post('/api/warehouses/movements').set(headers).send({
      ...payload,
      tipo: 'salida',
      cantidad: 99,
    });
    expect(sinStock.status).toBe(400);
  });

  it('rechaza movimientos de servicios sin stock', async () => {
    const cookies = await loginAs('dev@unithor.local');

    const response = await request(app)
      .post('/api/warehouses/movements')
      .set('Cookie', authCookie(cookies))
      .set('X-CSRF-Token', cookies.csrfToken)
      .send({
        catalogItemId: serviceItemId,
        warehouseId,
        tipo: 'ingreso',
        cantidad: 1,
        motivo: `Movimiento ${TEST_NAME_MARKER}`,
      });

    expect(response.status).toBe(400);
  });

  it('expone saldos y kardex por ítem', async () => {
    const cookies = await loginAs('dev@unithor.local');
    const headers = { Cookie: authCookie(cookies) };

    const balances = await request(app).get(`/api/warehouses/${warehouseId}/balances`).set(headers);
    expect(balances.status).toBe(200);
    expect(balances.body.balances).toEqual(
      expect.arrayContaining([expect.objectContaining({ catalogItemId: partItemId, cantidad: 6 })]),
    );

    const kardex = await request(app)
      .get('/api/warehouses/movements/all')
      .query({ catalogItemId: partItemId, warehouseId })
      .set(headers);
    expect(kardex.status).toBe(200);
    expect(kardex.body.total).toBeGreaterThanOrEqual(2);
    expect(kardex.body.items[0]).toEqual(
      expect.objectContaining({ catalogItemId: partItemId, warehouseId }),
    );
  });

  it('permite al bodeguero crear movimientos pero no al vendedor', async () => {
    const bodegueroCookies = await loginAs(`${TEST_EMAIL_PREFIX}bodeguero@unithor.local`);
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);

    const allowed = await request(app)
      .post('/api/warehouses/movements')
      .set('Cookie', authCookie(bodegueroCookies))
      .set('X-CSRF-Token', bodegueroCookies.csrfToken)
      .send({
        catalogItemId: partItemId,
        warehouseId,
        tipo: 'ingreso',
        cantidad: 1,
        motivo: `Movimiento ${TEST_NAME_MARKER}`,
      });
    expect(allowed.status).toBe(201);

    const forbidden = await request(app)
      .post('/api/warehouses/movements')
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        catalogItemId: partItemId,
        warehouseId,
        tipo: 'ingreso',
        cantidad: 1,
        motivo: `Movimiento ${TEST_NAME_MARKER}`,
      });
    expect(forbidden.status).toBe(403);
  });

  it('traslada stock con doble entrada y referencia común', async () => {
    const cookies = await loginAs('dev@unithor.local');
    const headers = { Cookie: authCookie(cookies), 'X-CSRF-Token': cookies.csrfToken };

    const destino = await request(app)
      .post('/api/warehouses')
      .set(headers)
      .send({ codigo: `${TEST_CODE_PREFIX}BOD-02`, nombre: `Bodega destino ${TEST_NAME_MARKER}` });
    expect(destino.status).toBe(201);
    const destinationId = destino.body.warehouse.id as number;

    const transfer = await request(app)
      .post('/api/warehouses/transfers')
      .set(headers)
      .send({
        catalogItemId: partItemId,
        originWarehouseId: warehouseId,
        destinationWarehouseId: destinationId,
        cantidad: 2,
        motivo: `Traslado ${TEST_NAME_MARKER}`,
      });

    expect(transfer.status).toBe(201);
    expect(transfer.body.salida.tipo).toBe('traslado_salida');
    expect(transfer.body.ingreso.tipo).toBe('traslado_ingreso');
    expect(transfer.body.ingreso.referencia).toBe(transfer.body.referencia);
    expect(transfer.body.salida.referencia).toBe(transfer.body.referencia);

    const originBalances = await request(app).get(`/api/warehouses/${warehouseId}/balances`).set(headers);
    const destinationBalances = await request(app).get(`/api/warehouses/${destinationId}/balances`).set(headers);
    expect(
      originBalances.body.balances.find((balance: { catalogItemId: number }) => balance.catalogItemId === partItemId),
    ).toEqual(expect.objectContaining({ cantidad: 5 }));
    expect(
      destinationBalances.body.balances.find((balance: { catalogItemId: number }) => balance.catalogItemId === partItemId),
    ).toEqual(expect.objectContaining({ cantidad: 2 }));
  });

  it('rechaza traslados al mismo almacén o sin stock', async () => {
    const cookies = await loginAs('dev@unithor.local');
    const headers = { Cookie: authCookie(cookies), 'X-CSRF-Token': cookies.csrfToken };

    const sameWarehouse = await request(app)
      .post('/api/warehouses/transfers')
      .set(headers)
      .send({
        catalogItemId: partItemId,
        originWarehouseId: warehouseId,
        destinationWarehouseId: warehouseId,
        cantidad: 1,
        motivo: `Traslado ${TEST_NAME_MARKER}`,
      });
    expect(sameWarehouse.status).toBe(400);

    const warehouses = await request(app).get('/api/warehouses').set(headers);
    const otherWarehouse = (warehouses.body.items as { id: number }[]).find((item) => item.id !== warehouseId);
    expect(otherWarehouse).toBeDefined();

    const withoutStock = await request(app)
      .post('/api/warehouses/transfers')
      .set(headers)
      .send({
        catalogItemId: partItemId,
        originWarehouseId: warehouseId,
        destinationWarehouseId: otherWarehouse?.id,
        cantidad: 9999,
        motivo: `Traslado ${TEST_NAME_MARKER}`,
      });
    expect(withoutStock.status).toBe(400);
  });
});
