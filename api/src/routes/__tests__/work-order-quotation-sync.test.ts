import { Op } from 'sequelize';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { CatalogItem } from '../../models/CatalogItem.js';
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
const TEST_EMAIL_PREFIX = 'syncot-';
const TEST_CODE_PREFIX = 'SYNCOT';
const TEST_YEAR = new Date().getFullYear();

interface LoginCookies {
  accessToken: string;
  csrfToken: string;
}

const extractCookies = (res: request.Response): Record<string, string> => {
  const rawHeader = res.headers['set-cookie'];
  const rawCookies = Array.isArray(rawHeader)
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

const cleanupData = async (): Promise<void> => {
  const workOrders = await WorkOrder.findAll({
    where: {
      [Op.or]: [
        { codigo: { [Op.like]: `${TEST_CODE_PREFIX}%` } },
        { codigo: { [Op.like]: `OT-${TEST_YEAR}-%` } },
      ],
    },
    paranoid: false,
  });
  const workOrderIds = workOrders.map((workOrder) => workOrder.id);

  if (workOrderIds.length > 0) {
    const quotations = await Quotation.findAll({
      where: { workOrderId: workOrderIds },
      paranoid: false,
    });
    const quotationIds = quotations.map((quotation) => quotation.id);
    if (quotationIds.length > 0) {
      await QuotationItem.destroy({ where: { quotationId: quotationIds } });
      await Quotation.destroy({ where: { id: quotationIds }, force: true });
    }
    await WorkOrderItem.destroy({ where: { workOrderId: workOrderIds } });
    await WorkOrder.destroy({ where: { id: workOrderIds }, force: true });
  }

  const clients = await Client.findAll({
    where: { email: { [Op.like]: `${TEST_EMAIL_PREFIX}%` } },
    paranoid: false,
  });
  if (clients.length > 0) {
    const clientIds = clients.map((client) => client.id);
    const vehicles = await Vehicle.findAll({
      where: { clientId: clientIds },
      paranoid: false,
    });
    if (vehicles.length > 0) {
      await Vehicle.destroy({ where: { id: vehicles.map((vehicle) => vehicle.id) }, force: true });
    }
    await Client.destroy({ where: { id: clientIds }, force: true });
  }

  const users = await User.findAll({
    where: { email: { [Op.like]: `${TEST_EMAIL_PREFIX}%` } },
    paranoid: false,
  });
  if (users.length > 0) {
    const userIds = users.map((user) => user.id);
    await RefreshToken.destroy({ where: { userId: userIds }, force: true });
    await User.destroy({ where: { id: userIds }, force: true });
  }
};

describe('Sincronización OT → COT espejo (E2E)', () => {
  let mecanicoUserId: number;
  let clientId: number;
  let vehicleId: number;
  let partId: number;
  let workOrderId: number;

  beforeAll(async () => {
    await sequelize.authenticate();
    await cleanupData();

    const passwordHash = await hashPassword(TEST_PASSWORD);
    const [devUser, vendedorRole, mecanicoRole] = await Promise.all([
      User.findOne({ where: { email: 'dev@unithor.local' } }),
      Role.findOne({ where: { nombre: 'vendedor' } }),
      Role.findOne({ where: { nombre: 'mecanico' } }),
    ]);

    if (!devUser || !vendedorRole || !mecanicoRole) {
      throw new Error('No se encontraron usuarios o roles base para la prueba de sincronización');
    }

    await devUser.update({ passwordHash, activo: true });

    const [, , mecanicoUser, client] = await Promise.all([
      User.create({
        nombre: 'Vendedor Sync OT',
        email: `${TEST_EMAIL_PREFIX}vendedor@unithor.local`,
        passwordHash,
        roleId: vendedorRole.id,
        activo: true,
      }),
      User.create({
        nombre: 'Comercial Sync OT',
        email: `${TEST_EMAIL_PREFIX}comercial@unithor.local`,
        passwordHash,
        roleId: vendedorRole.id,
        activo: true,
      }),
      User.create({
        nombre: 'Mecánico Sync OT',
        email: `${TEST_EMAIL_PREFIX}mecanico@unithor.local`,
        passwordHash,
        roleId: mecanicoRole.id,
        activo: true,
      }),
      Client.create({
        rut: '76990001',
        nombre: 'Cliente Sync OT',
        tipo: 'cliente',
        email: `${TEST_EMAIL_PREFIX}client@unithor.local`,
        telefono: '+56 9 7700 0001',
      }),
    ]);

    mecanicoUserId = mecanicoUser.id;
    clientId = client.id;

    const vehicle = await Vehicle.create({
      patente: 'SYNC01',
      marca: 'Toyota',
      modelo: 'Corolla',
      kilometraje: 5000,
      clientId,
    });
    vehicleId = vehicle.id;

    const part = await CatalogItem.create({
      tipo: 'parte',
      codigo: `${TEST_CODE_PREFIX}-PART`,
      nombre: 'Repuesto sincronización',
      descripcion: null,
      unidadMedida: 'unidad',
      precio: 15000,
      stock: 10,
      stockMinimo: 1,
    });
    partId = part.id;

    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);
    const createResponse = await request(app)
      .post('/api/work-orders')
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        clientId,
        vehicleId,
        descripcion: 'OT para sincronización',
        assignedMechanicId: mecanicoUserId,
        items: [
          {
            catalogItemId: partId,
            descripcion: 'Repuesto sincronización',
            tipoLinea: 'parte',
            unidadMedida: 'unidad',
            cantidad: 2,
            precioUnitario: 15000,
          },
          {
            catalogItemId: null,
            descripcion: 'Servicio de alineación',
            tipoLinea: 'estandar',
            unidadMedida: 'servicio',
            cantidad: 1,
            precioUnitario: 30000,
          },
        ],
      });

    expect(createResponse.status, JSON.stringify(createResponse.body)).toBe(201);
    workOrderId = createResponse.body.workOrder.id;
  });

  afterAll(async () => {
    await cleanupData();
  });

  it('crea la OT con tipo de línea y unidad, y refleja lo mismo en la cotización espejo', async () => {
    const workOrder = await WorkOrder.findByPk(workOrderId, {
      include: [{ model: WorkOrderItem, as: 'items' }],
    });
    const items = workOrder?.items ?? [];
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ tipoLinea: 'parte', unidadMedida: 'unidad' });
    expect(Number(items[0].cantidad)).toBe(2);
    expect(items[1]).toMatchObject({ tipoLinea: 'estandar', unidadMedida: 'servicio' });
    expect(Number(items[1].cantidad)).toBe(1);
    expect(workOrder?.assignedMechanicId).toBe(mecanicoUserId);

    const quotation = await Quotation.findOne({
      where: { workOrderId },
      include: [{ model: QuotationItem }],
    });
    expect(quotation).not.toBeNull();
    expect(Number(quotation?.total)).toBe(60000);
    expect(quotation?.estadoPago).toBe('por_pagar');
    const quotationItems = [...(quotation?.items ?? [])].sort((left, right) => left.id - right.id);
    expect(quotationItems).toHaveLength(2);
    expect(quotationItems[0]).toMatchObject({ tipoLinea: 'parte', unidadMedida: 'unidad' });
    expect(quotationItems[1]).toMatchObject({ tipoLinea: 'estandar', unidadMedida: 'servicio' });
  });

  it('rechaza cantidades decimales al actualizar los trabajos de la OT', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);
    const response = await request(app)
      .patch(`/api/work-orders/${workOrderId}`)
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        items: [
          {
            descripcion: 'Servicio de alineación',
            cantidad: 1.5,
            precioUnitario: 30000,
          },
        ],
      });

    expect(response.status).toBe(400);
  });

  it('sincroniza la cotización espejo al cambiar los trabajos de la OT', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);
    const response = await request(app)
      .patch(`/api/work-orders/${workOrderId}`)
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        items: [
          {
            catalogItemId: partId,
            descripcion: 'Repuesto sincronización',
            tipoLinea: 'parte',
            unidadMedida: 'juego',
            cantidad: 3,
            precioUnitario: 15000,
          },
        ],
      });

    expect(response.status).toBe(200);

    const quotation = await Quotation.findOne({
      where: { workOrderId },
      include: [{ model: QuotationItem }],
    });
    const quotationItems = quotation?.items ?? [];
    expect(quotationItems).toHaveLength(1);
    expect(quotationItems[0]).toMatchObject({
      descripcion: 'Repuesto sincronización',
      tipoLinea: 'parte',
      unidadMedida: 'juego',
    });
    expect(Number(quotationItems[0].cantidad)).toBe(3);
    expect(Number(quotation?.subtotal)).toBe(45000);
    expect(Number(quotation?.total)).toBe(45000);
  });

  it('no destruye los trabajos de la OT al editar la cotización vinculada', async () => {
    const quotation = await Quotation.findOne({ where: { workOrderId } });
    expect(quotation).not.toBeNull();

    const comercialCookies = await loginAs(`${TEST_EMAIL_PREFIX}comercial@unithor.local`);
    const response = await request(app)
      .patch(`/api/quotations/${quotation?.id}`)
      .set('Cookie', authCookie(comercialCookies))
      .set('X-CSRF-Token', comercialCookies.csrfToken)
      .send({
        notas: 'Precio ajustado por el asesor',
        items: [
          {
            catalogItemId: null,
            descripcion: 'Concepto agregado por el asesor',
            tipoLinea: 'especifico',
            unidadMedida: 'servicio',
            cantidad: 1,
            precioUnitario: 50000,
          },
        ],
      });

    expect(response.status).toBe(200);

    const workOrderItems = await WorkOrderItem.findAll({ where: { workOrderId } });
    expect(workOrderItems).toHaveLength(1);
    expect(workOrderItems[0]).toMatchObject({
      descripcion: 'Repuesto sincronización',
      tipoLinea: 'parte',
      unidadMedida: 'juego',
    });
    expect(Number(workOrderItems[0].cantidad)).toBe(3);

    const updatedQuotation = await Quotation.findByPk(quotation?.id ?? 0, {
      include: [{ model: QuotationItem }],
    });
    const updatedItems = updatedQuotation?.items ?? [];
    expect(updatedItems).toHaveLength(1);
    expect(updatedItems[0]).toMatchObject({
      descripcion: 'Concepto agregado por el asesor',
      tipoLinea: 'especifico',
      unidadMedida: 'servicio',
    });
    expect(Number(updatedQuotation?.total)).toBe(50000);
  });

  it('bloquea cambios de trabajos si la cotización espejo ya está pagada', async () => {
    const quotation = await Quotation.findOne({ where: { workOrderId } });
    await quotation?.update({ estadoPago: 'total', pagado: Number(quotation?.total) });

    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);
    const response = await request(app)
      .patch(`/api/work-orders/${workOrderId}`)
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        items: [
          {
            descripcion: 'Trabajo posterior al pago',
            cantidad: 1,
            precioUnitario: 10000,
          },
        ],
      });

    expect(response.status).toBe(400);

    const workOrderItems = await WorkOrderItem.findAll({ where: { workOrderId } });
    expect(workOrderItems).toHaveLength(1);
    expect(workOrderItems[0].descripcion).toBe('Repuesto sincronización');
  });

  it('mantiene el estado de pago parcial al recalcular la cotización espejo', async () => {
    const quotation = await Quotation.findOne({ where: { workOrderId } });
    await quotation?.update({ estadoPago: 'parcial', pagado: 20000 });

    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);
    const response = await request(app)
      .patch(`/api/work-orders/${workOrderId}`)
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        items: [
          {
            descripcion: 'Repuesto sincronización',
            tipoLinea: 'parte',
            unidadMedida: 'unidad',
            cantidad: 4,
            precioUnitario: 15000,
          },
        ],
      });

    expect(response.status).toBe(200);
    const updated = await Quotation.findByPk(quotation?.id ?? 0);
    expect(updated?.estadoPago).toBe('parcial');
    expect(Number(updated?.total)).toBe(60000);
  });
});
