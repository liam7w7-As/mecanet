import { Op } from 'sequelize';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { CatalogItem } from '../../models/CatalogItem.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { WorkOrderEvent } from '../../models/WorkOrderEvent.js';
import { WorkOrderItem } from '../../models/WorkOrderItem.js';
import { WorkOrderProgressReport } from '../../models/WorkOrderProgressReport.js';
import { WorkOrderRequest } from '../../models/WorkOrderRequest.js';
import { hashPassword } from '../../utils/password.js';

const TEST_PASSWORD = 'Desarrollador2026!';
const TEST_EMAIL = 'mechanic-flow@unithor.local';
const TEST_CODE_PREFIX = `OT-${new Date().getFullYear()}-87`;
const TEST_PART_CODE = 'MECH-FLOW-PART';

interface LoginCookies {
  accessToken: string;
  csrfToken: string;
}

const extractCookies = (response: request.Response): Record<string, string> => {
  const header = response.headers['set-cookie'];
  const values = Array.isArray(header) ? header : typeof header === 'string' ? [header] : [];
  return values.reduce<Record<string, string>>((result, value) => {
    const [pair] = value.split(';');
    const separator = pair.indexOf('=');
    if (separator > 0) result[pair.slice(0, separator)] = pair.slice(separator + 1);
    return result;
  }, {});
};

const loginAs = async (identifier: string): Promise<LoginCookies> => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email: identifier, password: TEST_PASSWORD });
  expect(response.status).toBe(200);
  const cookies = extractCookies(response);
  return { accessToken: cookies.access_token, csrfToken: cookies.csrf_token };
};

const authCookie = (cookies: LoginCookies): string[] => [
  `access_token=${cookies.accessToken}`,
  `csrf_token=${cookies.csrfToken}`,
];

describe('Work order mechanic workflow (E2E)', () => {
  let mechanicId: number;
  let assignedWorkOrderId: number;
  let foreignWorkOrderId: number;
  let serviceItemId: number;
  let partId: number;

  beforeAll(async () => {
    await sequelize.authenticate();
    const oldOrders = await WorkOrder.findAll({
      where: { codigo: { [Op.like]: `${TEST_CODE_PREFIX}%` } },
      paranoid: false,
    });
    const oldOrderIds = oldOrders.map((order) => order.id);
    if (oldOrderIds.length > 0) {
      await WorkOrderRequest.destroy({ where: { workOrderId: oldOrderIds } });
      await WorkOrderProgressReport.destroy({ where: { workOrderId: oldOrderIds } });
      await WorkOrderEvent.destroy({ where: { workOrderId: oldOrderIds } });
      await WorkOrderItem.destroy({ where: { workOrderId: oldOrderIds } });
      await WorkOrder.destroy({ where: { id: oldOrderIds }, force: true });
    }
    const previousUser = await User.findOne({ where: { email: TEST_EMAIL }, paranoid: false });
    if (previousUser) {
      await RefreshToken.destroy({ where: { userId: previousUser.id }, force: true });
      await previousUser.destroy({ force: true });
    }
    await CatalogItem.destroy({ where: { codigo: TEST_PART_CODE }, force: true });

    const [mechanicRole, devUser] = await Promise.all([
      Role.findOne({ where: { nombre: 'mecanico' } }),
      User.findOne({ where: { email: 'dev@unithor.local' } }),
    ]);
    if (!mechanicRole || !devUser) throw new Error('Faltan roles base para la prueba de mecánico');
    const passwordHash = await hashPassword(TEST_PASSWORD);
    await devUser.update({ passwordHash, activo: true });
    const mechanic = await User.create({
      nombre: 'Mecánico Flujo',
      email: TEST_EMAIL,
      passwordHash,
      roleId: mechanicRole.id,
      activo: true,
    });
    mechanicId = mechanic.id;

    const assigned = await WorkOrder.create({
      codigo: `${TEST_CODE_PREFIX}01`,
      estado: 'en_progreso',
      descripcion: 'Orden asignada al mecánico',
      assignedMechanicId: mechanicId,
      createdBy: devUser.id,
    });
    const foreign = await WorkOrder.create({
      codigo: `${TEST_CODE_PREFIX}02`,
      estado: 'en_progreso',
      descripcion: 'Orden de otro mecánico',
      createdBy: devUser.id,
    });
    assignedWorkOrderId = assigned.id;
    foreignWorkOrderId = foreign.id;
    const service = await WorkOrderItem.create({
      workOrderId: assigned.id,
      catalogItemId: null,
      descripcion: 'Diagnóstico avanzado',
      cantidad: 1,
      precioUnitario: 25000,
      subtotal: 25000,
      estadoOperativo: 'pendiente',
      notasOperativas: null,
      stockConsumido: false,
      stockConsumidoCantidad: 0,
      stockConsumidoAt: null,
    });
    serviceItemId = service.id;
    const part = await CatalogItem.create({
      tipo: 'parte',
      codigo: TEST_PART_CODE,
      nombre: 'Repuesto flujo mecánico',
      descripcion: null,
      precio: 9000,
      stock: 10,
    });
    partId = part.id;
  });

  afterAll(async () => {
    const orderIds = [assignedWorkOrderId, foreignWorkOrderId].filter(Boolean);
    await WorkOrderRequest.destroy({ where: { workOrderId: orderIds } });
    await WorkOrderProgressReport.destroy({ where: { workOrderId: orderIds } });
    await WorkOrderEvent.destroy({ where: { workOrderId: orderIds } });
    await WorkOrderItem.destroy({ where: { workOrderId: orderIds } });
    await WorkOrder.destroy({ where: { id: orderIds }, force: true });
    await CatalogItem.destroy({ where: { id: partId }, force: true });
    await RefreshToken.destroy({ where: { userId: mechanicId }, force: true });
    await User.destroy({ where: { id: mechanicId }, force: true });
  });

  it('limita el listado y detalle del mecánico a las órdenes que tiene asignadas', async () => {
    const cookies = await loginAs(TEST_EMAIL);
    const listResponse = await request(app)
      .get('/api/work-orders')
      .set('Cookie', authCookie(cookies));
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.items.map((order: { id: number }) => order.id)).toContain(
      assignedWorkOrderId,
    );
    expect(listResponse.body.items.map((order: { id: number }) => order.id)).not.toContain(
      foreignWorkOrderId,
    );

    const detailResponse = await request(app)
      .get(`/api/work-orders/${foreignWorkOrderId}`)
      .set('Cookie', authCookie(cookies));
    expect(detailResponse.status).toBe(404);
  });

  it('permite reportar avance pero impide editar la cabecera o los precios', async () => {
    const cookies = await loginAs(TEST_EMAIL);
    const executionResponse = await request(app)
      .patch(`/api/work-orders/${assignedWorkOrderId}/execution`)
      .set('Cookie', authCookie(cookies))
      .set('X-CSRF-Token', cookies.csrfToken)
      .send({
        items: [{ id: serviceItemId, estadoOperativo: 'completado', notasOperativas: 'Listo' }],
        reporte: { porcentaje: 60, comentario: 'Diagnóstico concluido' },
      });
    expect(executionResponse.status).toBe(200);
    expect(executionResponse.body.workOrder.items[0]).toMatchObject({
      estadoOperativo: 'completado',
      precioUnitario: 25000,
    });
    expect(executionResponse.body.workOrder.progressReports[0]).toMatchObject({ porcentaje: 60 });

    const forbiddenResponse = await request(app)
      .patch(`/api/work-orders/${assignedWorkOrderId}`)
      .set('Cookie', authCookie(cookies))
      .set('X-CSRF-Token', cookies.csrfToken)
      .send({ items: [{ descripcion: 'Cambio indebido', cantidad: 1, precioUnitario: 1 }] });
    expect(forbiddenResponse.status).toBe(403);
  });

  it('somete repuestos y aumentos a aprobación del jefe antes de aplicarlos', async () => {
    const mechanicCookies = await loginAs(TEST_EMAIL);
    const partRequestResponse = await request(app)
      .post(`/api/work-orders/${assignedWorkOrderId}/requests`)
      .set('Cookie', authCookie(mechanicCookies))
      .set('X-CSRF-Token', mechanicCookies.csrfToken)
      .send({ tipo: 'repuesto', catalogItemId: partId, cantidad: 2, motivo: 'Daño encontrado' });
    expect(partRequestResponse.status).toBe(201);
    const partRequest = partRequestResponse.body.workOrder.requests.find(
      (entry: { tipo: string }) => entry.tipo === 'repuesto',
    );
    expect(partRequest.estado).toBe('pendiente');
    expect(await WorkOrderItem.count({ where: { workOrderId: assignedWorkOrderId } })).toBe(1);

    const priceRequestResponse = await request(app)
      .post(`/api/work-orders/${assignedWorkOrderId}/requests`)
      .set('Cookie', authCookie(mechanicCookies))
      .set('X-CSRF-Token', mechanicCookies.csrfToken)
      .send({
        tipo: 'aumento_precio',
        workOrderItemId: serviceItemId,
        precioSugerido: 35000,
        motivo: 'Mayor complejidad de la prevista',
      });
    expect(priceRequestResponse.status).toBe(201);
    const priceRequest = priceRequestResponse.body.workOrder.requests.find(
      (entry: { tipo: string }) => entry.tipo === 'aumento_precio',
    );

    const devCookies = await loginAs('dev@unithor.local');
    const approvePartResponse = await request(app)
      .patch(`/api/work-orders/${assignedWorkOrderId}/requests/${partRequest.id}`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({ decision: 'aprobar' });
    expect(approvePartResponse.status).toBe(200);
    expect(await WorkOrderItem.count({ where: { workOrderId: assignedWorkOrderId } })).toBe(2);

    const approvePriceResponse = await request(app)
      .patch(`/api/work-orders/${assignedWorkOrderId}/requests/${priceRequest.id}`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({ decision: 'aprobar', precioAprobado: 32000 });
    expect(approvePriceResponse.status).toBe(200);
    expect(Number((await WorkOrderItem.findByPk(serviceItemId))?.precioUnitario)).toBe(32000);
  });
});
