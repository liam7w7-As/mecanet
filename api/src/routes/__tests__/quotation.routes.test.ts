import { Op } from 'sequelize';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { Client } from '../../models/Client.js';
import { Payment } from '../../models/Payment.js';
import { Quotation } from '../../models/Quotation.js';
import { QuotationItem } from '../../models/QuotationItem.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { Vehicle } from '../../models/Vehicle.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { WorkOrderItem } from '../../models/WorkOrderItem.js';
import { hashPassword } from '../../utils/password.js';

const TEST_PASSWORD = 'Desarrollador2026!';
const TEST_EMAIL_PREFIX = 'phase51-';
const TEST_PLATE_PREFIX = 'PH51';
const TEST_YEAR = new Date().getFullYear();
const TEST_COT_PREFIX = `COT-${TEST_YEAR}-`;
const TEST_OT_PREFIX = `OT-${TEST_YEAR}-51`;

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

const deleteCurrentYearQuotations = async (): Promise<void> => {
  const quotations = await Quotation.findAll({
    where: { codigo: { [Op.like]: `${TEST_COT_PREFIX}%` } },
    paranoid: false,
  });
  const quotationIds = quotations.map((quotation) => quotation.id);

  if (quotationIds.length > 0) {
    await Payment.destroy({ where: { quotationId: quotationIds } });
    await QuotationItem.destroy({ where: { quotationId: quotationIds } });
    await Quotation.destroy({ where: { id: quotationIds }, force: true });
  }
};

const deleteTestWorkOrders = async (): Promise<void> => {
  const workOrders = await WorkOrder.findAll({
    where: { codigo: { [Op.like]: `${TEST_OT_PREFIX}%` } },
    paranoid: false,
  });
  const workOrderIds = workOrders.map((workOrder) => workOrder.id);

  if (workOrderIds.length > 0) {
    await WorkOrderItem.destroy({ where: { workOrderId: workOrderIds } });
    await WorkOrder.destroy({ where: { id: workOrderIds }, force: true });
  }
};

describe('Quotation Routes (E2E)', () => {
  let devUserId: number;
  let vendedorUserId: number;
  let bodegueroUserId: number;
  let clientId: number;
  let vehicleId: number;
  let workOrderId: number;

  beforeAll(async () => {
    await sequelize.authenticate();
    await deleteCurrentYearQuotations();
    await deleteTestWorkOrders();

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
    const [devUser, vendedorRole, bodegueroRole] = await Promise.all([
      User.findOne({ where: { email: 'dev@unithor.local' } }),
      Role.findOne({ where: { nombre: 'vendedor' } }),
      Role.findOne({ where: { nombre: 'bodeguero' } }),
    ]);

    if (!devUser || !vendedorRole || !bodegueroRole) {
      throw new Error('No se encontraron usuarios o roles base para quotation.routes.test');
    }

    await devUser.update({ passwordHash, activo: true });
    devUserId = devUser.id;

    const [vendedorUser, bodegueroUser, client] = await Promise.all([
      User.create({
        nombre: 'Vendedor Fase 51',
        email: `${TEST_EMAIL_PREFIX}vendedor@unithor.local`,
        passwordHash,
        roleId: vendedorRole.id,
        activo: true,
      }),
      User.create({
        nombre: 'Bodeguero Fase 51',
        email: `${TEST_EMAIL_PREFIX}bodeguero@unithor.local`,
        passwordHash,
        roleId: bodegueroRole.id,
        activo: true,
      }),
      Client.create({
        rut: '76510001',
        nombre: 'Cliente Cotización Fase 51',
        tipo: 'cliente',
        email: `${TEST_EMAIL_PREFIX}client@unithor.local`,
        telefono: '+56 9 5100 0001',
      }),
    ]);

    vendedorUserId = vendedorUser.id;
    bodegueroUserId = bodegueroUser.id;
    clientId = client.id;

    const vehicle = await Vehicle.create({
      patente: 'PH5101',
      marca: 'Mazda',
      modelo: 'BT-50',
      clientId,
    });
    vehicleId = vehicle.id;

    const workOrder = await WorkOrder.create({
      codigo: `${TEST_OT_PREFIX}01`,
      clientId,
      vehicleId,
      estado: 'en_progreso',
      descripcion: 'OT espejo para cotización fase 51',
      createdBy: devUserId,
    });
    workOrderId = workOrder.id;

    await WorkOrderItem.bulkCreate([
      {
        workOrderId,
        descripcion: 'Diagnóstico motor',
        cantidad: 1,
        precioUnitario: 25000,
        subtotal: 25000,
      },
      {
        workOrderId,
        descripcion: 'Kit mantención',
        cantidad: 2,
        precioUnitario: 18000,
        subtotal: 36000,
      },
    ]);
  });

  afterAll(async () => {
    await deleteCurrentYearQuotations();
    await deleteTestWorkOrders();

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
      where: { userId: [devUserId, vendedorUserId, bodegueroUserId] },
      force: true,
    });
    await User.destroy({
      where: { id: [vendedorUserId, bodegueroUserId] },
      force: true,
    });
  });

  it('requiere autenticación y permiso comercial:create', async () => {
    const noSessionResponse = await request(app).get('/api/quotations');
    expect(noSessionResponse.status).toBe(401);

    const bodegueroCookies = await loginAs(`${TEST_EMAIL_PREFIX}bodeguero@unithor.local`);
    const forbiddenResponse = await request(app)
      .post('/api/quotations')
      .set('Cookie', authCookie(bodegueroCookies))
      .set('X-CSRF-Token', bodegueroCookies.csrfToken)
      .send({
        clientId,
        notas: 'Intento sin permiso comercial create',
      });
    expect(forbiddenResponse.status).toBe(403);
  });

  it('crea COT independiente con correlativo secuencial único', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);

    const firstResponse = await request(app)
      .post('/api/quotations')
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        clientId,
        vehicleId,
        notas: 'Cotización independiente uno',
      });

    expect(firstResponse.status).toBe(201);
    expect(firstResponse.body.quotation.codigo).toBe(`COT-${TEST_YEAR}-0001`);

    const secondResponse = await request(app)
      .post('/api/quotations')
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        clientId,
        notas: 'Cotización independiente dos',
      });

    expect(secondResponse.status).toBe(201);
    expect(secondResponse.body.quotation.codigo).toBe(`COT-${TEST_YEAR}-0002`);
  });

  it('crea COT vinculada a OT copiando items, cliente y vehículo', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);

    const response = await request(app)
      .post('/api/quotations')
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        workOrderId,
        notas: 'Cotización espejo desde OT',
      });

    expect(response.status).toBe(201);
    expect(response.body.quotation).toMatchObject({
      workOrderId,
      clientId,
      vehicleId,
      subtotal: 61000,
      total: 61000,
      pagado: 0,
      estadoPago: 'por_pagar',
    });
    expect(response.body.quotation.items).toEqual([
      expect.objectContaining({
        descripcion: 'Diagnóstico motor',
        cantidad: 1,
        precioUnitario: 25000,
        subtotal: 25000,
      }),
      expect.objectContaining({
        descripcion: 'Kit mantención',
        cantidad: 2,
        precioUnitario: 18000,
        subtotal: 36000,
      }),
    ]);
  });

  it('rechaza vincular una segunda COT a la misma OT', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);

    const response = await request(app)
      .post('/api/quotations')
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({ workOrderId });

    expect(response.status).toBe(409);
    expect(response.body.error.message).toBe(
      'La orden de trabajo ya tiene una cotización vinculada',
    );
  });

  it('calcula total automáticamente a partir de items y permite reemplazarlos', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);

    const createResponse = await request(app)
      .post('/api/quotations')
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        clientId,
        items: [
          { descripcion: 'Servicio A', cantidad: 2, precioUnitario: 10000 },
          { descripcion: 'Servicio B', cantidad: 1, precioUnitario: 5000 },
        ],
      });
    expect(createResponse.status).toBe(201);
    expect(createResponse.body.quotation.total).toBe(25000);

    const quotationId = createResponse.body.quotation.id as number;
    const updateResponse = await request(app)
      .patch(`/api/quotations/${quotationId}`)
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        notas: 'Items reemplazados',
        items: [{ descripcion: 'Servicio C', cantidad: 3, precioUnitario: 7000 }],
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.quotation.total).toBe(21000);
    expect(updateResponse.body.quotation.items).toHaveLength(1);
    expect(updateResponse.body.quotation.items[0]).toMatchObject({
      descripcion: 'Servicio C',
      subtotal: 21000,
    });
  });

  it('rechaza borrar cotización con pagos simulados', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const quotation = await Quotation.create({
      codigo: `COT-${TEST_YEAR}-9001`,
      clientId,
      estadoPago: 'parcial',
      subtotal: 10000,
      total: 10000,
      pagado: 5000,
    });

    const response = await request(app)
      .delete(`/api/quotations/${quotation.id}`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken);

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe(
      'No se puede eliminar una cotización con pagos registrados',
    );
  });

  it('aplica soft delete a cotización sin pagos', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const quotation = await Quotation.create({
      codigo: `COT-${TEST_YEAR}-9002`,
      clientId,
      estadoPago: 'por_pagar',
      subtotal: 0,
      total: 0,
      pagado: 0,
    });

    const response = await request(app)
      .delete(`/api/quotations/${quotation.id}`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken);

    expect(response.status).toBe(204);

    const deleted = await Quotation.findByPk(quotation.id, { paranoid: false });
    expect(deleted?.deletedAt).not.toBeNull();
  });
});
