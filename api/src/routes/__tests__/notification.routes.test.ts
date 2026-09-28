import { Op } from 'sequelize';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { CatalogItem } from '../../models/CatalogItem.js';
import { Client } from '../../models/Client.js';
import { Notification } from '../../models/Notification.js';
import { Quotation } from '../../models/Quotation.js';
import { QuotationItem } from '../../models/QuotationItem.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { Vehicle } from '../../models/Vehicle.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { WorkOrderItem } from '../../models/WorkOrderItem.js';
import { WorkOrderProgressReport } from '../../models/WorkOrderProgressReport.js';
import { WorkOrderRequest } from '../../models/WorkOrderRequest.js';
import { hashPassword } from '../../utils/password.js';

const TEST_PASSWORD = 'Desarrollador2026!';
const TEST_EMAIL_PREFIX = 'notif-';
const TEST_CODE_PREFIX = 'NOTIF';

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
    cookies[pair.slice(0, separatorIndex).trim()] = pair.slice(separatorIndex + 1).trim();
    return cookies;
  }, {});
};

const loginAs = async (email: string): Promise<LoginCookies> => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });
  expect(response.status).toBe(200);
  const cookies = extractCookies(response);
  return { accessToken: cookies.access_token, csrfToken: cookies.csrf_token };
};

const authCookie = (cookies: LoginCookies): string[] => [
  `access_token=${cookies.accessToken}`,
  `csrf_token=${cookies.csrfToken}`,
];

const cleanup = async (): Promise<void> => {
  const workOrders = await WorkOrder.findAll({
    where: { codigo: { [Op.like]: `${TEST_CODE_PREFIX}%` } },
    paranoid: false,
  });
  const workOrderIds = workOrders.map((workOrder) => workOrder.id);

  if (workOrderIds.length > 0) {
    await Notification.destroy({ where: { workOrderId: workOrderIds } });
    const quotations = await Quotation.findAll({
      where: { workOrderId: workOrderIds },
      paranoid: false,
    });
    const quotationIds = quotations.map((quotation) => quotation.id);
    if (quotationIds.length > 0) {
      await Notification.destroy({ where: { quotationId: quotationIds } });
      await QuotationItem.destroy({ where: { quotationId: quotationIds } });
      await Quotation.destroy({ where: { id: quotationIds }, force: true });
    }
    await WorkOrderRequest.destroy({ where: { workOrderId: workOrderIds } });
    await WorkOrderProgressReport.destroy({ where: { workOrderId: workOrderIds } });
    await WorkOrderItem.destroy({ where: { workOrderId: workOrderIds } });
    await WorkOrder.destroy({ where: { id: workOrderIds }, force: true });
  }

  const users = await User.findAll({
    where: { email: { [Op.like]: `${TEST_EMAIL_PREFIX}%` } },
    paranoid: false,
  });
  if (users.length > 0) {
    const userIds = users.map((user) => user.id);
    await Notification.destroy({ where: { userId: userIds } });
    await RefreshToken.destroy({ where: { userId: userIds }, force: true });
    await User.destroy({ where: { id: userIds }, force: true });
  }

  await Notification.destroy({ where: { dedupeKey: { [Op.like]: `%NOTIF%` } } });

  const clients = await Client.findAll({
    where: { email: { [Op.like]: `${TEST_EMAIL_PREFIX}%` } },
    paranoid: false,
  });
  if (clients.length > 0) {
    const clientIds = clients.map((client) => client.id);
    const vehicles = await Vehicle.findAll({ where: { clientId: clientIds }, paranoid: false });
    if (vehicles.length > 0) {
      await Vehicle.destroy({ where: { id: vehicles.map((v) => v.id) }, force: true });
    }
    await Client.destroy({ where: { id: clientIds }, force: true });
  }
};

describe('Notificaciones por rol (E2E)', () => {
  let jefeId: number;
  let mecanicoId: number;
  let mecanico2Id: number;
  let vendedorId: number;
  let supervisorCookies: LoginCookies;
  let workOrderId: number;
  let requestId: number;
  let serviceItemId: number;
  let clientId: number;
  let catalogPartId: number;

  beforeAll(async () => {
    await sequelize.authenticate();
    await cleanup();

    const passwordHash = await hashPassword(TEST_PASSWORD);
    const [devUser, jefeRole, mecanicoRole, vendedorRole] = await Promise.all([
      User.findOne({ where: { email: 'dev@unithor.local' } }),
      Role.findOne({ where: { nombre: 'jefe' } }),
      Role.findOne({ where: { nombre: 'mecanico' } }),
      Role.findOne({ where: { nombre: 'vendedor' } }),
    ]);

    if (!devUser || !jefeRole || !mecanicoRole || !vendedorRole) {
      throw new Error('Faltan roles base para la prueba de notificaciones');
    }

    await devUser.update({ passwordHash, activo: true });

    const [jefe, mecanico, mecanico2, vendedor, client] = await Promise.all([
      User.create({
        nombre: 'Jefe Notif',
        email: `${TEST_EMAIL_PREFIX}jefe@unithor.local`,
        passwordHash,
        roleId: jefeRole.id,
        activo: true,
      }),
      User.create({
        nombre: 'Mecanico Notif',
        email: `${TEST_EMAIL_PREFIX}mecanico@unithor.local`,
        passwordHash,
        roleId: mecanicoRole.id,
        activo: true,
      }),
      // Segundo mecánico del mismo rol. Existe para poder comprobar que los
      // avisos dirigidos no se reparten entre todo el rol: con un solo mecánico
      // la aserción negativa sería imposible.
      User.create({
        nombre: 'Mecanico Dos Notif',
        email: `${TEST_EMAIL_PREFIX}mecanico2@unithor.local`,
        passwordHash,
        roleId: mecanicoRole.id,
        activo: true,
      }),
      User.create({
        nombre: 'Vendedor Notif',
        email: `${TEST_EMAIL_PREFIX}vendedor@unithor.local`,
        passwordHash,
        roleId: vendedorRole.id,
        activo: true,
      }),
      Client.create({
        rut: '76990009',
        nombre: 'Cliente Notif',
        tipo: 'cliente',
        email: `${TEST_EMAIL_PREFIX}client@unithor.local`,
        telefono: '+56 9 7700 0009',
      }),
    ]);

    jefeId = jefe.id;
    mecanicoId = mecanico.id;
    mecanico2Id = mecanico2.id;
    vendedorId = vendedor.id;

    const vehicle = await Vehicle.create({
      patente: 'NOTIF1',
      marca: 'Toyota',
      modelo: 'Corolla',
      kilometraje: 1000,
      clientId: client.id,
    });

    const part = await CatalogItem.create({
      tipo: 'parte',
      codigo: `${TEST_CODE_PREFIX}-PART`,
      nombre: 'Repuesto notificable',
      descripcion: null,
      unidadMedida: 'unidad',
      precio: 9000,
      stock: 8,
      stockMinimo: 1,
    });
    catalogPartId = part.id;

    const workOrder = await WorkOrder.create({
      codigo: `${TEST_CODE_PREFIX}-01`,
      estado: 'en_progreso',
      descripcion: 'Orden para probar notificaciones',
      assignedMechanicId: mecanicoId,
      vehicleId: vehicle.id,
      createdBy: devUser.id,
    });
    workOrderId = workOrder.id;

    const serviceItem = await WorkOrderItem.create({
      workOrderId: workOrder.id,
      catalogItemId: null,
      descripcion: 'Servicio base notificable',
      tipoLinea: 'estandar',
      unidadMedida: 'servicio',
      cantidad: 1,
      precioUnitario: 20000,
      subtotal: 20000,
      estadoOperativo: 'pendiente',
      notasOperativas: null,
      stockConsumido: false,
      stockConsumidoCantidad: 0,
      stockConsumidoAt: null,
    });
    serviceItemId = serviceItem.id;
    clientId = client.id;

    supervisorCookies = await loginAs('dev@unithor.local');
  });

  afterAll(async () => {
    await cleanup();
  });

  it('requiere autenticación para listar notificaciones', async () => {
    const response = await request(app).get('/api/notifications');
    expect(response.status).toBe(401);
  });

  it('entrega al jefe la notificación de la solicitud creada por el mecánico', async () => {
    // La solicitud se crea por la API para que el servicio dispare el evento.
    const mecanicoCookies = await loginAs(`${TEST_EMAIL_PREFIX}mecanico@unithor.local`);
    const created = await request(app)
      .post(`/api/work-orders/${workOrderId}/requests`)
      .set('Cookie', authCookie(mecanicoCookies))
      .set('X-CSRF-Token', mecanicoCookies.csrfToken)
      .send({
        tipo: 'aumento_precio',
        workOrderItemId: serviceItemId,
        precioSugerido: 35000,
        motivo: 'Requiere más tiempo de taller',
      });
    expect(created.status).toBe(201);
    requestId = created.body.workOrder.requests.find(
      (candidate: { tipo: string }) => candidate.tipo === 'aumento_precio',
    ).id;

    const jefeCookies = await loginAs(`${TEST_EMAIL_PREFIX}jefe@unithor.local`);
    const response = await request(app)
      .get('/api/notifications')
      .set('Cookie', authCookie(jefeCookies));

    expect(response.status).toBe(200);
    const item = response.body.items.find(
      (candidate: { tipo: string }) => candidate.tipo === 'solicitud_creada',
    );
    expect(item).toBeDefined();
    expect(item.workOrderId).toBe(workOrderId);
    expect(item.leida).toBe(false);
    expect(item.nivel).toBe('warning');
    expect(item.actor).toMatchObject({ id: mecanicoId });
  });

  it('no entrega la notificación de la solicitud a quien la creó', async () => {
    const mecanicoCookies = await loginAs(`${TEST_EMAIL_PREFIX}mecanico@unithor.local`);
    const response = await request(app)
      .get('/api/notifications')
      .set('Cookie', authCookie(mecanicoCookies));

    expect(response.status).toBe(200);
    expect(
      response.body.items.filter(
        (candidate: { tipo: string }) => candidate.tipo === 'solicitud_creada',
      ),
    ).toHaveLength(0);
  });

  it('expone el conteo de no leídas y permite marcarlas como leídas', async () => {
    const jefeCookies = await loginAs(`${TEST_EMAIL_PREFIX}jefe@unithor.local`);

    const before = await request(app)
      .get('/api/notifications/unread-count')
      .set('Cookie', authCookie(jefeCookies));
    expect(before.status).toBe(200);
    expect(before.body.noLeidas).toBeGreaterThan(0);

    const marked = await request(app)
      .patch('/api/notifications/read')
      .set('Cookie', authCookie(jefeCookies))
      .set('X-CSRF-Token', jefeCookies.csrfToken)
      .send({ ids: [], todas: true });
    expect(marked.status).toBe(200);
    expect(marked.body.noLeidas).toBe(0);

    const soloNoLeidas = await request(app)
      .get('/api/notifications?soloNoLeidas=true')
      .set('Cookie', authCookie(jefeCookies));
    expect(soloNoLeidas.status).toBe(200);
    expect(soloNoLeidas.body.items).toHaveLength(0);
  });

  it('rechaza marcar leídas sin ids ni el flag todas', async () => {
    const jefeCookies = await loginAs(`${TEST_EMAIL_PREFIX}jefe@unithor.local`);
    const response = await request(app)
      .patch('/api/notifications/read')
      .set('Cookie', authCookie(jefeCookies))
      .set('X-CSRF-Token', jefeCookies.csrfToken)
      .send({ ids: [], todas: false });

    expect(response.status).toBe(400);
  });

  it('solo notifica al mecánico solicitante cuando el jefe aprueba la solicitud', async () => {
    const review = await request(app)
      .patch(`/api/work-orders/${workOrderId}/requests/${requestId}`)
      .set('Cookie', authCookie(supervisorCookies))
      .set('X-CSRF-Token', supervisorCookies.csrfToken)
      .send({ decision: 'aprobar', comentario: 'Autorizado' });
    expect(review.status).toBe(200);

    const mecanicoCookies = await loginAs(`${TEST_EMAIL_PREFIX}mecanico@unithor.local`);
    const response = await request(app)
      .get('/api/notifications')
      .set('Cookie', authCookie(mecanicoCookies));

    expect(response.status).toBe(200);
    const item = response.body.items.find(
      (candidate: { tipo: string }) => candidate.tipo === 'solicitud_aprobada',
    );
    expect(item).toBeDefined();
    expect(item.workOrderId).toBe(workOrderId);
    expect(item.leida).toBe(false);

    // El otro mecánico del mismo rol no solicitó nada: el aviso no es suyo.
    // Esto no es una aserción vacía: el test de `ot_estado_cambiado` comprueba
    // que mecanico2 sí recibe los avisos que son broadcast de rol, así que está
    // activo, tiene el rol correcto y es alcanzable. Lo que se comprueba aquí es
    // que los avisos dirigidos a una persona no se reparten por rol.
    const otroCookies = await loginAs(`${TEST_EMAIL_PREFIX}mecanico2@unithor.local`);
    const delOtro = await request(app)
      .get('/api/notifications')
      .set('Cookie', authCookie(otroCookies));
    expect(delOtro.status).toBe(200);
    expect(
      delOtro.body.items.filter(
        (candidate: { tipo: string }) => candidate.tipo === 'solicitud_aprobada',
      ),
    ).toHaveLength(0);
  });

  it('solo notifica al solicitante cuando el jefe rechaza la solicitud', async () => {
    const mecanicoCookies = await loginAs(`${TEST_EMAIL_PREFIX}mecanico@unithor.local`);
    const created = await request(app)
      .post(`/api/work-orders/${workOrderId}/requests`)
      .set('Cookie', authCookie(mecanicoCookies))
      .set('X-CSRF-Token', mecanicoCookies.csrfToken)
      .send({
        tipo: 'aumento_precio',
        workOrderItemId: serviceItemId,
        precioSugerido: 42000,
        motivo: 'Segundo pedido para probar el rechazo',
      });
    expect(created.status).toBe(201);
    const rejectedRequestId = created.body.workOrder.requests.find(
      (candidate: { tipo: string; estado: string }) =>
        candidate.tipo === 'aumento_precio' && candidate.estado === 'pendiente',
    )?.id;
    expect(rejectedRequestId).toBeDefined();

    const review = await request(app)
      .patch(`/api/work-orders/${workOrderId}/requests/${rejectedRequestId}`)
      .set('Cookie', authCookie(supervisorCookies))
      .set('X-CSRF-Token', supervisorCookies.csrfToken)
      .send({ decision: 'rechazar', comentario: 'No hay presupuesto' });
    expect(review.status).toBe(200);

    const delSolicitante = await request(app)
      .get('/api/notifications')
      .set('Cookie', authCookie(mecanicoCookies));
    const item = delSolicitante.body.items.find(
      (candidate: { tipo: string }) => candidate.tipo === 'solicitud_rechazada',
    );
    expect(item).toBeDefined();
    expect(item.workOrderId).toBe(workOrderId);

    const otroCookies = await loginAs(`${TEST_EMAIL_PREFIX}mecanico2@unithor.local`);
    const delOtro = await request(app)
      .get('/api/notifications')
      .set('Cookie', authCookie(otroCookies));
    expect(
      delOtro.body.items.filter(
        (candidate: { tipo: string }) => candidate.tipo === 'solicitud_rechazada',
      ),
    ).toHaveLength(0);
  });

  it('solo notifica al mecánico al que se le asigna la orden', async () => {
    const assign = await request(app)
      .patch(`/api/work-orders/${workOrderId}/assignment`)
      .set('Cookie', authCookie(supervisorCookies))
      .set('X-CSRF-Token', supervisorCookies.csrfToken)
      .send({ mechanicId: mecanico2Id });
    expect(assign.status).toBe(200);

    const nuevoCookies = await loginAs(`${TEST_EMAIL_PREFIX}mecanico2@unithor.local`);
    const delNuevo = await request(app)
      .get('/api/notifications')
      .set('Cookie', authCookie(nuevoCookies));
    const asignacion = delNuevo.body.items.find(
      (candidate: { tipo: string; titulo: string }) =>
        candidate.tipo === 'mecanico_asignado' && candidate.titulo.startsWith('Te asignaron'),
    );
    expect(asignacion).toBeDefined();

    // El mecánico anterior sí recibe aviso, pero del tipo "ya no está a tu cargo".
    // Lo que no debe recibir es el "te asignaron" de una orden que no es suya.
    const anteriorCookies = await loginAs(`${TEST_EMAIL_PREFIX}mecanico@unithor.local`);
    const delAnterior = await request(app)
      .get('/api/notifications')
      .set('Cookie', authCookie(anteriorCookies));
    expect(
      delAnterior.body.items.filter(
        (candidate: { tipo: string; titulo: string }) =>
          candidate.tipo === 'mecanico_asignado' && candidate.titulo.startsWith('Te asignaron'),
      ),
    ).toHaveLength(0);
    expect(
      delAnterior.body.items.some(
        (candidate: { tipo: string; titulo: string }) =>
          candidate.tipo === 'mecanico_asignado' && candidate.titulo.includes('ya no está a tu cargo'),
      ),
    ).toBe(true);
  });

  it('notifica al mecánico y a ventas cuando cambia el estado de la orden', async () => {
    const response = await request(app)
      .patch(`/api/work-orders/${workOrderId}/status`)
      .set('Cookie', authCookie(supervisorCookies))
      .set('X-CSRF-Token', supervisorCookies.csrfToken)
      .send({ nuevoEstado: 'esperando_repuesto' });
    expect(response.status).toBe(200);

    for (const email of [
      `${TEST_EMAIL_PREFIX}mecanico@unithor.local`,
      `${TEST_EMAIL_PREFIX}mecanico2@unithor.local`,
      `${TEST_EMAIL_PREFIX}vendedor@unithor.local`,
    ]) {
      const cookies = await loginAs(email);
      const list = await request(app)
        .get('/api/notifications')
        .set('Cookie', authCookie(cookies));
      expect(list.status).toBe(200);
      const item = list.body.items.find(
        (candidate: { tipo: string }) => candidate.tipo === 'ot_estado_cambiado',
      );
      expect(item).toBeDefined();
      expect(item.nivel).toBe('info');
    }
  });

  it('no duplica notificaciones cuando se repite el mismo evento', async () => {
    const mecanicoCookies = await loginAs(`${TEST_EMAIL_PREFIX}mecanico@unithor.local`);
    const first = await request(app)
      .get('/api/notifications')
      .set('Cookie', authCookie(mecanicoCookies));
    const firstCount = first.body.items.filter(
      (candidate: { tipo: string }) => candidate.tipo === 'solicitud_aprobada',
    ).length;

    const again = await request(app)
      .patch(`/api/work-orders/${workOrderId}/status`)
      .set('Cookie', authCookie(supervisorCookies))
      .set('X-CSRF-Token', supervisorCookies.csrfToken)
      .send({ nuevoEstado: 'en_progreso' });
    expect(again.status).toBe(200);

    const second = await request(app)
      .get('/api/notifications')
      .set('Cookie', authCookie(mecanicoCookies));
    const secondCount = second.body.items.filter(
      (candidate: { tipo: string }) => candidate.tipo === 'solicitud_aprobada',
    ).length;

    expect(secondCount).toBe(firstCount);
  });

  it('crea la notificación de Cotización para el jefe y el comercial', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);
    const create = await request(app)
      .post('/api/quotations')
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        clientId,
        notas: 'Cotización de prueba de notificaciones',
        items: [
          {
            descripcion: 'Service notificable',
            tipoLinea: 'estandar',
            unidadMedida: 'servicio',
            cantidad: 1,
            precioUnitario: 30000,
          },
        ],
      });
    expect(create.status).toBe(201);

    const jefeCookies = await loginAs(`${TEST_EMAIL_PREFIX}jefe@unithor.local`);
    const list = await request(app)
      .get('/api/notifications')
      .set('Cookie', authCookie(jefeCookies));
    const item = list.body.items.find(
      (candidate: { tipo: string }) => candidate.tipo === 'cotizacion_creada',
    );
    expect(item).toBeDefined();
    expect(item.quotationId).toBe(create.body.quotation.id);

    // El comercial no debe recibir su propia notificación.
    const own = await request(app)
      .get('/api/notifications')
      .set('Cookie', authCookie(vendedorCookies));
    expect(
      own.body.items.filter(
        (candidate: { tipo: string }) => candidate.tipo === 'cotizacion_creada',
      ),
    ).toHaveLength(0);
  });

  it('aisla las notificaciones por usuario y permite borrarlas', async () => {
    const jefeIdBefore = await Notification.count({ where: { userId: jefeId } });
    expect(jefeIdBefore).toBeGreaterThan(0);

    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);
    const cleared = await request(app)
      .delete('/api/notifications')
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken);
    expect(cleared.status).toBe(200);

    const remaining = await Notification.count({ where: { userId: vendedorId } });
    expect(remaining).toBe(0);
    // Borrar las del vendedor no toca las del jefe.
    expect(await Notification.count({ where: { userId: jefeId } })).toBe(jefeIdBefore);
    expect(await CatalogItem.count({ where: { id: catalogPartId } })).toBe(1);
  });
});
