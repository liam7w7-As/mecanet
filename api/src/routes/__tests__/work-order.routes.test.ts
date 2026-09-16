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
import { WorkOrderInspection } from '../../models/WorkOrderInspection.js';
import { WorkOrderItem } from '../../models/WorkOrderItem.js';
import { hashPassword } from '../../utils/password.js';

const TEST_PASSWORD = 'Desarrollador2026!';
const TEST_EMAIL_PREFIX = 'phase41-';
const TEST_PLATE_PREFIX = 'PH41';
const TEST_YEAR = new Date().getFullYear();

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

const deleteCurrentYearWorkOrders = async (): Promise<void> => {
  const workOrders = await WorkOrder.findAll({
    where: { codigo: { [Op.like]: `OT-${TEST_YEAR}-%` } },
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
};

describe('Work Order Routes (E2E)', () => {
  let devUserId: number;
  let vendedorUserId: number;
  let bodegueroUserId: number;
  let clientId: number;
  let vehicleId: number;

  beforeAll(async () => {
    await sequelize.authenticate();
    await deleteCurrentYearWorkOrders();

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
      throw new Error('No se encontraron usuarios o roles base para work-order.routes.test');
    }

    await devUser.update({ passwordHash, activo: true });
    devUserId = devUser.id;

    const [vendedorUser, bodegueroUser, client] = await Promise.all([
      User.create({
        nombre: 'Vendedor Fase 41',
        email: `${TEST_EMAIL_PREFIX}vendedor@unithor.local`,
        passwordHash,
        roleId: vendedorRole.id,
        activo: true,
      }),
      User.create({
        nombre: 'Bodeguero Fase 41',
        email: `${TEST_EMAIL_PREFIX}bodeguero@unithor.local`,
        passwordHash,
        roleId: bodegueroRole.id,
        activo: true,
      }),
      Client.create({
        rut: '76410001',
        nombre: 'Cliente OT Fase 41',
        tipo: 'cliente',
        email: `${TEST_EMAIL_PREFIX}client@unithor.local`,
        telefono: '+56 9 4100 0001',
      }),
    ]);

    vendedorUserId = vendedorUser.id;
    bodegueroUserId = bodegueroUser.id;
    clientId = client.id;

    const vehicle = await Vehicle.create({
      patente: 'PH4101',
      marca: 'Toyota',
      modelo: 'Hilux',
      kilometraje: 1000,
      clientId,
    });
    vehicleId = vehicle.id;
  });

  afterAll(async () => {
    await deleteCurrentYearWorkOrders();

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

  it('requiere autenticación y permiso taller:create', async () => {
    const noSessionResponse = await request(app).get('/api/work-orders');
    expect(noSessionResponse.status).toBe(401);

    const bodegueroCookies = await loginAs(`${TEST_EMAIL_PREFIX}bodeguero@unithor.local`);
    const forbiddenResponse = await request(app)
      .post('/api/work-orders')
      .set('Cookie', authCookie(bodegueroCookies))
      .set('X-CSRF-Token', bodegueroCookies.csrfToken)
      .send({
        clientId,
        vehicleId,
        descripcion: 'Intento sin permiso create',
      });

    expect(forbiddenResponse.status).toBe(403);
  });

  it('crea órdenes con correlativo secuencial único', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);

    const firstResponse = await request(app)
      .post('/api/work-orders')
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        clientId,
        vehicleId,
        descripcion: 'Primera OT fase 41',
      });

    expect(firstResponse.status).toBe(201);
    expect(firstResponse.body.workOrder.codigo).toBe(`OT-${TEST_YEAR}-0001`);
    expect(firstResponse.body.workOrder.contact).toMatchObject({
      clientId,
      nombre: 'Cliente OT Fase 41',
    });
    expect(firstResponse.body.workOrder.billing).toMatchObject({
      clientId,
      nombre: 'Cliente OT Fase 41',
    });

    const secondResponse = await request(app)
      .post('/api/work-orders')
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        clientId,
        vehicleId,
        descripcion: 'Segunda OT fase 41',
      });

    expect(secondResponse.status).toBe(201);
    expect(secondResponse.body.workOrder.codigo).toBe(`OT-${TEST_YEAR}-0002`);
    expect(secondResponse.body.workOrder.codigo).not.toBe(firstResponse.body.workOrder.codigo);
  });

  it('crea OT con items calculando subtotales y actualiza kilometraje del vehículo', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);

    const response = await request(app)
      .post('/api/work-orders')
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        clientId,
        vehicleId,
        kilometrajeIngreso: 1500,
        descripcion: 'OT con items fase 41',
        items: [
          {
            descripcion: 'Cambio de aceite',
            cantidad: 2,
            precioUnitario: 12500,
          },
          {
            descripcion: 'Filtro de aire',
            cantidad: 1,
            precioUnitario: 8000,
          },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.workOrder.items).toEqual([
      expect.objectContaining({
        descripcion: 'Cambio de aceite',
        cantidad: 2,
        precioUnitario: 12500,
        subtotal: 25000,
      }),
      expect.objectContaining({
        descripcion: 'Filtro de aire',
        cantidad: 1,
        precioUnitario: 8000,
        subtotal: 8000,
      }),
    ]);

    const vehicle = await Vehicle.findByPk(vehicleId);
    expect(vehicle?.kilometraje).toBe(1500);

    const mirrorQuotation = await Quotation.findOne({
      where: { workOrderId: response.body.workOrder.id },
      include: [{ model: QuotationItem }],
    });
    expect(mirrorQuotation).not.toBeNull();
    expect(Number(mirrorQuotation?.total)).toBe(33000);
    expect(mirrorQuotation?.items).toHaveLength(2);
    expect(response.body.workOrder.quotation).toEqual(
      expect.objectContaining({
        codigo: mirrorQuotation?.codigo,
        total: 33000,
        saldoPendiente: 33000,
      }),
    );
  });

  it('guarda contacto, facturación e inspección como datos históricos de la OT', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);
    const [contact, billing] = await Promise.all([
      Client.create({
        rut: '18880001',
        nombre: 'Persona que entrega el vehículo',
        tipo: 'cliente',
        email: `${TEST_EMAIL_PREFIX}contact@unithor.local`,
        telefono: '+56 9 1111 2222',
      }),
      Client.create({
        rut: '76888001',
        nombre: 'Empresa Facturación SpA',
        tipo: 'empresa',
        email: `${TEST_EMAIL_PREFIX}billing@unithor.local`,
        telefono: '+56 2 2222 3333',
        direccion: 'Avenida Taller 123',
        region: 'Metropolitana',
        comuna: 'Santiago',
      }),
    ]);

    const response = await request(app)
      .post('/api/work-orders')
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        clientId,
        contactClientId: contact.id,
        billingClientId: billing.id,
        vehicleId,
        inspection: {
          nivelCombustible: 'medio',
          llantaDelanteraIzquierda: 'regular',
          llantaDelanteraDerecha: 'bueno',
          llantaTraseraIzquierda: 'baja_presion',
          llantaTraseraDerecha: 'bueno',
          inventario: ['botiquin', 'chaleco_reflectante', 'rueda_repuesto'],
          objetosValor: 'Lentes en la guantera',
          observaciones: 'Rayón leve en parachoques delantero',
        },
      });

    expect(response.status).toBe(201);
    expect(response.body.workOrder.contact).toMatchObject({
      clientId: contact.id,
      nombre: 'Persona que entrega el vehículo',
      telefono: '+56 9 1111 2222',
    });
    expect(response.body.workOrder.billing).toMatchObject({
      clientId: billing.id,
      nombre: 'Empresa Facturación SpA',
      tipo: 'empresa',
      direccion: 'Avenida Taller 123',
    });
    expect(response.body.workOrder.inspection).toMatchObject({
      nivelCombustible: 'medio',
      llantaTraseraIzquierda: 'baja_presion',
      inventario: ['botiquin', 'chaleco_reflectante', 'rueda_repuesto'],
      inspectedBy: vendedorUserId,
    });

    const workOrderId = response.body.workOrder.id as number;
    const storedInspection = await WorkOrderInspection.findOne({ where: { workOrderId } });
    expect(storedInspection?.observaciones).toBe('Rayón leve en parachoques delantero');

    await contact.update({ nombre: 'Nombre editado posteriormente' });
    const detailResponse = await request(app)
      .get(`/api/work-orders/${workOrderId}`)
      .set('Cookie', authCookie(vendedorCookies));
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.workOrder.contact.nombre).toBe(
      'Persona que entrega el vehículo',
    );

    const inspectionUpdate = await request(app)
      .patch(`/api/work-orders/${workOrderId}`)
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({ inspection: { observaciones: 'Observación corregida' } });
    expect(inspectionUpdate.status).toBe(200);
    expect(inspectionUpdate.body.workOrder.inspection.inventario).toEqual([
      'botiquin',
      'chaleco_reflectante',
      'rueda_repuesto',
    ]);
    expect(inspectionUpdate.body.workOrder.inspection.observaciones).toBe(
      'Observación corregida',
    );
  });

  it('revierte la creación si el contacto o la facturación no existen', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);
    const countBefore = await WorkOrder.count();

    const response = await request(app)
      .post('/api/work-orders')
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        clientId,
        vehicleId,
        contactClientId: 2147483647,
        inspection: { inventario: ['botiquin'] },
      });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('El cliente de contacto especificado no existe');
    expect(await WorkOrder.count()).toBe(countBefore);
  });

  it('busca órdenes por patente y nombre de cliente', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);

    const byPlate = await request(app)
      .get('/api/work-orders')
      .query({ search: 'PH4101' })
      .set('Cookie', authCookie(vendedorCookies));
    const byClient = await request(app)
      .get('/api/work-orders')
      .query({ search: 'Cliente OT Fase 41' })
      .set('Cookie', authCookie(vendedorCookies));

    expect(byPlate.status).toBe(200);
    expect(byPlate.body.total).toBeGreaterThan(0);
    expect(byPlate.body.items.every((item: { vehicleId: number | null }) => item.vehicleId === vehicleId)).toBe(true);
    expect(byClient.status).toBe(200);
    expect(byClient.body.total).toBeGreaterThan(0);
    expect(byClient.body.items.every((item: { clientId: number | null }) => item.clientId === clientId)).toBe(true);
  });

  it('rechaza combinar un vehículo con un cliente distinto a su dueño', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);
    const otherClient = await Client.create({
      rut: '76410002',
      nombre: 'Cliente OT Incorrecto',
      tipo: 'cliente',
      email: `${TEST_EMAIL_PREFIX}other-client@unithor.local`,
    });

    const response = await request(app)
      .post('/api/work-orders')
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({ clientId: otherClient.id, vehicleId });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe(
      'El vehículo pertenece a un cliente distinto al seleccionado',
    );

    const validOrder = await request(app)
      .post('/api/work-orders')
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({ clientId, vehicleId });
    expect(validOrder.status).toBe(201);

    const invalidUpdate = await request(app)
      .patch(`/api/work-orders/${validOrder.body.workOrder.id as number}`)
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({ clientId: otherClient.id });
    expect(invalidUpdate.status).toBe(400);
    expect(invalidUpdate.body.error.message).toBe(
      'El vehículo pertenece a un cliente distinto al seleccionado',
    );
  });

  it('modifica cabecera y reemplaza items atómicamente', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);

    const createResponse = await request(app)
      .post('/api/work-orders')
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        clientId,
        vehicleId,
        descripcion: 'OT a modificar fase 41',
        items: [{ descripcion: 'Item inicial', cantidad: 1, precioUnitario: 1000 }],
      });
    expect(createResponse.status).toBe(201);

    const workOrderId = createResponse.body.workOrder.id as number;
    const updateResponse = await request(app)
      .patch(`/api/work-orders/${workOrderId}`)
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        descripcion: 'OT modificada fase 41',
        kilometrajeIngreso: 1800,
        items: [
          { descripcion: 'Diagnóstico eléctrico', cantidad: 1, precioUnitario: 15000 },
          { descripcion: 'Mano de obra', cantidad: 3, precioUnitario: 20000 },
        ],
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.workOrder.descripcion).toBe('OT modificada fase 41');
    expect(updateResponse.body.workOrder.items).toHaveLength(2);
    expect(updateResponse.body.workOrder.items[1]).toMatchObject({
      descripcion: 'Mano de obra',
      cantidad: 3,
      precioUnitario: 20000,
      subtotal: 60000,
    });

    const storedItems = await WorkOrderItem.findAll({ where: { workOrderId } });
    expect(storedItems).toHaveLength(2);
  });

  it('rechaza modificar una OT entregada o cancelada', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);

    const createResponse = await request(app)
      .post('/api/work-orders')
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        clientId,
        vehicleId,
        descripcion: 'OT cerrada fase 41',
      });
    expect(createResponse.status).toBe(201);

    const workOrderId = createResponse.body.workOrder.id as number;
    await WorkOrder.update({ estado: 'entregada' }, { where: { id: workOrderId } });

    const response = await request(app)
      .patch(`/api/work-orders/${workOrderId}`)
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({ descripcion: 'No debe cambiar' });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe(
      'No se puede modificar una orden finalizada o cancelada',
    );
  });

  it('rechaza eliminar una OT en progreso', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const workOrder = await WorkOrder.create({
      codigo: `OT-${TEST_YEAR}-9001`,
      clientId,
      vehicleId,
      estado: 'en_progreso',
      descripcion: 'OT activa fase 41',
    });

    const response = await request(app)
      .delete(`/api/work-orders/${workOrder.id}`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken);

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('No se puede eliminar una orden activa');
  });

  it('aplica soft delete a una OT en borrador', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const workOrder = await WorkOrder.create({
      codigo: `OT-${TEST_YEAR}-9002`,
      clientId,
      vehicleId,
      estado: 'borrador',
      descripcion: 'OT eliminable fase 41',
    });

    const response = await request(app)
      .delete(`/api/work-orders/${workOrder.id}`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken);

    expect(response.status).toBe(204);

    const deleted = await WorkOrder.findByPk(workOrder.id, { paranoid: false });
    expect(deleted?.deletedAt).not.toBeNull();
  });
});
