import { randomUUID } from 'node:crypto';

import { DEFAULT_WORKSHOP_WEEKLY } from '@unithor/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { Client, Payment, Quotation, Role, User, Vehicle, WorkOrderItem, WorkOrderItemSession } from '../../models/index.js';
import { WorkshopSchedule } from '../../models/WorkshopSchedule.js';
import { settleExpiredLaborSessions } from '../../services/workshop-shift-worker.service.js';
import { signAccessToken } from '../../utils/jwt.js';

describe('Confirmed workshop working hours and lunch (unithor_test only)', () => {
  const tag = randomUUID().replaceAll('-', '').slice(0, 9);
  const csrf = `working-hours-${tag}`;
  let chief: User;
  let mechanic: User;
  let vehicle: Vehicle;
  let client: Client;
  const cookies = (user: User, role: 'jefe' | 'mecanico') => [
    `access_token=${signAccessToken({ sub: user.id, role })}`, `csrf_token=${csrf}`,
  ];
  const post = (path: string, body: object = {}, worker = false) => request(app).post(path)
    .set('Cookie', worker ? cookies(mechanic, 'mecanico') : cookies(chief, 'jefe'))
    .set('X-CSRF-Token', csrf).send(body);
  const context = async () => {
    const created = await post('/api/work-orders', { clientId: client.id, vehicleId: vehicle.id,
      items: [{ descripcion: 'Prueba jornada y almuerzo', tipoLinea: 'especifico', cantidad: 1, precioUnitario: 10000 }] });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const orderId = Number(created.body.workOrder.id);
    const item = await WorkOrderItem.findOne({ where: { workOrderId: orderId } });
    if (!item) throw new Error('Falta servicio');
    const assigned = await post(`/api/work-orders/${orderId}/items/${item.id}/team`, {
      members: [{ userId: mechanic.id, estimatedHours: 1 }], motivo: 'Asignación de prueba de jornada',
    });
    expect(assigned.status, JSON.stringify(assigned.body)).toBe(200);
    return { orderId, item, start: `/api/work-orders/${orderId}/items/${item.id}/start` };
  };
  beforeAll(async () => {
    if (sequelize.getDatabaseName() !== 'unithor_test') throw new Error('Solo unithor_test');
    for (const roleName of ['jefe', 'mecanico'] as const) {
      const role = await Role.findOne({ where: { nombre: roleName } });
      if (!role) throw new Error(`Falta rol ${roleName}`);
      const user = await User.create({ nombre: `Horario ${roleName}`, username: `hours_${roleName}_${tag}`,
        email: `hours_${roleName}_${tag}@example.test`, passwordHash: 'signed-fixture', roleId: role.id, activo: true });
      if (roleName === 'jefe') chief = user; else mechanic = user;
    }
    client = await Client.create({ nombre: `Horario cliente ${tag}`, tipo: 'cliente', email: null });
    vehicle = await Vehicle.create({ patente: `H${tag}`.toUpperCase(), clientId: client.id });
    await WorkshopSchedule.upsert({ id: 1, timezone: 'America/Santiago', weekly: DEFAULT_WORKSHOP_WEEKLY, updatedBy: chief.id });
  });
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-16T15:50:00Z')); });
  afterEach(() => { vi.useRealTimers(); });
  afterAll(async () => { await sequelize.close(); });

  it('pauses exactly at 13, rejects lunch starts, and requires a deliberate restart at 14', async () => {
    const { orderId, item, start } = await context();
    expect((await post(start, {}, true)).status).toBe(200);
    const morning = await WorkOrderItemSession.findOne({ where: { workOrderItemId: item.id, userId: mechanic.id, status: 'abierta' } });
    expect(morning?.scheduledEndAt?.toISOString()).toBe('2026-11-16T16:00:00.000Z');
    vi.setSystemTime(new Date('2026-11-16T16:30:00Z')); // 13:30 Chile
    await settleExpiredLaborSessions();
    await morning!.reload();
    expect(morning?.endedAt?.toISOString()).toBe('2026-11-16T16:00:00.000Z');
    expect(Number(morning?.durationMinutes)).toBe(10);
    expect((await post(start, {}, true)).status).toBe(400);
    vi.setSystemTime(new Date('2026-11-16T17:00:00Z'));
    expect(await WorkOrderItemSession.count({ where: { workOrderItemId: item.id, status: 'abierta' } })).toBe(0);
    expect((await post(start, {}, true)).status).toBe(200);
    const afternoon = await WorkOrderItemSession.findOne({ where: { workOrderItemId: item.id, status: 'abierta' } });
    expect(afternoon?.scheduledEndAt?.toISOString()).toBe('2026-11-16T21:00:00.000Z');
    vi.setSystemTime(new Date('2026-11-16T22:00:00Z')); // 19:00, app closed across 18:00
    await settleExpiredLaborSessions();
    await afternoon!.reload();
    expect(Number(afternoon?.durationMinutes)).toBe(240);
    expect((await post(start, {}, true)).status).toBe(400);
    const journal = await request(app).get(`/api/workshop-time?fecha=2026-11-16&userId=${mechanic.id}`).set('Cookie', cookies(chief, 'jefe'));
    expect(journal.status).toBe(200);
    expect(journal.body.totals.scheduledMinutes).toBe(480);
    expect(journal.body.totals.registeredMinutes).toBe(250);
    expect(journal.body.totals.unregisteredMinutes).toBe(230);
    expect(journal.body.entries.every((entry: { workOrderId: number }) => entry.workOrderId === orderId)).toBe(true);
  });
  it('accepts Saturday 09–13 and closes at 13 even when checked later', async () => {
    vi.setSystemTime(new Date('2026-11-14T15:30:00Z'));
    const { item, start } = await context();
    expect((await post(start, {}, true)).status).toBe(200);
    vi.setSystemTime(new Date('2026-11-14T20:00:00Z'));
    await settleExpiredLaborSessions();
    const session = await WorkOrderItemSession.findOne({ where: { workOrderItemId: item.id } });
    expect(session?.endedAt?.toISOString()).toBe('2026-11-14T16:00:00.000Z');
    expect(Number(session?.durationMinutes)).toBe(30);
    expect((await post(start, {}, true)).status).toBe(400);
  });
  it('rejects before 09 and on Sunday without creating a time session', async () => {
    const { item, start } = await context();
    for (const at of ['2026-11-16T11:59:59Z', '2026-11-15T15:00:00Z']) {
      vi.setSystemTime(new Date(at));
      expect((await post(start, {}, true)).status).toBe(400);
    }
    expect(await WorkOrderItemSession.count({ where: { workOrderItemId: item.id } })).toBe(0);
  });
  it('retains elapsed time when adopting a legacy timer that had no cutoff', async () => {
    const { orderId, item } = await context();
    const legacy = await WorkOrderItemSession.create({ workOrderId: orderId, workOrderItemId: item.id,
      userId: mechanic.id, userName: mechanic.nombre, kind: 'cronometro', status: 'abierta',
      startedAt: new Date('2026-11-16T13:00:00Z'), endedAt: null, durationMinutes: null,
      scheduledEndAt: null, closeReason: null, note: null, createdBy: mechanic.id });
    vi.setSystemTime(new Date('2026-11-16T16:30:00Z'));
    await settleExpiredLaborSessions();
    await legacy.reload();
    expect(legacy.status).toBe('cerrada');
    expect(legacy.endedAt?.toISOString()).toBe('2026-11-16T16:30:00.000Z');
    expect(Number(legacy.durationMinutes)).toBe(210);
    expect(legacy.startedAt.toISOString()).toBe('2026-11-16T13:00:00.000Z');
  });
  it('registers extra time through the chief, reports it once, and leaves COT prices and payments unchanged', async () => {
    vi.setSystemTime(new Date('2026-11-13T20:00:00Z')); // Friday 17:00 Chile
    const { orderId, item } = await context();
    const quotation = await Quotation.findOne({ where: { workOrderId: orderId } });
    if (!quotation) throw new Error('Falta cotización espejo');
    const amounts = { total: quotation.total, subtotal: quotation.subtotal, pagado: quotation.pagado, estadoPago: quotation.estadoPago };
    const paymentCount = await Payment.count();
    vi.setSystemTime(new Date('2026-11-13T22:00:00Z'));
    const data = { workOrderId: orderId, itemId: item.id, userId: mechanic.id, overtime: true,
      startedAt: '2026-11-13T21:00:00Z', endedAt: '2026-11-13T22:00:00Z', note: 'Diagnóstico urgente autorizado al cierre por el jefe' };
    const result = await post('/api/workshop-time/requests', data);
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    expect(result.body.request).toMatchObject({ overtime: true, status: 'aprobada', userId: mechanic.id, durationMinutes: 60 });
    const saved = await WorkOrderItemSession.findOne({ where: { id: result.body.request.replacementSessionId } });
    expect(saved).toMatchObject({ overtime: true, createdBy: chief.id, userId: mechanic.id });
    expect(Number(saved?.durationMinutes)).toBe(60);
    const report = await request(app).get('/api/work-orders/reports/daily?fecha=2026-11-13').set('Cookie', cookies(chief, 'jefe'));
    expect(report.status).toBe(200);
    const person = report.body.report.usuarios.find((entry: { id: number }) => entry.id === mechanic.id);
    expect(person).toMatchObject({ horas: 1, horasExtra: 1, sesiones: 1 });
    expect(person.detalle).toEqual([expect.objectContaining({ overtime: true, workOrderId: orderId, note: data.note, minutos: 60 })]);
    expect(report.body.report.totalHorasExtra).toBe(1);
    expect((await post('/api/workshop-time/requests', data)).status).toBe(409);
    await quotation.reload();
    expect({ total: quotation.total, subtotal: quotation.subtotal, pagado: quotation.pagado, estadoPago: quotation.estadoPago }).toEqual(amounts);
    expect(await Payment.count()).toBe(paymentCount);
    expect(Number((await item.reload()).precioUnitario)).toBe(10000);
  });
  it('forbids declaring extra time as a mechanic and rejects ordinary hours mislabeled as extra', async () => {
    const { orderId, item } = await context();
    const data = { workOrderId: orderId, itemId: item.id, overtime: true,
      startedAt: '2026-11-13T21:00:00Z', endedAt: '2026-11-13T22:00:00Z', note: 'Solo el jefe autoriza el registro extra' };
    expect((await post('/api/workshop-time/requests', data, true)).status).toBe(403);
    const ordinary = await post('/api/workshop-time/requests', { ...data, userId: mechanic.id,
      startedAt: '2026-11-13T20:00:00Z', endedAt: '2026-11-13T20:30:00Z' });
    expect(ordinary.status, JSON.stringify(ordinary.body)).toBe(400);
    expect(await WorkOrderItemSession.count({ where: { workOrderItemId: item.id } })).toBe(0);
  });
});
