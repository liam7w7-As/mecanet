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
import { WorkOrderItemProgressEvent } from '../../models/WorkOrderItemProgressEvent.js';
import { WorkOrderItemSession } from '../../models/WorkOrderItemSession.js';
import { WorkOrderObservation } from '../../models/WorkOrderObservation.js';
import { WorkOrderProgressReport } from '../../models/WorkOrderProgressReport.js';
import { hashPassword } from '../../utils/password.js';

const password = 'LaborRegression2026!';
const editable = (item: QuotationItem) => ({
  id: item.id,
  catalogItemId: item.catalogItemId,
  descripcion: item.descripcion,
  tipoLinea: item.tipoLinea,
  unidadMedida: item.unidadMedida,
  cantidad: Number(item.cantidad),
  precioUnitario: Number(item.precioUnitario),
  estadoOperativo: item.estadoOperativo,
  notasOperativas: item.notasOperativas,
  descuentoTipo: item.descuentoTipo,
  descuentoValor: Number(item.descuentoValor),
});

describe('Labor integrity and mechanic privacy regressions', () => {
  let admin: User;
  let mechanics: User[];
  let chief: User;
  let client: Client;
  let vehicle: Vehicle;
  let cookies: string[][];
  const orderIds: number[] = [];
  const auth = (index: number) => cookies[index];
  const csrf = (index: number) =>
    cookies[index].find((cookie) => cookie.startsWith('csrf_token='))!.slice(11);
  const mutate = (method: 'post' | 'patch', path: string, body: object = {}, index = 0) => {
    const pending = request(app)[method](path);
    return pending.set('Cookie', auth(index))
      .set('X-CSRF-Token', csrf(index))
      .send(body);
  };
  const get = (path: string, index = 0) => request(app).get(path).set('Cookie', auth(index));
  const lines = (quotationId: number) =>
    QuotationItem.findAll({
      where: { quotationId },
      order: [['id', 'ASC']],
    });

  beforeAll(async () => {
    if (sequelize.getDatabaseName() !== 'unithor_test')
      throw new Error('Tests require unithor_test');
    const role = await Role.findOne({ where: { nombre: 'mecanico' } });
    const developer = await User.findOne({ where: { email: 'dev@unithor.local' } });
    if (!role || !developer) throw new Error('Missing test roles');
    admin = developer;
    const passwordHash = await hashPassword(password);
    await admin.update({ passwordHash, activo: true });
    mechanics = await Promise.all(
      ['a', 'b', 'c'].map((suffix) =>
        User.create({
          nombre: `Labor regression ${suffix}`,
          email: `labor-regression-${suffix}@example.com`,
          passwordHash,
          roleId: role.id,
          activo: true,
        }),
      ),
    );
    const chiefRole = await Role.findOne({ where: { nombre: 'jefe' } });
    if (!chiefRole) throw new Error('Missing chief role');
    chief = await User.create({ nombre: 'Jefe de pruebas', email: 'labor-chief@example.com', passwordHash, roleId: chiefRole.id, activo: true });
    cookies = [];
    for (const user of [admin, ...mechanics, chief]) {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password });
      expect(response.status).toBe(200);
      const header: unknown = response.headers['set-cookie'];
      cookies.push(
        (Array.isArray(header) ? (header as string[]) : []).map((cookie) => cookie.split(';')[0]),
      );
    }
    client = await Client.create({ nombre: 'Shared labor regression customer', tipo: 'cliente' });
    vehicle = await Vehicle.create({ patente: 'RGRS11', clientId: client.id });
  });

  afterAll(async () => {
    if (orderIds.length) {
      await Quotation.destroy({ where: { workOrderId: orderIds }, force: true });
      await WorkOrder.destroy({ where: { id: orderIds }, force: true });
    }
    if (vehicle) await vehicle.destroy({ force: true });
    if (client) await client.destroy({ force: true });
    if (mechanics) {
      await RefreshToken.destroy({ where: { userId: mechanics.map((user) => user.id) } });
      await User.destroy({ where: { id: mechanics.map((user) => user.id) }, force: true });
    }
    if (chief) { await RefreshToken.destroy({ where: { userId: chief.id } }); await chief.destroy({ force: true }); }
  });

  const createOrder = async (descriptions = ['Servicio de prueba']) => {
    const response = await mutate('post', '/api/work-orders', {
      clientId: client.id,
      vehicleId: vehicle.id,
      items: descriptions.map((descripcion) => ({
        descripcion,
        tipoLinea: 'estandar',
        unidadMedida: 'servicio',
        cantidad: 1,
        precioUnitario: 10000,
      })),
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const order = await WorkOrder.findByPk(Number(response.body.workOrder.id));
    if (!order) throw new Error('Missing created OT');
    orderIds.push(order.id);
    await order.update({ assignedMechanicId: mechanics[0].id });
    const quotation = await Quotation.findOne({ where: { workOrderId: order.id } });
    if (!quotation) throw new Error('Missing mirror COT');
    const items = await WorkOrderItem.findAll({
      where: { workOrderId: order.id },
      order: [['id', 'ASC']],
    });
    return { order, quotation, items };
  };
  const runTimer = async (orderId: number, itemId: number, minutes = 30, complete = false) => {
    const start = await mutate('post', `/api/work-orders/${orderId}/items/${itemId}/start`, {}, 1);
    expect(start.status, JSON.stringify(start.body)).toBe(200);
    await WorkOrderItemSession.update(
      { startedAt: new Date(Date.now() - minutes * 60000) },
      {
        where: { workOrderItemId: itemId, status: 'abierta' },
      },
    );
    const result = await mutate(
      'post',
      `/api/work-orders/${orderId}/items/${itemId}/${complete ? 'complete' : 'pause'}`,
      {},
      1,
    );
    expect(result.status, JSON.stringify(result.body)).toBe(200);
  };

  it('creates three services with independent mechanics and restricts each mechanic to their work', async () => {
    const response = await mutate('post', '/api/work-orders', {
      clientId: client.id, vehicleId: vehicle.id,
      items: mechanics.map((mechanic, index) => ({ descripcion: `Servicio asignado ${index}`, tipoLinea: 'especifico', cantidad: 1, precioUnitario: 10000, assignedUserId: mechanic.id })),
    }, 4);
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const id = Number(response.body.workOrder.id);
    orderIds.push(id);
    const items = await WorkOrderItem.findAll({ where: { workOrderId: id }, order: [['id', 'ASC']] });
    expect(items.map((item) => item.assignedUserId)).toEqual(mechanics.map((mechanic) => mechanic.id));
    for (let i = 0; i < mechanics.length; i++) {
      const list = await get(`/api/work-orders?search=${response.body.workOrder.codigo}`, i + 1);
      expect(list.body.items.map((item: { id: number }) => item.id)).toContain(id);
      const sheet = await get(`/api/work-orders/${id}/worksheet`, i + 1);
      expect(sheet.body.worksheet.items.filter((item: { canWork: boolean }) => item.canWork).map((item: { id: number }) => item.id)).toEqual([items[i].id]);
      expect((await mutate('post', `/api/work-orders/${id}/items/${items[(i + 1) % items.length].id}/start`, {}, i + 1)).status).toBe(403);
    }
    const invalid = await mutate('post', '/api/work-orders', { clientId: client.id, vehicleId: vehicle.id, items: [{ descripcion: 'Responsable inválido', assignedUserId: admin.id }] });
    expect(invalid.status).toBe(400);
  });

  it('reassigns running work without losing the previous mechanic hours and notes', async () => {
    const { order, items } = await createOrder();
    const item = items[0];
    await item.update({ assignedUserId: mechanics[0].id, notasOperativas: 'Conservar diagnóstico' });
    expect((await mutate('post', `/api/work-orders/${order.id}/items/${item.id}/start`, {}, 1)).status).toBe(200);
    await WorkOrderItemSession.update({ startedAt: new Date(Date.now() - 45 * 60000) }, { where: { workOrderItemId: item.id, status: 'abierta' } });
    const assigned = await mutate('post', `/api/work-orders/${order.id}/items/${item.id}/assignment`, { assignedUserId: mechanics[1].id });
    expect(assigned.status, JSON.stringify(assigned.body)).toBe(200);
    expect((await item.reload()).horasHombreReales).toBeCloseTo(0.75);
    expect(item.notasOperativas).toBe('Conservar diagnóstico');
    const session = await WorkOrderItemSession.findOne({ where: { workOrderItemId: item.id } });
    expect(session?.status).toBe('cerrada');
    expect(session?.userId).toBe(mechanics[0].id);
    expect((await mutate('post', `/api/work-orders/${order.id}/items/${item.id}/start`, {}, 1)).status).toBe(403);
    expect((await mutate('post', `/api/work-orders/${order.id}/items/${item.id}/start`, {}, 2)).status).toBe(200);
    expect((await mutate('post', `/api/work-orders/${order.id}/items/${item.id}/complete`, {}, 2)).status).toBe(200);
    expect((await item.reload()).notasOperativas).toBe('Conservar diagnóstico');
    const history = await get(`/api/work-orders/${order.id}/worksheet`);
    expect(history.body.worksheet.items[0].sessions).toHaveLength(2);
  });

  it('converts a COT with service assignments using its authoritative items and rejects foreign item IDs', async () => {
    const quotation = await Quotation.create({ codigo: 'COT-LABOR-CONVERT', clientId: client.id, subtotal: 10000, total: 10000, pagado: 0 });
    const line = await QuotationItem.create({ quotationId: quotation.id, descripcion: 'Servicio cotizado', tipoLinea: 'especifico', cantidad: 1, precioUnitario: 10000, subtotal: 10000 });
    const path = `/api/quotations/${quotation.id}/convert-to-ot`;
    expect((await mutate('post', path, { vehicleId: vehicle.id, itemAssignments: [{ quotationItemId: line.id + 99999, assignedUserId: mechanics[0].id }] })).status).toBe(400);
    expect((await quotation.reload()).workOrderId).toBeNull();
    const converted = await mutate('post', path, { vehicleId: vehicle.id, itemAssignments: [{ quotationItemId: line.id, assignedUserId: mechanics[0].id }] });
    expect(converted.status, JSON.stringify(converted.body)).toBe(201);
    const id = Number(converted.body.workOrder.id);
    orderIds.push(id);
    const item = await WorkOrderItem.findOne({ where: { workOrderId: id } });
    expect(item?.assignedUserId).toBe(mechanics[0].id);
    expect(Number(item?.precioUnitario)).toBe(10000);
    expect((await line.reload()).workOrderItemId).toBe(item?.id);
  });

  it('keeps assignment restrictions when searching, filtering and paginating', async () => {
    const previousTotals = await Promise.all([1, 2].map(async (index) => Number((await get('/api/work-orders?search=RGRS11', index)).body.total)));
    const own = await createOrder();
    const byItem = await createOrder();
    const foreign = await createOrder();
    await byItem.order.update({ assignedMechanicId: mechanics[1].id });
    await byItem.items[0].update({ assignedUserId: mechanics[0].id });
    await foreign.order.update({ assignedMechanicId: mechanics[1].id });
    const response = await get(
      `/api/work-orders?search=RGRS11&clientId=${client.id}&pageSize=1`,
      1,
    );
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(previousTotals[0] + 2);
    const page2 = await get(
      `/api/work-orders?search=RGRS11&clientId=${client.id}&pageSize=1&page=2`,
      1,
    );
    const ids = [response.body.items[0].id, page2.body.items[0].id];
    expect(ids.sort()).toEqual([own.order.id, byItem.order.id].sort());
    expect((await get(`/api/work-orders?search=${foreign.order.codigo}`, 1)).body.total).toBe(0);
    expect((await get(`/api/work-orders/${foreign.order.id}/worksheet`, 1)).status).toBe(404);
    expect((await get(`/api/work-orders?search=RGRS11`, 2)).body.total).toBe(previousTotals[1] + 2);
  });

  it('administrative edits do not restart the workshop activity clock in list or detail', async () => {
    const { order, items } = await createOrder();
    await order.update({ fechaIngreso: new Date(Date.now() - 36 * 86400000) });
    const edited = await mutate('patch', `/api/work-orders/${order.id}`, { descripcion: 'Solo editar recepción' });
    expect(edited.status).toBe(200);
    expect(edited.body.workOrder.lastWorkActivityAt).toBeNull();
    const execution = await mutate('patch', `/api/work-orders/${order.id}/execution`, {
      items: [{ id: items[0].id, estadoOperativo: 'en_proceso' }],
    });
    expect(execution.status).toBe(200);
    const active = await get(`/api/work-orders/${order.id}`);
    expect(Date.parse(active.body.workOrder.lastWorkActivityAt)).toBeGreaterThan(Date.now() - 10000);
    const oldActivity = new Date(Date.now() - 3 * 86400000);
    oldActivity.setUTCMilliseconds(0);
    await WorkOrderItemProgressEvent.update({ createdAt: oldActivity }, { where: { workOrderId: order.id } });
    const editedAgain = await mutate('patch', `/api/work-orders/${order.id}`, { descripcion: 'Editar nuevamente sin trabajar' });
    expect(editedAgain.body.workOrder.lastWorkActivityAt).toBe(oldActivity.toISOString());
    const listed = await get(`/api/work-orders?search=${order.codigo}`);
    expect(listed.body.items[0].lastWorkActivityAt).toBe(oldActivity.toISOString());
  });

  it.each(['OT', 'COT'] as const)('records actual checklist work edited through %s but ignores prices, notes and repeats', async (origin) => {
    const { order, quotation, items } = await createOrder(['Trabajo A', 'Trabajo B']);
    const previous = await lines(quotation.id);
    const values = previous.map((line) => ({ ...editable(line), ...(origin === 'OT' ? { id: line.workOrderItemId } : {}) }));
    const path = origin === 'OT' ? `/api/work-orders/${order.id}` : `/api/quotations/${quotation.id}`;
    const changed = await mutate('patch', path, { items: values.map((line, index) => ({ ...line, estadoOperativo: index === 0 ? 'completado' : 'pendiente' })) });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect((await items[0].reload()).estadoOperativo).toBe('completado');
    const first = (await get(`/api/work-orders/${order.id}`)).body.workOrder.lastWorkActivityAt;
    expect(Date.parse(first)).toBeGreaterThan(Date.now() - 10000);
    expect(await WorkOrderItemProgressEvent.count({ where: { workOrderId: order.id } })).toBe(1);
    const repeated = await mutate('patch', path, { items: values.map((line, index) => ({ ...line, estadoOperativo: index === 0 ? 'completado' : 'pendiente', precioUnitario: 15000, notasOperativas: 'Solo corregir texto' })) });
    expect(repeated.status, JSON.stringify(repeated.body)).toBe(200);
    expect((await get(`/api/work-orders/${order.id}`)).body.workOrder.lastWorkActivityAt).toBe(first);
    expect(await WorkOrderItemProgressEvent.count({ where: { workOrderId: order.id } })).toBe(1);
  });

  it('counts progress reports and clocked work, excluding estimates and status reversals', async () => {
    const { order, items } = await createOrder();
    const estimate = await mutate('patch', `/api/work-orders/${order.id}/items/${items[0].id}/estimate`, { horasHombreEstimadas: 2 });
    expect(estimate.status, JSON.stringify(estimate.body)).toBe(200);
    expect((await get(`/api/work-orders/${order.id}`)).body.workOrder.lastWorkActivityAt).toBeNull();
    const report = await mutate('patch', `/api/work-orders/${order.id}/execution`, { reporte: { porcentaje: 10, comentario: 'Diagnóstico realizado' } });
    expect(report.status).toBe(200);
    expect(Date.parse((await get(`/api/work-orders/${order.id}`)).body.workOrder.lastWorkActivityAt)).toBeGreaterThan(Date.now() - 10000);
    const old = new Date(Date.now() - 4 * 86400000);
    await WorkOrderProgressReport.update({ createdAt: old }, { where: { workOrderId: order.id } });
    await runTimer(order.id, items[0].id, 10);
    const clocked = (await get(`/api/work-orders/${order.id}`)).body.workOrder.lastWorkActivityAt;
    expect(Date.parse(clocked)).toBeGreaterThan(Date.now() - 10000);
    await WorkOrderItemSession.destroy({ where: { workOrderId: order.id } });
    await WorkOrderItemProgressEvent.update({ createdAt: old }, { where: { workOrderId: order.id } });
    const reversal = await mutate('patch', `/api/work-orders/${order.id}/execution`, { items: [{ id: items[0].id, estadoOperativo: 'pendiente' }] });
    expect(reversal.status).toBe(200);
    expect(Date.parse((await get(`/api/work-orders/${order.id}`)).body.workOrder.lastWorkActivityAt)).toBeLessThan(Date.now() - 3 * 86400000);
  });

  it('preserves item IDs, hours, assignments, validations and history through commercial edits', async () => {
    const { order, quotation, items } = await createOrder([
      'Reparacion duplicada',
      'Reparacion duplicada',
      'Control sin horas',
    ]);
    await runTimer(order.id, items[0].id, 30, true);
    await runTimer(order.id, items[1].id, 10);
    expect(
      (
        await mutate('post', `/api/work-orders/${order.id}/items/${items[0].id}/hours/validate`, {
          comentario: 'Revisado',
        })
      ).status,
    ).toBe(200);
    await WorkOrderObservation.create({
      workOrderId: order.id,
      workOrderItemId: items[0].id,
      texto: 'Historial que debe conservarse',
      authorId: mechanics[0].id,
    });
    const before = await items[0].reload();
    const validatedAt = before.laborValidatedAt!.getTime();
    const eventIds = (
      await WorkOrderItemProgressEvent.findAll({ where: { workOrderId: order.id } })
    ).map((event) => event.id);
    const sessionIds = (
      await WorkOrderItemSession.findAll({ where: { workOrderId: order.id } })
    ).map((session) => session.id);
    const previous = await lines(quotation.id);
    const edits = [
      editable(previous[1]),
      { ...editable(previous[0]), descripcion: 'Reparacion revisada', precioUnitario: 18000 },
      editable(previous[2]),
      {
        descripcion: 'Servicio nuevo',
        tipoLinea: 'estandar',
        unidadMedida: 'servicio',
        cantidad: 1,
        precioUnitario: 2000,
      },
    ];
    const response = await mutate('patch', `/api/quotations/${quotation.id}`, { items: edits });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const saved = await items[0].reload();
    expect(Number(saved.horasHombreReales)).toBe(0.5);
    expect(saved.assignedUserId).toBe(mechanics[0].id);
    expect(saved.laborValidatedAt!.getTime()).toBe(validatedAt);
    expect(saved.laborValidationNote).toBe('Revisado');
    expect(saved.descripcion).toBe('Reparacion revisada');
    expect(Number((await items[1].reload()).horasHombreReales)).toBe(0.17);
    expect(
      (await WorkOrderItemSession.findAll({ where: { workOrderId: order.id } })).map(
        (session) => session.id,
      ),
    ).toEqual(sessionIds);
    expect(
      (await WorkOrderItemProgressEvent.findAll({ where: { workOrderId: order.id } })).map(
        (event) => event.id,
      ),
    ).toEqual(eventIds);
    expect(await WorkOrderObservation.count({ where: { workOrderItemId: items[0].id } })).toBe(1);
    const next = await lines(quotation.id);
    expect(next.slice(0, 3).map((line) => line.id)).toEqual(previous.map((line) => line.id));
    expect(next.slice(0, 3).map((line) => line.workOrderItemId)).toEqual(
      items.map((item) => item.id),
    );
    expect(next[3].workOrderItemId).toEqual(expect.any(Number));
    const rejected = await mutate('patch', `/api/quotations/${quotation.id}`, {
      items: next.filter((line) => line.workOrderItemId !== items[0].id).map(editable),
    });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.message).toContain('horas o historial');
    expect((await lines(quotation.id)).map((line) => line.id)).toEqual(next.map((line) => line.id));
    expect(Number((await items[0].reload()).horasHombreReales)).toBe(0.5);
    expect(Number((await quotation.reload()).total)).toBe(40000);
    const removeUnused = await mutate('patch', `/api/quotations/${quotation.id}`, {
      items: next.filter((line) => line.workOrderItemId !== items[2].id).map(editable),
    });
    expect(removeUnused.status, JSON.stringify(removeUnused.body)).toBe(200);
    expect(await WorkOrderItem.findByPk(items[2].id)).toBeNull();
  });

  it('safely links a legacy quotation before renaming a service with recorded hours', async () => {
    const { order, quotation, items } = await createOrder();
    await runTimer(order.id, items[0].id);
    await QuotationItem.update({ workOrderItemId: null }, { where: { quotationId: quotation.id } });
    const previous = await lines(quotation.id);
    const response = await mutate('patch', `/api/quotations/${quotation.id}`, {
      items: [
        { ...editable(previous[0]), descripcion: 'Nuevo nombre comercial', precioUnitario: 15000 },
      ],
    });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(Number((await items[0].reload()).horasHombreReales)).toBe(0.5);
    expect((await lines(quotation.id))[0].workOrderItemId).toBe(items[0].id);
  });

  it.each([false, true])(
    'syncs the worksheet checklist without changing financial data (paid: %s)',
    async (paid) => {
      const { order, quotation, items } = await createOrder();
      if (paid) await quotation.update({ pagado: quotation.total, estadoPago: 'total' });
      const original = (await lines(quotation.id))[0];
      await runTimer(order.id, items[0].id, 15, true);
      const updated = (await lines(quotation.id))[0];
      expect(updated.id).toBe(original.id);
      expect(updated.estadoOperativo).toBe('completado');
      expect(Number(updated.precioUnitario)).toBe(Number(original.precioUnitario));
      expect(Number((await quotation.reload()).total)).toBe(10000);
      expect(quotation.estadoPago).toBe(paid ? 'total' : 'por_pagar');
    },
  );

  it('keeps legacy links and discounts when the edit originates in the OT', async () => {
    const { order, quotation, items } = await createOrder();
    await runTimer(order.id, items[0].id);
    const line = (await lines(quotation.id))[0];
    await line.update({ workOrderItemId: null, descuentoTipo: 'fijo', descuentoValor: 1000 });
    const response = await mutate('patch', `/api/work-orders/${order.id}`, {
      items: [
        {
          id: items[0].id,
          descripcion: 'Nombre cambiado desde taller',
          tipoLinea: 'estandar',
          unidadMedida: 'servicio',
          cantidad: 1,
          precioUnitario: 10000,
          estadoOperativo: 'en_proceso',
        },
      ],
    });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(Number((await items[0].reload()).horasHombreReales)).toBe(0.5);
    const updated = (await lines(quotation.id))[0];
    expect(updated.id).toBe(line.id);
    expect(updated.workOrderItemId).toBe(items[0].id);
    expect(updated.descuentoTipo).toBe('fijo');
    expect(Number(updated.descuentoValor)).toBe(1000);
    expect(Number((await quotation.reload()).total)).toBe(9000);
  });

  it('rejects ambiguous legacy edits instead of guessing which service owns the hours', async () => {
    const { order, quotation, items } = await createOrder([
      'Trabajo duplicado',
      'Trabajo duplicado',
    ]);
    await runTimer(order.id, items[0].id);
    await QuotationItem.update({ workOrderItemId: null }, { where: { quotationId: quotation.id } });
    const before = await lines(quotation.id);
    const response = await mutate('patch', `/api/quotations/${quotation.id}`, {
      items: before.map(editable),
    });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('ambigua');
    expect(Number((await items[0].reload()).horasHombreReales)).toBe(0.5);
    expect(await WorkOrderItemSession.count({ where: { workOrderItemId: items[0].id } })).toBe(1);
    expect((await lines(quotation.id)).map((line) => line.id)).toEqual(
      before.map((line) => line.id),
    );
  });

  it('links duplicate services explicitly when converting an independent quotation', async () => {
    const create = await mutate('post', '/api/quotations', {
      clientId: client.id,
      items: [1, 2].map(() => ({
        descripcion: 'Trabajo duplicado convertido',
        precioUnitario: 10000,
      })),
    });
    expect(create.status).toBe(201);
    const quotationId = Number(create.body.quotation.id);
    const converted = await mutate('post', `/api/quotations/${quotationId}/convert-to-ot`, {
      clientId: client.id,
      vehicleId: vehicle.id,
    });
    expect(converted.status, JSON.stringify(converted.body)).toBe(201);
    const orderId = Number(converted.body.workOrder.id);
    orderIds.push(orderId);
    const source = await WorkOrderItem.findAll({
      where: { workOrderId: orderId },
      order: [['id', 'ASC']],
    });
    expect((await lines(quotationId)).map((line) => line.workOrderItemId)).toEqual(
      source.map((item) => item.id),
    );
  });

  it('closes timers atomically on cancellation, including idempotent retries', async () => {
    const { order, items } = await createOrder();
    expect(
      (await mutate('post', `/api/work-orders/${order.id}/items/${items[0].id}/start`, {}, 1))
        .status,
    ).toBe(200);
    await WorkOrderItemSession.update(
      { startedAt: new Date(Date.now() - 30 * 60000) },
      {
        where: { workOrderId: order.id, status: 'abierta' },
      },
    );
    const invalid = await mutate('patch', `/api/work-orders/${order.id}/status`, {
      nuevoEstado: 'entregada',
    });
    expect(invalid.status).toBe(400);
    expect(
      await WorkOrderItemSession.count({ where: { workOrderId: order.id, status: 'abierta' } }),
    ).toBe(1);
    expect(
      (await mutate('patch', `/api/work-orders/${order.id}/status`, { nuevoEstado: 'cancelada' }))
        .status,
    ).toBe(200);
    const closed = await WorkOrderItemSession.findOne({ where: { workOrderId: order.id } });
    expect(closed?.status).toBe('cerrada');
    expect(closed?.closeReason).toBe('sistema');
    expect(closed?.durationMinutes).toBeGreaterThanOrEqual(30);
    expect(Number((await items[0].reload()).horasHombreReales)).toBe(0.5);
    const endedAt = closed!.endedAt!.getTime();
    expect(
      (await mutate('patch', `/api/work-orders/${order.id}/status`, { nuevoEstado: 'cancelada' }))
        .status,
    ).toBe(200);
    expect((await closed!.reload()).endedAt!.getTime()).toBe(endedAt);
    expect(
      (await mutate('post', `/api/work-orders/${order.id}/items/${items[0].id}/pause`, {}, 1))
        .status,
    ).toBe(400);
  });

  it('stops a timer when the legacy checklist completes a service', async () => {
    const { order, items } = await createOrder();
    expect(
      (await mutate('post', `/api/work-orders/${order.id}/items/${items[0].id}/start`, {}, 1))
        .status,
    ).toBe(200);
    expect(
      (
        await mutate(
          'patch',
          `/api/work-orders/${order.id}/execution`,
          {
            items: [{ id: items[0].id, estadoOperativo: 'completado' }],
          },
          1,
        )
      ).status,
    ).toBe(200);
    expect(
      await WorkOrderItemSession.count({ where: { workOrderId: order.id, status: 'abierta' } }),
    ).toBe(0);
  });

  it('cannot leave a timer running when starting and cancelling concurrently', async () => {
    const { order, items } = await createOrder();
    const [started, cancelled] = await Promise.all([
      mutate('post', `/api/work-orders/${order.id}/items/${items[0].id}/start`, {}, 1),
      mutate('patch', `/api/work-orders/${order.id}/status`, { nuevoEstado: 'cancelada' }),
    ]);
    expect([200, 400]).toContain(started.status);
    expect(cancelled.status).toBe(200);
    expect(
      await WorkOrderItemSession.count({ where: { workOrderId: order.id, status: 'abierta' } }),
    ).toBe(0);
  });

  it('splits midnight sessions, spanning sessions and open sessions by the requested day', async () => {
    const { order, items } = await createOrder();
    const common = {
      workOrderId: order.id,
      workOrderItemId: items[0].id,
      userId: mechanics[0].id,
      userName: mechanics[0].nombre,
      createdBy: mechanics[0].id,
    };
    await WorkOrderItemSession.bulkCreate([
      {
        ...common,
        kind: 'cronometro',
        status: 'cerrada',
        startedAt: new Date('2020-01-01T23:00:00Z'),
        endedAt: new Date('2020-01-02T01:00:00Z'),
        durationMinutes: 120,
        closeReason: 'pausa',
      },
      {
        ...common,
        kind: 'cronometro',
        status: 'cerrada',
        startedAt: new Date('2020-01-01T12:00:00Z'),
        endedAt: new Date('2020-01-04T12:00:00Z'),
        durationMinutes: 4320,
        closeReason: 'pausa',
      },
      {
        ...common,
        kind: 'cronometro',
        status: 'abierta',
        startedAt: new Date('2020-01-01T22:00:00Z'),
        endedAt: null,
        durationMinutes: null,
      },
      {
        ...common,
        kind: 'ajuste',
        status: 'cerrada',
        startedAt: new Date('2020-01-02T12:00:00Z'),
        endedAt: new Date('2020-01-02T12:00:00Z'),
        durationMinutes: 30,
        closeReason: 'cierre_manual',
      },
    ]);
    const first = await get('/api/work-orders/reports/daily?fecha=2020-01-01');
    expect(first.status).toBe(200);
    expect(first.body.report.totalHoras).toBe(15);
    const second = await get('/api/work-orders/reports/daily?fecha=2020-01-02');
    expect(second.status).toBe(200);
    expect(second.body.report.totalHoras).toBe(49.5);
    expect(second.body.report.ordenes[0].horas).toBe(49.5);
    expect(
      second.body.report.usuarios.find((user: { id: number }) => user.id === mechanics[0].id)
        .enCurso,
    ).toBe(false);
  });
  it('keeps chief price proposals pending until administration approves and synchronizes the COT', async () => {
    const { order, quotation, items } = await createOrder();
    const path = `/api/work-orders/${order.id}/price-suggestions`;
    const body = { workOrderItemId: items[0].id, precioSugerido: 18000, alcance: 'ot', motivo: 'Complejidad encontrada en taller' };
    const mechanic = await mutate('post', path, body, 1);
    expect(mechanic.status).toBe(403);
    const proposal = await mutate('post', path, body, 4);
    expect(proposal.status, JSON.stringify(proposal.body)).toBe(201);
    expect(Number((await items[0].reload()).precioUnitario)).toBe(10000);
    const adminInbox = await get('/api/dashboard/summary');
    expect(adminInbox.body.operationalInbox.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: `price-${proposal.body.suggestion.id}`, href: `/work-orders?manage=${order.id}&manageView=prices` })]));
    const chiefInbox = await get('/api/dashboard/summary', 4);
    expect(chiefInbox.body.operationalInbox.items.some((task: { id: string }) => task.id === `price-${proposal.body.suggestion.id}`)).toBe(false);
    const reviewPath = `${path}/${proposal.body.suggestion.id}`;
    expect((await mutate('patch', reviewPath, { decision: 'aprobar' }, 4)).status).toBe(403);
    const approved = await mutate('patch', reviewPath, { decision: 'aprobar', comentario: 'Precio autorizado' });
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect(Number((await items[0].reload()).precioUnitario)).toBe(18000);
    expect(Number((await quotation.reload()).total)).toBe(18000);
    expect(approved.body.suggestion.reviewNote).toBe('Precio autorizado');
  });

  it('rejects catalog price proposals for free services and does not approve changes on closed orders', async () => {
    const { order, items } = await createOrder();
    const path = `/api/work-orders/${order.id}/price-suggestions`;
    const body = { workOrderItemId: items[0].id, precioSugerido: 18000, alcance: 'catalogo', motivo: 'Servicio libre' };
    expect((await mutate('post', path, body, 4)).status).toBe(400);
    const proposal = await mutate('post', path, { ...body, alcance: 'ot' }, 4);
    expect(proposal.status).toBe(201);
    await order.update({ estado: 'entregada' });
    const result = await mutate('patch', `${path}/${proposal.body.suggestion.id}`, { decision: 'aprobar' });
    expect(result.status).toBe(400);
    expect(Number((await items[0].reload()).precioUnitario)).toBe(10000);
    expect((await get(path)).body.suggestions[0].estado).toBe('pendiente');
  });

});
