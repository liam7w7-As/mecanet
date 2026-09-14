import { Op } from 'sequelize';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { Client } from '../../models/Client.js';
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
const TEST_EMAIL_PREFIX = 'phase52-';
const TEST_PLATE_PREFIX = 'PH52';
const TEST_YEAR = new Date().getFullYear();
const TEST_COT_PREFIX = `COT-${TEST_YEAR}-52`;
const TEST_OT_PREFIX = `OT-${TEST_YEAR}-52`;

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

const createQuotationFixture = async (
  suffix: string,
  options: {
    clientId?: number | null;
    vehicleId?: number | null;
    workOrderId?: number | null;
    notas?: string | null;
  },
): Promise<Quotation> => {
  const quotation = await Quotation.create({
    codigo: `${TEST_COT_PREFIX}${suffix}`,
    workOrderId: options.workOrderId ?? null,
    clientId: options.clientId ?? null,
    vehicleId: options.vehicleId ?? null,
    estadoPago: 'por_pagar',
    subtotal: 61000,
    total: 61000,
    pagado: 0,
    notas: options.notas ?? null,
  });

  await QuotationItem.bulkCreate([
    {
      quotationId: quotation.id,
      descripcion: 'Diagnóstico electrónico',
      cantidad: 1,
      precioUnitario: 25000,
      subtotal: 25000,
    },
    {
      quotationId: quotation.id,
      descripcion: 'Cambio filtro habitáculo',
      cantidad: 2,
      precioUnitario: 18000,
      subtotal: 36000,
    },
  ]);

  return quotation;
};

const deleteTestQuotations = async (): Promise<void> => {
  const quotations = await Quotation.findAll({
    where: { codigo: { [Op.like]: `${TEST_COT_PREFIX}%` } },
    paranoid: false,
  });
  const quotationIds = quotations.map((quotation) => quotation.id);

  if (quotationIds.length > 0) {
    await QuotationItem.destroy({ where: { quotationId: quotationIds } });
    await Quotation.destroy({ where: { id: quotationIds }, force: true });
  }
};

const deleteTestWorkOrders = async (): Promise<void> => {
  const workOrders = await WorkOrder.findAll({
    where: {
      [Op.or]: [
        { codigo: { [Op.like]: `${TEST_OT_PREFIX}%` } },
        { descripcion: { [Op.like]: '%cotización fase 52%' } },
      ],
    },
    paranoid: false,
  });
  const workOrderIds = workOrders.map((workOrder) => workOrder.id);

  if (workOrderIds.length > 0) {
    await WorkOrderItem.destroy({ where: { workOrderId: workOrderIds } });
    await WorkOrder.destroy({ where: { id: workOrderIds }, force: true });
  }
};

describe('Quotation to Work Order Conversion (E2E)', () => {
  let devUserId: number;
  let bodegueroUserId: number;
  let clientId: number;
  let vehicleId: number;

  beforeAll(async () => {
    await sequelize.authenticate();
    await deleteTestQuotations();
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
    const [devUser, bodegueroRole] = await Promise.all([
      User.findOne({ where: { email: 'dev@unithor.local' } }),
      Role.findOne({ where: { nombre: 'bodeguero' } }),
    ]);

    if (!devUser || !bodegueroRole) {
      throw new Error('No se encontraron usuarios o roles base para quotation-convert.test');
    }

    await devUser.update({ passwordHash, activo: true });
    devUserId = devUser.id;

    const [bodegueroUser, client] = await Promise.all([
      User.create({
        nombre: 'Bodeguero Fase 52',
        email: `${TEST_EMAIL_PREFIX}bodeguero@unithor.local`,
        passwordHash,
        roleId: bodegueroRole.id,
        activo: true,
      }),
      Client.create({
        rut: '76520001',
        nombre: 'Cliente Conversión Fase 52',
        tipo: 'cliente',
        email: `${TEST_EMAIL_PREFIX}client@unithor.local`,
        telefono: '+56 9 5200 0001',
      }),
    ]);

    bodegueroUserId = bodegueroUser.id;
    clientId = client.id;

    const vehicle = await Vehicle.create({
      patente: 'PH5201',
      marca: 'Nissan',
      modelo: 'NP300',
      clientId,
    });
    vehicleId = vehicle.id;
  });

  afterAll(async () => {
    await deleteTestQuotations();
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
      where: { userId: [devUserId, bodegueroUserId] },
      force: true,
    });
    await User.destroy({
      where: { id: [bodegueroUserId] },
      force: true,
    });
  });

  it('requiere autenticación y permiso comercial:update o taller:create', async () => {
    const noSessionResponse = await request(app)
      .post('/api/quotations/1/convert-to-ot')
      .set('Cookie', ['csrf_token=test'])
      .set('X-CSRF-Token', 'test')
      .send({});
    expect(noSessionResponse.status).toBe(401);

    const bodegueroCookies = await loginAs(`${TEST_EMAIL_PREFIX}bodeguero@unithor.local`);
    const forbiddenResponse = await request(app)
      .post('/api/quotations/1/convert-to-ot')
      .set('Cookie', authCookie(bodegueroCookies))
      .set('X-CSRF-Token', bodegueroCookies.csrfToken)
      .send({});

    expect(forbiddenResponse.status).toBe(403);
  });

  it('convierte una COT independiente en OT y replica sus items', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const quotation = await createQuotationFixture('01', {
      clientId,
      vehicleId,
      notas: 'Aprobada para conversión fase 52',
    });

    const response = await request(app)
      .post(`/api/quotations/${quotation.id}/convert-to-ot`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({
        kilometrajeIngreso: 120000,
        descripcion: 'OT generada desde cotización fase 52',
      });

    expect(response.status).toBe(201);
    expect(response.body.workOrder).toMatchObject({
      clientId,
      vehicleId,
      estado: 'borrador',
      descripcion: 'OT generada desde cotización fase 52',
      kilometrajeIngreso: 120000,
    });
    expect(response.body.workOrder.codigo).toMatch(new RegExp(`^OT-${TEST_YEAR}-\\d{4,}$`));
    expect(response.body.workOrder.items).toEqual([
      expect.objectContaining({
        descripcion: 'Diagnóstico electrónico',
        cantidad: 1,
        precioUnitario: 25000,
        subtotal: 25000,
      }),
      expect.objectContaining({
        descripcion: 'Cambio filtro habitáculo',
        cantidad: 2,
        precioUnitario: 18000,
        subtotal: 36000,
      }),
    ]);

    const reloadedQuotation = await Quotation.findByPk(quotation.id);
    const workOrderId = response.body.workOrder.id as number;
    expect(reloadedQuotation?.workOrderId).toBe(workOrderId);
    expect(response.body.quotation.workOrderId).toBe(workOrderId);

    const copiedItems = await WorkOrderItem.findAll({
      where: { workOrderId },
      order: [['id', 'ASC']],
    });
    expect(copiedItems.map((item) => Number(item.subtotal))).toEqual([25000, 36000]);
  });

  it('rechaza convertir una cotización que ya tiene OT vinculada', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const workOrder = await WorkOrder.create({
      codigo: `${TEST_OT_PREFIX}91`,
      clientId,
      vehicleId,
      estado: 'borrador',
      descripcion: 'OT previa para cotización fase 52',
      createdBy: devUserId,
    });
    const quotation = await createQuotationFixture('02', {
      clientId,
      vehicleId,
      workOrderId: workOrder.id,
    });

    const response = await request(app)
      .post(`/api/quotations/${quotation.id}/convert-to-ot`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe(
      'Esta cotización ya está vinculada a una Orden de Trabajo existente',
    );
  });

  it('rechaza convertir una cotización sin cliente ni vehículo', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const quotation = await createQuotationFixture('03', {
      clientId: null,
      vehicleId: null,
    });

    const response = await request(app)
      .post(`/api/quotations/${quotation.id}/convert-to-ot`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe(
      'La cotización requiere un cliente o vehículo para generar una Orden de Trabajo',
    );
  });

  it('revierte la creación de OT si falla la inserción de items', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const quotation = await createQuotationFixture('04', {
      clientId,
      vehicleId,
      notas: 'Debe hacer rollback cotización fase 52',
    });

    WorkOrderItem.addHook('beforeBulkCreate', 'phase52Rollback', (): void => {
      throw new Error('forced work order item insert failure');
    });

    try {
      const response = await request(app)
        .post(`/api/quotations/${quotation.id}/convert-to-ot`)
        .set('Cookie', authCookie(devCookies))
        .set('X-CSRF-Token', devCookies.csrfToken)
        .send({ descripcion: 'Debe hacer rollback cotización fase 52' });

      expect(response.status).toBe(500);
    } finally {
      WorkOrderItem.removeHook('beforeBulkCreate', 'phase52Rollback');
    }

    const reloadedQuotation = await Quotation.findByPk(quotation.id);
    expect(reloadedQuotation?.workOrderId).toBeNull();

    const rolledBackWorkOrder = await WorkOrder.findOne({
      where: { descripcion: 'Debe hacer rollback cotización fase 52' },
      paranoid: false,
    });
    expect(rolledBackWorkOrder).toBeNull();
  });
});
