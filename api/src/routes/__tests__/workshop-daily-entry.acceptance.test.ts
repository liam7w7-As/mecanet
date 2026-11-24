import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { Client, Quotation, QuotationItem, Role, User, Vehicle, WorkOrder, WorkOrderItem, WorkOrderItemAssignment, WorkOrderItemProgressEvent, WorkOrderItemSession } from '../../models/index.js';
import { WorkshopTimeRequest } from '../../models/WorkshopTimeRequest.js';
import { hashPassword } from '../../utils/password.js';

const date = '2026-11-19';
const start = `${date}T12:00:00.000Z`;
const end = `${date}T13:00:00.000Z`;
const endpoint = '/api/workshop-time/daily-entries';
const password = 'DailyAcceptance2026!';

describe('Daily workshop activity: execution, reviewed hours and quality', () => {
  const users: User[] = [];
  const cookies: string[][] = [];
  let client: Client;
  let vehicle: Vehicle;
  const login = async (index: number): Promise<void> => {
    const response = await request(app).post('/api/auth/login').send({ email: users[index].email, password });
    expect(response.status).toBe(200);
    cookies[index] = (response.headers['set-cookie'] as unknown as string[]).map((cookie) => cookie.split(';')[0]);
  };

  const post = (path: string, body: object, actor = 1) => request(app).post(path)
    .set('Cookie', cookies[actor])
    .set('X-CSRF-Token', cookies[actor].find((cookie) => cookie.startsWith('csrf_token='))!.slice(11))
    .send(body);
  const review = (id: number) => request(app).patch(`/api/workshop-time/requests/${id}/review`)
    .set('Cookie', cookies[0])
    .set('X-CSRF-Token', cookies[0].find((cookie) => cookie.startsWith('csrf_token='))!.slice(11))
    .send({ approve: true, note: 'Horas contrastadas por el jefe de taller' });

  beforeAll(async () => {

    if (sequelize.getDatabaseName() !== 'unithor_test') throw new Error('Solo unithor_test');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(start));
    await User.destroy({ where: { email: [0, 1, 2, 3].map((index) => `daily-acceptance-${index}@example.test`) }, force: true });

    const hash = await hashPassword(password);
    for (const [index, roleName] of ['desarrollador', 'mecanico', 'mecanico', 'bodeguero'].entries()) {
      const role = await Role.findOne({ where: { nombre: roleName } });
      if (!role) throw new Error(`Falta rol ${roleName}`);
      const user = await User.create({ nombre: `Daily fixture ${index}`, email: `daily-acceptance-${index}@example.test`, passwordHash: hash, roleId: role.id, activo: true });
      users.push(user);
      await login(index);

    }
    client = await Client.create({ nombre: 'Cliente registro diario', tipo: 'cliente' });
    [vehicle] = await Vehicle.findOrCreate({ where: { patente: 'DRTEST' }, defaults: { patente: 'DRTEST', clientId: client.id } });
    await vehicle.update({ clientId: client.id });
  }, 30_000);

  afterAll(async () => { vi.useRealTimers(); await sequelize.close(); });

  beforeEach(async () => {
    // These workers belong exclusively to this acceptance suite. Each scenario
    // needs an empty day so its valid interval does not overlap the prior test.
    const ids = users.map((user) => user.id);
    await WorkshopTimeRequest.destroy({ where: { createdBy: ids } });
    await WorkOrderItemProgressEvent.destroy({ where: { performedByUserId: ids } });
    await WorkOrderItemSession.destroy({ where: { userId: ids } });
  });

  const fixture = async (members = [1]) => {
    vi.setSystemTime(new Date(start));
    await login(0);
    const created = await post('/api/work-orders', {
      clientId: client.id, vehicleId: vehicle.id,
      items: [{ descripcion: 'Diagnóstico del registro diario', tipoLinea: 'especifico', cantidad: 1, precioUnitario: 15000 }],
    }, 0);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const orderId = Number(created.body.workOrder.id);
    const item = await WorkOrderItem.findOne({ where: { workOrderId: orderId } });
    if (!item) throw new Error('Falta servicio');
    const team = await post(`/api/work-orders/${orderId}/items/${item.id}/team`, {
      members: members.map((index) => ({ userId: users[index].id, estimatedHours: 3 })),
      motivo: 'Responsables para el registro diario',
    }, 0);
    expect(team.status, JSON.stringify(team.body)).toBe(200);
    let quotation = await Quotation.findOne({ where: { workOrderId: orderId } });
    if (!quotation) {
      const response = await post('/api/quotations', { workOrderId: orderId }, 0);
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      quotation = await Quotation.findOne({ where: { workOrderId: orderId } });
    }
    if (!quotation) throw new Error('Falta cotización espejo');
    vi.setSystemTime(new Date(`${date}T20:00:00.000Z`));
    for (const index of users.keys()) await login(index);
    return { orderId, item, quotation };
  };
  const body = (orderId: number, itemId: number, activityStatus: 'en_proceso' | 'completado' = 'completado') => ({
    clientRequestId: randomUUID(), workOrderId: orderId, itemId, fecha: date,
    startedAt: start, endedAt: end, note: 'Trabajo del día registrado para revisión', activityStatus,
  });

  it('requires authentication, the workshop role and an active CSRF token', async () => {
    const data = body(1, 1);
    expect((await request(app).post(endpoint).set('Cookie', ['csrf_token=anonymous-test']).set('X-CSRF-Token', 'anonymous-test').send(data)).status).toBe(401);
    expect((await post(endpoint, data, 3)).status).toBe(403);
    expect((await request(app).post(endpoint).set('Cookie', cookies[1]).send(data)).status).toBe(403);
  }, 15_000);

  it('updates OT and COT immediately while hours and quality remain subject to chief review', async () => {
    const { orderId, item, quotation } = await fixture();
    const saved = await post(endpoint, body(orderId, item.id));
    expect(saved.status, JSON.stringify(saved.body)).toBe(201);
    expect(saved.body.request).toMatchObject({ status: 'pendiente', activityStatus: 'completado', durationMinutes: 60 });
    const journal = await request(app).get('/api/workshop-time').query({ fecha: date }).set('Cookie', cookies[1]);
    expect(journal.status).toBe(200);
    expect(journal.body.timezone).toBe('America/Santiago');
    await item.reload();
    expect(item.estadoOperativo).toBe('completado');
    expect(item.qualityStatus).toBe('pendiente');
    expect(item.qualityReviewedBy).toBeNull();
    expect(await WorkOrderItemSession.count({ where: { workOrderItemId: item.id } })).toBe(0);
    const mirror = await QuotationItem.findOne({ where: { quotationId: quotation.id, workOrderItemId: item.id } });
    expect(mirror?.estadoOperativo).toBe('completado');
    const order = await WorkOrder.findByPk(orderId);
    expect(order?.estado).toBe('en_progreso');
    expect(order?.qualityApprovedAt).toBeNull();
    expect((await post(`/api/work-orders/${orderId}/items/${item.id}/quality`, { decision: 'aprobar', nota: 'Intento del mecánico' })).status).toBe(403);
    expect((await post(`/api/work-orders/${orderId}/quality/confirm`, { notas: 'Intento del mecánico' })).status).toBe(403);
    expect((await review(Number(saved.body.request.id))).status).toBe(200);
    expect(Number((await item.reload()).horasHombreReales)).toBe(1);
    expect(item.qualityStatus).toBe('pendiente');
  }, 15_000);

  it('saves declared hours without a work interval and preserves them through chief approval and reports', async () => {
    const { orderId, item, quotation } = await fixture();
    const { startedAt: _start, endedAt: _end, ...data } = body(orderId, item.id);
    const saved = await post(endpoint, { ...data, horasUtilizadas: 1.5 });
    expect(saved.status, JSON.stringify(saved.body)).toBe(201);
    expect(saved.body.request).toMatchObject({ reportedDate: date, durationMinutes: 90, status: 'pendiente' });
    expect(saved.body.request.startedAt).toBe(saved.body.request.endedAt);
    expect((await item.reload()).estadoOperativo).toBe('completado');
    expect(item.qualityStatus).toBe('pendiente');
    expect((await QuotationItem.findOne({ where: { quotationId: quotation.id, workOrderItemId: item.id } }))?.estadoOperativo).toBe('completado');
    const pending = await request(app).get('/api/workshop-time').query({ fecha: date }).set('Cookie', cookies[1]);
    expect(pending.status).toBe(200);
    expect(pending.body.totals.pendingMinutes).toBe(90);
    expect((await review(Number(saved.body.request.id))).status).toBe(200);
    expect(Number((await item.reload()).horasHombreReales)).toBe(1.5);
    expect(item.qualityStatus).toBe('pendiente');
    const accepted = await request(app).get('/api/workshop-time').query({ fecha: date }).set('Cookie', cookies[1]);
    expect(accepted.body.totals).toMatchObject({ registeredMinutes: 90, pendingMinutes: 0 });
    expect(accepted.body.entries[0]).toMatchObject({ reportedDate: date, minutesOnDate: 90 });
  }, 15_000);

  it('does not duplicate a declared quantity on a concurrent retry', async () => {
    const { orderId, item } = await fixture();
    const { startedAt: _start, endedAt: _end, ...data } = body(orderId, item.id);
    const payload = { ...data, horasUtilizadas: 1.5 };
    const [a, b] = await Promise.all([post(endpoint, payload), post(endpoint, payload)]);
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    expect(b.status, JSON.stringify(b.body)).toBe(201);
    expect(a.body.request.id).toBe(b.body.request.id);
    expect(await WorkshopTimeRequest.count({ where: { workOrderId: orderId } })).toBe(1);
  }, 15_000);

  it('rejects future days without changing progress', async () => {
    const { orderId, item } = await fixture();
    const { startedAt: _start, endedAt: _end, ...data } = body(orderId, item.id);
    expect((await post(endpoint, { ...data, horasUtilizadas: 1.5, fecha: '2026-11-20' })).status).toBe(400);
    expect(await WorkshopTimeRequest.count({ where: { workOrderId: orderId } })).toBe(0);
    expect((await item.reload()).estadoOperativo).toBe('pendiente');
  }, 15_000);

  it.each([3, 5, 30])('allows %s declared hours for an assigned three-hour job even at the beginning of the day', async (hours) => {
    const { orderId, item } = await fixture();
    vi.setSystemTime(new Date(`${date}T12:01:00.000Z`));
    for (const index of users.keys()) await login(index);
    const { startedAt: _start, endedAt: _end, ...data } = body(orderId, item.id);
    const saved = await post(endpoint, { ...data, horasUtilizadas: hours });
    expect(saved.status, JSON.stringify(saved.body)).toBe(201);
    expect(saved.body.request).toMatchObject({ durationMinutes: hours * 60, status: 'pendiente' });
    expect((await item.reload()).estadoOperativo).toBe('completado');
    expect(item.qualityStatus).toBe('pendiente');
    expect((await review(Number(saved.body.request.id))).status).toBe(200);
    expect(Number((await item.reload()).horasHombreReales)).toBe(hours);
    expect(item.qualityStatus).toBe('pendiente');
  }, 15_000);

  it('marks only the selected mechanic part, and completes the service when all members finish', async () => {
    const { orderId, item } = await fixture([1, 2]);
    const first = await post(endpoint, body(orderId, item.id));
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect((await item.reload()).estadoOperativo).toBe('en_proceso');
    expect((await WorkOrderItemAssignment.findOne({ where: { workOrderItemId: item.id, userId: users[1].id, active: true } }))?.completedAt).not.toBeNull();
    expect((await WorkOrderItemAssignment.findOne({ where: { workOrderItemId: item.id, userId: users[2].id, active: true } }))?.completedAt).toBeNull();
    const second = await post(endpoint, body(orderId, item.id), 2);
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    expect((await item.reload()).estadoOperativo).toBe('completado');
    expect(item.qualityStatus).toBe('pendiente');
  }, 15_000);

  it('keeps partial progress in execution and does not replay it when an older hours request is approved', async () => {
    const { orderId, item } = await fixture();
    const partial = await post(endpoint, body(orderId, item.id, 'en_proceso'));
    expect(partial.status, JSON.stringify(partial.body)).toBe(201);
    expect((await item.reload()).estadoOperativo).toBe('en_proceso');
    const finished = await post(endpoint, { ...body(orderId, item.id), startedAt: end, endedAt: `${date}T14:00:00.000Z` });
    expect(finished.status, JSON.stringify(finished.body)).toBe(201);
    expect((await item.reload()).estadoOperativo).toBe('completado');
    const quality = await post(`/api/work-orders/${orderId}/items/${item.id}/quality`, { decision: 'aprobar', nota: 'Prueba funcional aprobada por jefatura' }, 0);
    expect(quality.status, JSON.stringify(quality.body)).toBe(200);
    expect((await review(Number(partial.body.request.id))).status).toBe(200);
    expect((await item.reload()).estadoOperativo).toBe('completado');
    expect(item.qualityStatus).toBe('aprobado');
    expect((await review(Number(finished.body.request.id))).status).toBe(200);
    expect(Number((await item.reload()).horasHombreReales)).toBe(2);
    expect(item.qualityStatus).toBe('aprobado');
  }, 15_000);

  it('rejects another mechanic service, a spoofed worker and overlapping pending hours', async () => {
    const { orderId, item } = await fixture();
    const foreign = await post(endpoint, body(orderId, item.id), 2);
    expect([403, 404]).toContain(foreign.status);
    expect((await post(endpoint, { ...body(orderId, item.id), userId: users[2].id })).status).toBe(403);
    const first = await post(endpoint, body(orderId, item.id, 'en_proceso'));
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const overlap = await post(endpoint, { ...body(orderId, item.id, 'en_proceso'), startedAt: `${date}T12:30:00.000Z`, endedAt: `${date}T13:30:00.000Z` });
    expect(overlap.status).toBe(409);
    expect(await WorkshopTimeRequest.count({ where: { workOrderId: orderId } })).toBe(1);
  }, 15_000);

  it('makes concurrent retries idempotent without repeating hours or progress events', async () => {
    const { orderId, item } = await fixture();
    const data = body(orderId, item.id);
    const [first, second] = await Promise.all([post(endpoint, data), post(endpoint, data)]);
    expect([200, 201]).toContain(first.status);
    expect([200, 201]).toContain(second.status);
    expect(first.body.request.id).toBe(second.body.request.id);
    expect(await WorkshopTimeRequest.count({ where: { workOrderId: orderId } })).toBe(1);
    expect(await WorkOrderItemProgressEvent.count({ where: { workOrderItemId: item.id, toStatus: 'completado' } })).toBe(1);
    expect((await post(endpoint, { ...data, note: 'Carga distinta usando el mismo identificador' })).status).toBe(409);
  }, 15_000);

  it('rolls back request, team completion and mirror when recording progress fails', async () => {
    const { orderId, item, quotation } = await fixture();
    const previousStatus = item.estadoOperativo;
    const event = vi.spyOn(WorkOrderItemProgressEvent, 'create').mockRejectedValueOnce(new Error('Fallo simulado del historial'));
    try {
      const result = await post(endpoint, body(orderId, item.id));
      expect(result.status).toBe(500);
    } finally { event.mockRestore(); }
    expect(await WorkshopTimeRequest.count({ where: { workOrderId: orderId } })).toBe(0);
    expect((await item.reload()).estadoOperativo).toBe(previousStatus);
    expect((await WorkOrderItemAssignment.findOne({ where: { workOrderItemId: item.id, userId: users[1].id, active: true } }))?.completedAt).toBeNull();
    expect((await QuotationItem.findOne({ where: { quotationId: quotation.id, workOrderItemId: item.id } }))?.estadoOperativo).toBe(previousStatus);
  }, 15_000);
});
