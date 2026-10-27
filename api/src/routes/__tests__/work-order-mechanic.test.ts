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
import { WorkOrder } from '../../models/WorkOrder.js';
import { WorkOrderEvent } from '../../models/WorkOrderEvent.js';
import { WorkOrderItem } from '../../models/WorkOrderItem.js';
import { WorkOrderItemSession } from '../../models/WorkOrderItemSession.js';
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
  let warehouseId: number;

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
    const warehouse = await Warehouse.findOne({ where: { codigo: 'CENTRAL', activo: true } });
    if (!warehouse) throw new Error('Falta la bodega CENTRAL para la prueba de mecánico');
    warehouseId = warehouse.id;
    await StockBalance.upsert({ warehouseId, catalogItemId: partId, cantidad: 10 });
  });

  afterAll(async () => {
    const orderIds = [assignedWorkOrderId, foreignWorkOrderId].filter(Boolean);
    await WorkOrderRequest.destroy({ where: { workOrderId: orderIds } });
    await WorkOrderProgressReport.destroy({ where: { workOrderId: orderIds } });
    await WorkOrderEvent.destroy({ where: { workOrderId: orderIds } });
    await WorkOrderItem.destroy({ where: { workOrderId: orderIds } });
    await WorkOrder.destroy({ where: { id: orderIds }, force: true });
    await StockMovement.destroy({ where: { catalogItemId: partId }, force: true });
    await StockBalance.destroy({ where: { catalogItemId: partId }, force: true });
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
    expect(executionResponse.body.workOrder).toBeUndefined();
    const worksheet = executionResponse.body.worksheet;
    const updatedItem = worksheet.items.find((item: { id: number }) => item.id === serviceItemId);
    expect(updatedItem).toMatchObject({ estadoOperativo: 'completado' });
    // El mecánico nunca recibe precios en la ficha.
    expect(updatedItem.precioUnitario).toBeUndefined();
    expect(worksheet.progressReports[0]).toMatchObject({ porcentaje: 60 });

    const detailResponse = await request(app)
      .get(`/api/work-orders/${assignedWorkOrderId}`)
      .set('Cookie', authCookie(cookies));
    expect(detailResponse.status).toBe(403);

    const forbiddenResponse = await request(app)
      .patch(`/api/work-orders/${assignedWorkOrderId}`)
      .set('Cookie', authCookie(cookies))
      .set('X-CSRF-Token', cookies.csrfToken)
      .send({ items: [{ descripcion: 'Cambio indebido', cantidad: 1, precioUnitario: 1 }] });
    expect(forbiddenResponse.status).toBe(403);
  });

  it('somete repuestos y aumentos a aprobación del jefe antes de aplicarlos', async () => {
    const mechanicCookies = await loginAs(TEST_EMAIL);
    const devCookies = await loginAs('dev@unithor.local');
    const partRequestResponse = await request(app)
      .post(`/api/work-orders/${assignedWorkOrderId}/requests`)
      .set('Cookie', authCookie(mechanicCookies))
      .set('X-CSRF-Token', mechanicCookies.csrfToken)
      .send({ tipo: 'repuesto', catalogItemId: partId, cantidad: 2, motivo: 'Daño encontrado' });
    expect(partRequestResponse.status).toBe(201);
    expect(partRequestResponse.body.workOrder).toBeUndefined();
    expect(partRequestResponse.body.worksheet.workOrder.id).toBe(assignedWorkOrderId);
    const partRequest = await WorkOrderRequest.findOne({
      where: { workOrderId: assignedWorkOrderId, tipo: 'repuesto' },
      order: [['id', 'DESC']],
    });
    if (!partRequest) throw new Error('No se creó la solicitud de repuesto');
    expect(partRequest.estado).toBe('pendiente');
    expect(await WorkOrderItem.count({ where: { workOrderId: assignedWorkOrderId } })).toBe(1);

    // El mecánico no puede sugerir aumentos de precio.
    const mechanicPriceRequest = await request(app)
      .post(`/api/work-orders/${assignedWorkOrderId}/requests`)
      .set('Cookie', authCookie(mechanicCookies))
      .set('X-CSRF-Token', mechanicCookies.csrfToken)
      .send({
        tipo: 'aumento_precio',
        workOrderItemId: serviceItemId,
        precioSugerido: 35000,
        motivo: 'Mayor complejidad de la prevista',
      });
    expect(mechanicPriceRequest.status).toBe(403);

    const priceRequestResponse = await request(app)
      .post(`/api/work-orders/${assignedWorkOrderId}/requests`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({
        tipo: 'aumento_precio',
        workOrderItemId: serviceItemId,
        precioSugerido: 35000,
        motivo: 'Mayor complejidad de la prevista',
      });
    expect(priceRequestResponse.status).toBe(201);
    const priceRequest = await WorkOrderRequest.findOne({
      where: { workOrderId: assignedWorkOrderId, tipo: 'aumento_precio' },
      order: [['id', 'DESC']],
    });
    if (!priceRequest) throw new Error('No se creó la solicitud de aumento');

    const approvePartResponse = await request(app)
      .patch(`/api/work-orders/${assignedWorkOrderId}/requests/${partRequest.id}`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({ decision: 'aprobar' });
    expect(approvePartResponse.status).toBe(200);
    expect(await WorkOrderItem.count({ where: { workOrderId: assignedWorkOrderId } })).toBe(2);
    const approvedPartRequest = approvePartResponse.body.workOrder.requests.find(
      (entry: { id: number }) => entry.id === partRequest.id,
    );
    expect(approvedPartRequest).toMatchObject({ estado: 'aprobada' });
    expect(approvedPartRequest.workOrderItemId).toEqual(expect.any(Number));

    const prematureCompletion = await request(app)
      .patch(`/api/work-orders/${assignedWorkOrderId}/execution`)
      .set('Cookie', authCookie(mechanicCookies))
      .set('X-CSRF-Token', mechanicCookies.csrfToken)
      .send({
        items: [{ id: approvedPartRequest.workOrderItemId, estadoOperativo: 'completado' }],
      });
    expect(prematureCompletion.status).toBe(400);
    expect(prematureCompletion.body.error.message).toContain('Bodega debe entregar');

    const queueResponse = await request(app)
      .get('/api/warehouses/requests')
      .query({ estado: 'aprobada' })
      .set('Cookie', authCookie(devCookies));
    expect(queueResponse.status).toBe(200);
    expect(queueResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: partRequest.id, workOrderId: assignedWorkOrderId }),
      ]),
    );

    const deliveryResponse = await request(app)
      .post(`/api/warehouses/requests/${partRequest.id}/deliver`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({ warehouseId, comentario: 'Entrega en mesón de taller' });
    expect(deliveryResponse.status).toBe(200);
    expect(deliveryResponse.body.request).toMatchObject({
      id: partRequest.id,
      estado: 'entregada',
      deliveredWarehouse: { id: warehouseId, codigo: 'CENTRAL' },
    });
    expect((await StockBalance.findOne({ where: { warehouseId, catalogItemId: partId } }))?.cantidad).toBe(8);

    const completionAfterDelivery = await request(app)
      .patch(`/api/work-orders/${assignedWorkOrderId}/execution`)
      .set('Cookie', authCookie(mechanicCookies))
      .set('X-CSRF-Token', mechanicCookies.csrfToken)
      .send({
        items: [{ id: approvedPartRequest.workOrderItemId, estadoOperativo: 'completado' }],
      });
    expect(completionAfterDelivery.status).toBe(200);

    const approvePriceResponse = await request(app)
      .patch(`/api/work-orders/${assignedWorkOrderId}/requests/${priceRequest.id}`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({ decision: 'aprobar', precioAprobado: 32000 });
    expect(approvePriceResponse.status).toBe(200);
    expect(Number((await WorkOrderItem.findByPk(serviceItemId))?.precioUnitario)).toBe(32000);
  });

  it('registra horas con cronómetro, ajusta, valida y restringe la ficha al mecánico', async () => {
    const mechanicCookies = await loginAs(TEST_EMAIL);
    const devCookies = await loginAs('dev@unithor.local');
    const timerItem = await WorkOrderItem.create({
      workOrderId: assignedWorkOrderId,
      catalogItemId: null,
      descripcion: 'Cambio de aceite y filtro',
      cantidad: 2,
      precioUnitario: 10000,
      subtotal: 20000,
      estadoOperativo: 'pendiente',
      notasOperativas: null,
      stockConsumido: false,
      stockConsumidoCantidad: 0,
      stockConsumidoAt: null,
    });

    const worksheetResponse = await request(app)
      .get(`/api/work-orders/${assignedWorkOrderId}/worksheet`)
      .set('Cookie', authCookie(mechanicCookies));
    expect(worksheetResponse.status).toBe(200);
    const worksheetItem = worksheetResponse.body.worksheet.items.find(
      (item: { id: number }) => item.id === timerItem.id,
    );
    expect(worksheetItem).toMatchObject({ cantidad: 2, horasHombreEstimadas: null });
    expect(worksheetItem.precioUnitario).toBeUndefined();
    expect(worksheetItem.subtotal).toBeUndefined();

    // El jefe define el tiempo estimado por unidad; el total se multiplica por cantidad.
    const estimateResponse = await request(app)
      .patch(`/api/work-orders/${assignedWorkOrderId}/items/${timerItem.id}/estimate`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({ horasHombreEstimadas: 0.5 });
    expect(estimateResponse.status).toBe(200);
    const estimatedItem = estimateResponse.body.worksheet.items.find(
      (item: { id: number }) => item.id === timerItem.id,
    );
    expect(estimatedItem).toMatchObject({
      horasHombreEstimadas: 0.5,
      horasEstimadasTotales: 1,
    });

    // El mecánico no puede asignar ni estimar horas.
    const mechanicAssign = await request(app)
      .post(`/api/work-orders/${assignedWorkOrderId}/items/${timerItem.id}/assignment`)
      .set('Cookie', authCookie(mechanicCookies))
      .set('X-CSRF-Token', mechanicCookies.csrfToken)
      .send({ assignedUserId: mechanicId });
    expect(mechanicAssign.status).toBe(403);
    const mechanicEstimate = await request(app)
      .patch(`/api/work-orders/${assignedWorkOrderId}/items/${timerItem.id}/estimate`)
      .set('Cookie', authCookie(mechanicCookies))
      .set('X-CSRF-Token', mechanicCookies.csrfToken)
      .send({ horasHombreEstimadas: 2 });
    expect(mechanicEstimate.status).toBe(403);

    const startResponse = await request(app)
      .post(`/api/work-orders/${assignedWorkOrderId}/items/${timerItem.id}/start`)
      .set('Cookie', authCookie(mechanicCookies))
      .set('X-CSRF-Token', mechanicCookies.csrfToken);
    expect(startResponse.status).toBe(200);
    const startedItem = startResponse.body.worksheet.items.find(
      (item: { id: number }) => item.id === timerItem.id,
    );
    expect(startedItem).toMatchObject({ estadoOperativo: 'en_proceso' });
    expect(startedItem.activeSession).toMatchObject({ mine: true, userId: mechanicId });

    await WorkOrderItemSession.update(
      { startedAt: new Date(Date.now() - 30 * 60_000) },
      { where: { workOrderItemId: timerItem.id, status: 'abierta' } },
    );

    const pauseResponse = await request(app)
      .post(`/api/work-orders/${assignedWorkOrderId}/items/${timerItem.id}/pause`)
      .set('Cookie', authCookie(mechanicCookies))
      .set('X-CSRF-Token', mechanicCookies.csrfToken);
    expect(pauseResponse.status).toBe(200);
    const pausedItem = pauseResponse.body.worksheet.items.find(
      (item: { id: number }) => item.id === timerItem.id,
    );
    expect(pausedItem.horasHombreReales).toBe(0.5);
    expect(pausedItem.totalMinutes).toBeGreaterThanOrEqual(30);

    const completeResponse = await request(app)
      .post(`/api/work-orders/${assignedWorkOrderId}/items/${timerItem.id}/complete`)
      .set('Cookie', authCookie(mechanicCookies))
      .set('X-CSRF-Token', mechanicCookies.csrfToken)
      .send({ notasOperativas: 'Aceite y filtro reemplazados' });
    expect(completeResponse.status).toBe(200);
    const completedItem = completeResponse.body.worksheet.items.find(
      (item: { id: number }) => item.id === timerItem.id,
    );
    expect(completedItem).toMatchObject({
      estadoOperativo: 'completado',
      notasOperativas: 'Aceite y filtro reemplazados',
      horasHombreReales: 0.5,
      laborValidatedAt: null,
    });

    // El mecánico no puede ajustar ni validar horas.
    const mechanicAdjust = await request(app)
      .post(`/api/work-orders/${assignedWorkOrderId}/items/${timerItem.id}/hours/adjust`)
      .set('Cookie', authCookie(mechanicCookies))
      .set('X-CSRF-Token', mechanicCookies.csrfToken)
      .send({ minutos: 30, motivo: 'Trabajo adicional' });
    expect(mechanicAdjust.status).toBe(403);
    const mechanicValidate = await request(app)
      .post(`/api/work-orders/${assignedWorkOrderId}/items/${timerItem.id}/hours/validate`)
      .set('Cookie', authCookie(mechanicCookies))
      .set('X-CSRF-Token', mechanicCookies.csrfToken)
      .send({ comentario: 'OK' });
    expect(mechanicValidate.status).toBe(403);

    const adjustResponse = await request(app)
      .post(`/api/work-orders/${assignedWorkOrderId}/items/${timerItem.id}/hours/adjust`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({ minutos: 30, motivo: 'Trabajo adicional no cronometrado' });
    expect(adjustResponse.status).toBe(200);
    const adjustedItem = adjustResponse.body.worksheet.items.find(
      (item: { id: number }) => item.id === timerItem.id,
    );
    expect(adjustedItem.horasHombreReales).toBe(1);

    const validateResponse = await request(app)
      .post(`/api/work-orders/${assignedWorkOrderId}/items/${timerItem.id}/hours/validate`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({ comentario: 'Horas revisadas contra el trabajo real' });
    expect(validateResponse.status).toBe(200);
    const validatedItem = validateResponse.body.worksheet.items.find(
      (item: { id: number }) => item.id === timerItem.id,
    );
    expect(validatedItem.laborValidatedAt).toEqual(expect.any(String));
    expect(validatedItem.laborValidationNote).toBe('Horas revisadas contra el trabajo real');

    // Observaciones con texto y vínculo al trabajo, sin exponer precios.
    const observationResponse = await request(app)
      .post(`/api/work-orders/${assignedWorkOrderId}/observations`)
      .set('Cookie', authCookie(mechanicCookies))
      .set('X-CSRF-Token', mechanicCookies.csrfToken)
      .field('texto', 'Se detectó desgaste en la correa auxiliar')
      .field('workOrderItemId', String(timerItem.id));
    expect(observationResponse.status).toBe(201);
    expect(observationResponse.body.worksheet.observations[0]).toMatchObject({
      texto: 'Se detectó desgaste en la correa auxiliar',
      itemId: timerItem.id,
    });

    // Sugerencias de precio: solo jefe/admin, aprobación de administración.
    const mechanicSuggestionList = await request(app)
      .get(`/api/work-orders/${assignedWorkOrderId}/price-suggestions`)
      .set('Cookie', authCookie(mechanicCookies));
    expect(mechanicSuggestionList.status).toBe(403);
    const mechanicSuggestion = await request(app)
      .post(`/api/work-orders/${assignedWorkOrderId}/price-suggestions`)
      .set('Cookie', authCookie(mechanicCookies))
      .set('X-CSRF-Token', mechanicCookies.csrfToken)
      .send({
        workOrderItemId: timerItem.id,
        precioSugerido: 30000,
        alcance: 'ot',
        motivo: 'Mayor tiempo real del estimado',
      });
    expect(mechanicSuggestion.status).toBe(403);

    const suggestionResponse = await request(app)
      .post(`/api/work-orders/${assignedWorkOrderId}/price-suggestions`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({
        workOrderItemId: timerItem.id,
        precioSugerido: 30000,
        alcance: 'ot',
        motivo: 'Mayor tiempo real del estimado',
      });
    expect(suggestionResponse.status).toBe(201);
    expect(suggestionResponse.body.suggestion).toMatchObject({
      estado: 'pendiente',
      horasReales: 1,
      alcance: 'ot',
    });

    const approveSuggestion = await request(app)
      .patch(
        `/api/work-orders/${assignedWorkOrderId}/price-suggestions/${suggestionResponse.body.suggestion.id}`,
      )
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({ decision: 'aprobar', comentario: 'Aprobado por tiempo real' });
    expect(approveSuggestion.status).toBe(200);
    expect(Number((await WorkOrderItem.findByPk(timerItem.id))?.precioUnitario)).toBe(30000);

    // Reporte diario interno: accesible a supervisores, no al mecánico.
    const mechanicReport = await request(app)
      .get('/api/work-orders/reports/daily')
      .set('Cookie', authCookie(mechanicCookies));
    expect(mechanicReport.status).toBe(403);
    const dailyReport = await request(app)
      .get('/api/work-orders/reports/daily')
      .set('Cookie', authCookie(devCookies));
    expect(dailyReport.status).toBe(200);
    expect(dailyReport.body.report.usuarios).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: mechanicId, rol: 'mecanico' }),
      ]),
    );
    expect(dailyReport.body.report.ordenes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: assignedWorkOrderId }),
      ]),
    );
  });
});
