import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { Client, Role, User, Vehicle, WorkOrder, WorkOrderItem, WorkOrderItemAssignment, WorkOrderItemSession } from '../../models/index.js';
import { settleExpiredLaborSessions } from '../../services/workshop-shift-worker.service.js';
import { hashPassword } from '../../utils/password.js';

describe('Workshop teams, time retention and shift cutoff', () => {
  let vehicle: Vehicle;
  let client: Client;
  const users: User[] = [];
  const cookies: string[][] = [];
  const mutate = (path: string, body: object = {}, who = 0) => request(app).post(path).set('Cookie', cookies[who])
    .set('X-CSRF-Token', cookies[who].find((c) => c.startsWith('csrf_token='))!.slice(11)).send(body);
  const get = (path: string, who = 0) => request(app).get(path).set('Cookie', cookies[who]);
  beforeAll(async () => {
    if (sequelize.getDatabaseName() !== 'unithor_test') throw new Error('Solo unithor_test');
    await User.destroy({ where: { email: [0, 1, 2, 3, 4].map((i) => `team-phase1-${i}@example.com`) }, force: true });
    const password = 'TeamValidation2026!';
    const hash = await hashPassword(password);
    for (const [index, roleName] of ['desarrollador', 'mecanico', 'mecanico', 'mecanico', 'jefe'].entries()) {
      const role = await Role.findOne({ where: { nombre: roleName } });
      if (!role) throw new Error('Falta rol de pruebas');
      const user = await User.create({ nombre: `Team fixture ${index}`, email: `team-phase1-${index}@example.com`, passwordHash: hash, roleId: role.id, activo: true });
      users.push(user);
      const response = await request(app).post('/api/auth/login').send({ email: user.email, password });
      expect(response.status).toBe(200);
      cookies.push((response.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]));
    }
    client = await Client.create({ nombre: 'Cliente validación equipo', tipo: 'cliente' });
    [vehicle] = await Vehicle.findOrCreate({ where: { patente: 'TMTEST' }, defaults: { patente: 'TMTEST', clientId: client.id } });
    await vehicle.update({ clientId: client.id });
  }, 30000);
  afterAll(async () => { await sequelize.close(); });
  const create = async () => {
    const response = await mutate('/api/work-orders', { clientId: client.id, vehicleId: vehicle.id,
      items: [{ descripcion: 'Diagnóstico compartido', tipoLinea: 'especifico', cantidad: 1, precioUnitario: 10000 }] });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const orderId = Number(response.body.workOrder.id);
    const item = await WorkOrderItem.findOne({ where: { workOrderId: orderId } });
    if (!item) throw new Error('Falta servicio');
    return { orderId, item };
  };
  const team = (orderId: number, itemId: number, indices: number[]) => mutate(`/api/work-orders/${orderId}/items/${itemId}/team`, {
    members: indices.map((index) => ({ userId: users[index].id, estimatedHours: index })), motivo: 'Equipo para diagnóstico especializado',
  });
  it('allows simultaneous workers on one service and completes it only when the entire team finishes', async () => {
    const { orderId, item } = await create();
    expect((await team(orderId, item.id, [1, 2])).status).toBe(200);
    for (const who of [1, 2]) expect((await mutate(`/api/work-orders/${orderId}/items/${item.id}/start`, {}, who)).status).toBe(200);
    expect(await WorkOrderItemSession.count({ where: { workOrderItemId: item.id, status: 'abierta' } })).toBe(2);
    const first = await mutate(`/api/work-orders/${orderId}/items/${item.id}/complete`, {}, 1);
    expect(first.status).toBe(200);
    expect((await item.reload()).estadoOperativo).toBe('en_proceso');
    expect(await WorkOrderItemSession.count({ where: { workOrderItemId: item.id, userId: users[2].id, status: 'abierta' } })).toBe(1);
    expect((await mutate(`/api/work-orders/${orderId}/items/${item.id}/complete`, {}, 2)).status).toBe(200);
    expect((await item.reload()).estadoOperativo).toBe('completado');
    expect(await WorkOrderItemAssignment.count({ where: { workOrderItemId: item.id, active: true, completedAt: null } })).toBe(0);
  });
  it('revokes access immediately, preserves earlier sessions and the original estimate when changing the team', async () => {
    const { orderId, item } = await create();
    await WorkOrder.update({ assignedMechanicId: users[1].id }, { where: { id: orderId } });
    expect((await team(orderId, item.id, [1, 2])).status).toBe(200);
    expect((await mutate(`/api/work-orders/${orderId}/items/${item.id}/start`, {}, 1)).status).toBe(200);
    await WorkOrderItemSession.update({ startedAt: new Date(Date.now() - 45 * 60000) }, { where: { workOrderItemId: item.id, userId: users[1].id } });
    expect((await team(orderId, item.id, [2])).status).toBe(200);
    expect((await get(`/api/work-orders/${orderId}/worksheet`, 1)).status).toBe(404);
    const listed = await get('/api/work-orders', 1);
    expect(listed.body.items.map((row: { id: number }) => row.id)).not.toContain(orderId);
    const prior = await WorkOrderItemSession.findOne({ where: { workOrderItemId: item.id, userId: users[1].id } });
    expect(prior?.status).toBe('cerrada');
    expect(Number(prior?.durationMinutes)).toBeGreaterThanOrEqual(45);
    const estimate = await WorkOrderItemAssignment.findOne({ where: { workOrderItemId: item.id, userId: users[2].id, active: true } });
    await mutate(`/api/work-orders/${orderId}/items/${item.id}/team`, { members: [{ userId: users[2].id, estimatedHours: 7 }], motivo: 'Diagnóstico adicional necesario' });
    expect(Number((await estimate!.reload()).originalEstimatedHours)).toBe(2);
    expect(Number(estimate!.estimatedHours)).toBe(7);
  });
  it('pauses exactly at the saved shift end after downtime, preserving accumulated minutes', async () => {
    const { orderId, item } = await create();
    await team(orderId, item.id, [3]);
    expect((await mutate(`/api/work-orders/${orderId}/items/${item.id}/start`, {}, 3)).status).toBe(200);
    const cutoff = new Date(Math.floor(Date.now() / 1000) * 1000 - 120 * 60000);
    await WorkOrderItemSession.update({ startedAt: new Date(cutoff.getTime() - 90 * 60000), scheduledEndAt: cutoff }, { where: { workOrderItemId: item.id, status: 'abierta' } });
    await settleExpiredLaborSessions();
    const session = await WorkOrderItemSession.findOne({ where: { workOrderItemId: item.id } });
    expect(session?.status).toBe('cerrada');
    expect(session?.endedAt?.getTime()).toBe(cutoff.getTime());
    expect(Number(session?.durationMinutes)).toBe(90);
    expect(Number((await item.reload()).horasHombreReales)).toBe(1.5);
    await settleExpiredLaborSessions();
    expect(Number((await session!.reload()).durationMinutes)).toBe(90);
  });
  it('serializes concurrent starts for the same worker across different orders', async () => {
    const a = await create(); const b = await create();
    await team(a.orderId, a.item.id, [1]); await team(b.orderId, b.item.id, [1]);
    const results = await Promise.all([mutate(`/api/work-orders/${a.orderId}/items/${a.item.id}/start`, {}, 1), mutate(`/api/work-orders/${b.orderId}/items/${b.item.id}/start`, {}, 1)]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    expect(await WorkOrderItemSession.count({ where: { userId: users[1].id, status: 'abierta' } })).toBe(1);
  });
  it('rejects duplicate members, unrelated mechanics, and mutation without CSRF', async () => {
    const { orderId, item } = await create();
    expect((await team(orderId, item.id, [1, 1])).status).toBe(400);
    expect((await mutate(`/api/work-orders/${orderId}/items/${item.id}/team`, { members: [{ userId: users[0].id, estimatedHours: 1 }], motivo: 'Prueba' })).status).toBe(400);
    expect((await get(`/api/work-orders/${orderId}/worksheet`, 3)).status).toBe(404);
    expect((await request(app).post(`/api/work-orders/${orderId}/items/${item.id}/team`).set('Cookie', cookies[0]).send({ members: [], motivo: 'Prueba' })).status).toBe(403);
  });
  it('keeps manual hours pending, approves them for the worker and replaces a correction without double-counting', async () => {
    const { orderId, item } = await create();
    await team(orderId, item.id, [2]);
    const end = new Date(Math.floor(Date.now() / 1000) * 1000 - 2 * 86400000);
    const start = new Date(end.getTime() - 60 * 60000);
    const submitted = await mutate('/api/workshop-time/requests', { workOrderId: orderId, itemId: item.id, startedAt: start.toISOString(), endedAt: end.toISOString(), note: 'Trabajo del día anterior pendiente de registrar' }, 2);
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(201);
    expect(submitted.body.request.status).toBe('pendiente');
    expect(await WorkOrderItemSession.count({ where: { workOrderItemId: item.id } })).toBe(0);
    const review = (id: number, approve: boolean) => request(app).patch(`/api/workshop-time/requests/${id}/review`).set('Cookie', cookies[0]).set('X-CSRF-Token', cookies[0].find((c) => c.startsWith('csrf_token='))!.slice(11)).send({ approve, note: 'Revisado con el trabajador y aprobado por jefatura' });
    expect((await review(submitted.body.request.id, true)).status).toBe(200);
    const original = await WorkOrderItemSession.findOne({ where: { workOrderItemId: item.id } });
    expect(original?.userId).toBe(users[2].id);
    expect(original?.createdBy).toBe(users[0].id);
    expect(Number((await item.reload()).horasHombreReales)).toBe(1);
    const correction = await mutate('/api/workshop-time/requests', { sourceSessionId: original!.id, startedAt: new Date(start.getTime() - 30 * 60000).toISOString(), endedAt: end.toISOString(), note: 'El inicio real fue media hora antes' }, 2);
    expect(correction.status, JSON.stringify(correction.body)).toBe(201);
    expect(Number((await item.reload()).horasHombreReales)).toBe(1);
    expect((await review(correction.body.request.id, true)).status).toBe(200);
    expect(Number((await item.reload()).horasHombreReales)).toBe(1.5);
    await original!.reload();
    expect(original!.supersededAt).not.toBeNull();
    expect(Number(original!.durationMinutes)).toBe(60);
    expect(original!.startedAt.getTime()).toBe(start.getTime());
    expect(await WorkOrderItemSession.count({ where: { workOrderItemId: item.id } })).toBe(2);
    const foreign = await mutate('/api/workshop-time/requests', { sourceSessionId: original!.id, startedAt: start.toISOString(), endedAt: end.toISOString(), note: 'No pertenece a este usuario' }, 3);
    expect(foreign.status).toBe(404);
  });
  it('revokes inherited access even when an explicit team starts empty', async () => {
    const { orderId, item } = await create();
    await WorkOrder.update({ assignedMechanicId: users[3].id }, { where: { id: orderId } });
    expect((await get(`/api/work-orders/${orderId}/worksheet`, 3)).status).toBe(200);
    expect((await team(orderId, item.id, [])).status).toBe(200);
    expect((await get(`/api/work-orders/${orderId}/worksheet`, 3)).status).toBe(404);
  });
  it('creates the reception team atomically with estimates and without exposing rates in the worksheet', async () => {
    const response = await mutate('/api/work-orders', { clientId: client.id, vehicleId: vehicle.id,
      items: [{ descripcion: 'Recepción con equipo', tipoLinea: 'especifico', cantidad: 1, precioUnitario: 0,
        teamMembers: [{ userId: users[1].id, estimatedHours: 2 }, { userId: users[2].id, estimatedHours: 1.5 }] }] });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const id = Number(response.body.workOrder.id);
    const rows = await WorkOrderItemAssignment.findAll({ where: { workOrderId: id } });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => Number(row.originalEstimatedHours))).toEqual([2, 1.5]);
    const sheet = await get(`/api/work-orders/${id}/worksheet`, 2);
    expect(sheet.status).toBe(200);
    expect(JSON.stringify(sheet.body)).not.toMatch(/costHourly|saleHourly|passwordHash|precioUnitario/);
  });
  it('keeps team completion synchronized when the chief completes or reopens the service directly', async () => {
    const { orderId, item } = await create();
    await team(orderId, item.id, [1, 2]);
    const change = (estadoOperativo: string) => request(app).patch(`/api/work-orders/${orderId}/execution`).set('Cookie', cookies[4])
      .set('X-CSRF-Token', cookies[4].find((c) => c.startsWith('csrf_token='))!.slice(11)).send({ items: [{ id: item.id, estadoOperativo }] });
    expect((await change('completado')).status).toBe(200);
    expect(await WorkOrderItemAssignment.count({ where: { workOrderItemId: item.id, active: true, completedAt: null } })).toBe(0);
    expect((await change('en_proceso')).status).toBe(200);
    expect(await WorkOrderItemAssignment.count({ where: { workOrderItemId: item.id, active: true, completedAt: null } })).toBe(2);
    expect((await mutate(`/api/work-orders/${orderId}/items/${item.id}/start`, {}, 1)).status).toBe(200);
  });
  it('restricts the general schedule to administration and lets the chief authorize a worker-day exception', async () => {
    const put = (body: object, who: number) => request(app).put('/api/workshop-personnel/schedule').set('Cookie', cookies[who])
      .set('X-CSRF-Token', cookies[who].find((c) => c.startsWith('csrf_token='))!.slice(11)).send(body);
    const now = new Date();
    const schedule = { timezone: 'UTC', weekly: [{ weekday: now.getUTCDay(), start: '00:00', end: '00:01' }] };
    expect((await put(schedule, 4)).status).toBe(403);
    expect((await put(schedule, 0)).status).toBe(200);
    const { orderId, item } = await create();
    await team(orderId, item.id, [3]);
    expect((await mutate(`/api/work-orders/${orderId}/items/${item.id}/start`, {}, 3)).status).toBe(400);
    const exception = await mutate(`/api/workshop-personnel/workers/${users[3].id}/exceptions`, { date: now.toISOString().slice(0, 10), dayOff: false, start: '00:00', end: '23:59', reason: 'Jornada excepcional autorizada para la prueba' }, 4);
    expect(exception.status, JSON.stringify(exception.body)).toBe(201);
    expect((await mutate(`/api/work-orders/${orderId}/items/${item.id}/start`, {}, 3)).status).toBe(200);
    const session = await WorkOrderItemSession.findOne({ where: { workOrderItemId: item.id, status: 'abierta' } });
    expect(session?.scheduledEndAt?.toISOString()).toBe(`${now.toISOString().slice(0, 10)}T23:59:00.000Z`);
  });
});
