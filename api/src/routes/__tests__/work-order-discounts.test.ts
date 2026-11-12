import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { CatalogItem } from '../../models/CatalogItem.js';
import { Client } from '../../models/Client.js';
import { Payment } from '../../models/Payment.js';
import { Quotation } from '../../models/Quotation.js';
import { QuotationItem } from '../../models/QuotationItem.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { Vehicle } from '../../models/Vehicle.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { WorkOrderEvent } from '../../models/WorkOrderEvent.js';
import { WorkOrderItem } from '../../models/WorkOrderItem.js';
import { WorkOrderItemSession } from '../../models/WorkOrderItemSession.js';
import { hashPassword } from '../../utils/password.js';

describe('OT discounts persisted in its financial COT', () => {
  let actor: User;
  let mechanic: User;
  let client: Client;
  let vehicle: Vehicle;
  let catalog: CatalogItem;
  let cookies: string[];
  let csrf: string;
  const orderIds: number[] = [];
  const quotationIds: number[] = [];
  const mutate = (method: 'post' | 'patch', path: string, body: object) => request(app)[method](path)
    .set('Cookie', cookies).set('X-CSRF-Token', csrf).send(body);
  const lines = (quotationId: number) => QuotationItem.findAll({ where: { quotationId }, order: [['id', 'ASC']] });
  const line = (extra: object = {}) => ({ descripcion: 'Servicio con descuento', tipoLinea: 'estandar', unidadMedida: 'servicio', cantidad: 2, precioUnitario: 10000, ...extra });
  const create = async (extra: object = {}) => {
    const response = await mutate('post', '/api/work-orders', {
      clientId: client.id, vehicleId: vehicle.id, items: [line()], ...extra,
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const order = response.body.workOrder;
    orderIds.push(order.id);
    quotationIds.push(order.quotation.id);
    return order;
  };

  beforeAll(async () => {
    if (sequelize.getDatabaseName() !== 'unithor_test') throw new Error('Tests require unithor_test');
    await sequelize.authenticate();
    const role = await Role.findOne({ where: { nombre: 'desarrollador' } });
    const mechanicRole = await Role.findOne({ where: { nombre: 'mecanico' } });
    if (!role || !mechanicRole) throw new Error('Missing test roles');
    const password = 'DiscountTests2026!';
    const passwordHash = await hashPassword(password);
    const suffix = randomUUID();
    actor = await User.create({ nombre: 'Discount test developer', email: `discount-${suffix}@example.com`, passwordHash, roleId: role.id, activo: true });
    mechanic = await User.create({ nombre: 'Discount test mechanic', email: `discount-mechanic-${suffix}@example.com`, passwordHash, roleId: mechanicRole.id, activo: true });
    client = await Client.create({ nombre: 'Discount test client', tipo: 'cliente' });
    vehicle = await Vehicle.create({ patente: 'DSC001', clientId: client.id, kilometraje: 100 });
    catalog = await CatalogItem.create({ nombre: 'Discount test catalog labor', tipo: 'estandar', precio: 10000, unidadMedida: 'servicio', horasHombreEstandar: 2 });
    const login = await request(app).post('/api/auth/login').send({ email: actor.email, password });
    expect(login.status).toBe(200);
    cookies = (login.headers['set-cookie'] as unknown as string[]).map((cookie) => cookie.split(';')[0]);
    csrf = cookies.find((cookie) => cookie.startsWith('csrf_token='))!.slice(11);
  });

  afterAll(async () => {
    if (quotationIds.length) await Quotation.destroy({ where: { id: quotationIds }, force: true });
    if (orderIds.length) await WorkOrder.destroy({ where: { id: orderIds }, force: true });
    if (catalog) await catalog.destroy({ force: true });
    if (vehicle) await vehicle.destroy({ force: true });
    if (client) await client.destroy({ force: true });
    for (const user of [actor, mechanic]) {
      if (!user) continue;
      await RefreshToken.destroy({ where: { userId: user.id } });
      await user.destroy({ force: true });
    }
  });

  it.each([
    ['porcentaje', 10, 'porcentaje', 10],
    ['porcentaje', 10, 'fijo', 1800],
    ['fijo', 2000, 'porcentaje', 10],
    ['fijo', 2000, 'fijo', 1800],
  ])('creates line %s/%s followed by header %s/%s and IVA', async (lineType, lineValue, headerType, headerValue) => {
    const order = await create({
      descuentoTipo: headerType, descuentoValor: headerValue,
      items: [line({ catalogItemId: catalog.id, descuentoTipo: lineType, descuentoValor: lineValue })],
    });
    expect(order).toMatchObject({ descuentoTipo: headerType, descuentoValor: headerValue });
    expect(order.items[0]).toMatchObject({ descuentoTipo: lineType, descuentoValor: lineValue, subtotal: 20000, horasHombreEstimadas: 2, catalogItem: { id: catalog.id } });
    expect(order.quotation).toMatchObject({ subtotal: 20000, descuentoLineas: 2000, descuentoGeneral: 1800, descuentoTotal: 3800, neto: 16200, iva: 3078, total: 19278, saldoPendiente: 19278 });
    const quotation = await Quotation.findByPk(order.quotation.id);
    expect(Number(quotation!.total)).toBe(16200);
    const persisted = (await lines(order.quotation.id))[0];
    expect(persisted.workOrderItemId).toBe(order.items[0].id);
    expect(persisted.descuentoTipo).toBe(lineType);
    expect(Number(persisted.descuentoValor)).toBe(lineValue);
    expect(Number(persisted.subtotal)).toBe(18000);
    const listed = await request(app).get(`/api/work-orders?search=${order.codigo}`).set('Cookie', cookies);
    expect(listed.status).toBe(200);
    expect(listed.body.items[0]).toMatchObject({ descuentoTipo: headerType, descuentoValor: headerValue, quotation: { total: 19278 }, items: [{ descuentoTipo: lineType, descuentoValor: lineValue }] });
  });

  it('updates, reorders and adds discounts without replacing links, hours, assignments or sessions', async () => {
    const order = await create({ descuentoTipo: 'porcentaje', descuentoValor: 10, items: [
      line({ assignedUserId: mechanic.id, descuentoTipo: 'fijo', descuentoValor: 2000 }),
      line({ descripcion: 'Segundo trabajo', descuentoTipo: 'porcentaje', descuentoValor: 5 }),
    ] });
    const item = await WorkOrderItem.findByPk(order.items[0].id);
    const validatedAt = new Date('2026-10-10T12:00:00.000Z');
    await item!.update({ horasHombreReales: 0.5, laborValidatedBy: actor.id, laborValidatedAt: validatedAt, laborValidationNote: 'Validación conservada' });
    const session = await WorkOrderItemSession.create({ workOrderId: order.id, workOrderItemId: item!.id, userId: mechanic.id, userName: mechanic.nombre, startedAt: new Date('2026-10-10T10:00:00Z'), endedAt: new Date('2026-10-10T10:30:00Z'), durationMinutes: 30, status: 'cerrada', closeReason: 'pausa', createdBy: mechanic.id });
    const previous = await lines(order.quotation.id);
    const edited = await mutate('patch', `/api/work-orders/${order.id}`, { items: [
      line({ id: order.items[1].id, descripcion: 'Segundo trabajo renombrado' }),
      line({ id: item!.id, descripcion: 'Servicio renombrado', precioUnitario: 15000 }),
      line({ descripcion: 'Nuevo trabajo', cantidad: 1, precioUnitario: 5000, descuentoTipo: 'fijo', descuentoValor: 500 }),
    ] });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    const current = await lines(order.quotation.id);
    expect(current.slice(0, 2).map((value) => [value.id, value.workOrderItemId, value.descuentoTipo, Number(value.descuentoValor)])).toEqual(previous.map((value) => [value.id, value.workOrderItemId, value.descuentoTipo, Number(value.descuentoValor)]));
    expect(Number(current[2].descuentoValor)).toBe(500);
    expect(current[2].workOrderItemId).toBe(edited.body.workOrder.items[2].id);
    await item!.reload();
    expect(Number(item!.horasHombreReales)).toBe(0.5);
    expect(item!.assignedUserId).toBe(mechanic.id);
    expect(item!.laborValidatedAt!.getTime()).toBe(validatedAt.getTime());
    expect(item!.laborValidationNote).toBe('Validación conservada');
    expect((await session.reload()).workOrderItemId).toBe(item!.id);
    expect(edited.body.workOrder.quotation.neto).toBe(46350);
    const changed = await mutate('patch', `/api/work-orders/${order.id}`, { descuentoTipo: 'fijo', descuentoValor: 1500 });
    expect(changed.status).toBe(200);
    expect(changed.body.workOrder.quotation.neto).toBe(50000);
    const explicit = await mutate('patch', `/api/work-orders/${order.id}`, { items: changed.body.workOrder.items.map((value: { id: number; descripcion: string; cantidad: number; precioUnitario: number }) => line({ ...value, ...(value.id === item!.id ? { descuentoTipo: 'porcentaje', descuentoValor: 20 } : {}) })) });
    expect(explicit.status, JSON.stringify(explicit.body)).toBe(200);
    expect(Number((await lines(order.quotation.id))[0].descuentoValor)).toBe(20);
    expect(explicit.body.workOrder.quotation.neto).toBe(46000);
    const cleared = await mutate('patch', `/api/work-orders/${order.id}`, { descuentoTipo: null, descuentoValor: 0 });
    expect(cleared.status).toBe(200);
    expect(cleared.body.workOrder.quotation.neto).toBe(47500);
  });

  it.each([
    { descuentoTipo: 'porcentaje', descuentoValor: 101 },
    { descuentoValor: 1 },
    { descuentoTipo: 'fijo', descuentoValor: 20001 },
    { items: [line({ descuentoTipo: 'porcentaje', descuentoValor: 101 })] },
    { items: [line({ descuentoValor: 1 })] },
    { descuentoTipo: 'fijo', descuentoValor: 18001, items: [line({ descuentoTipo: 'fijo', descuentoValor: 2000 })] },
  ])('rolls back invalid pricing, reception and mirror creation: %j', async (extra) => {
    const count = await WorkOrder.count();
    const cotCount = await Quotation.count();
    const mileage = (await vehicle.reload()).kilometraje;
    const response = await mutate('post', '/api/work-orders', { clientId: client.id, vehicleId: vehicle.id, kilometrajeIngreso: 9999, items: [line()], ...extra });
    expect(response.status, JSON.stringify(response.body)).toBe(400);
    expect(await WorkOrder.count()).toBe(count);
    expect(await Quotation.count()).toBe(cotCount);
    expect((await vehicle.reload()).kilometraje).toBe(mileage);
  });

  it('rejects invalid retained and explicit line discounts atomically on update', async () => {
    const order = await create({ items: [line({ descuentoTipo: 'fijo', descuentoValor: 5000 })] });
    const previous = (await lines(order.quotation.id))[0];
    for (const item of [line({ id: order.items[0].id, precioUnitario: 100 }), line({ id: order.items[0].id, descuentoTipo: 'fijo', descuentoValor: 20001 })]) {
      const response = await mutate('patch', `/api/work-orders/${order.id}`, { descripcion: 'Debe revertirse', kilometrajeIngreso: 9999, items: [item] });
      expect(response.status).toBe(400);
      expect((await WorkOrder.findByPk(order.id))!.descripcion).toBeNull();
      expect(Number((await WorkOrderItem.findByPk(order.items[0].id))!.precioUnitario)).toBe(10000);
      expect(Number((await previous.reload()).descuentoValor)).toBe(5000);
      expect(Number((await Quotation.findByPk(order.quotation.id))!.total)).toBe(15000);
      expect((await vehicle.reload()).kilometraje).toBe(100);
    }
  });

  it('reads unambiguous legacy COT discounts without changing links and retains them on rename', async () => {
    const order = await create({ items: [line({ descuentoTipo: 'porcentaje', descuentoValor: 10 })] });
    const previous = (await lines(order.quotation.id))[0];
    await previous.update({ workOrderItemId: null });
    const read = await request(app).get(`/api/work-orders/${order.id}`).set('Cookie', cookies);
    expect(read.status).toBe(200);
    expect(read.body.workOrder.items[0]).toMatchObject({ descuentoTipo: 'porcentaje', descuentoValor: 10 });
    expect((await previous.reload()).workOrderItemId).toBeNull();
    const edit = await mutate('patch', `/api/work-orders/${order.id}`, { items: [line({ id: order.items[0].id, descripcion: 'Servicio antiguo renombrado' })] });
    expect(edit.status, JSON.stringify(edit.body)).toBe(200);
    expect(edit.body.workOrder.quotation.neto).toBe(18000);
    expect((await previous.reload()).workOrderItemId).toBe(order.items[0].id);
    expect(previous.descuentoTipo).toBe('porcentaje');
  });

  it('allows neutral discount fields on legacy OTs without a mirror and rolls back actual discounts', async () => {
    const order = await WorkOrder.create({ codigo: `OT-DSC-${randomUUID().slice(0, 8)}`, clientId: client.id, vehicleId: vehicle.id, createdBy: actor.id, estado: 'en_progreso' });
    orderIds.push(order.id);
    const item = await WorkOrderItem.create({ workOrderId: order.id, descripcion: 'Servicio anterior sin COT', cantidad: 2, precioUnitario: 10000, subtotal: 20000, horasHombreReales: 0.5 });
    const quotations = await Quotation.count();
    const edited = await mutate('patch', `/api/work-orders/${order.id}`, {
      descripcion: 'Operación conservada', descuentoTipo: null, descuentoValor: 0,
      items: [line({ id: item.id, descripcion: item.descripcion, precioUnitario: 15000, descuentoTipo: null, descuentoValor: 0 })],
    });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect(edited.body.workOrder).toMatchObject({ descripcion: 'Operación conservada', items: [{ id: item.id, precioUnitario: 15000, horasHombreReales: 0.5 }] });
    expect(await Quotation.count()).toBe(quotations);
    expect(await Quotation.findOne({ where: { workOrderId: order.id } })).toBeNull();
    for (const payload of [
      { descuentoTipo: 'fijo', descuentoValor: 100 },
      { items: [line({ id: item.id, descripcion: item.descripcion, descuentoTipo: 'fijo', descuentoValor: 100 })] },
    ]) {
      const rejected = await mutate('patch', `/api/work-orders/${order.id}`, { descripcion: 'Debe revertirse', ...payload });
      expect(rejected.status, JSON.stringify(rejected.body)).toBe(400);
      expect(rejected.body.error.message).toContain('cotización vinculada');
      expect((await order.reload()).descripcion).toBe('Operación conservada');
      expect(Number((await item.reload()).precioUnitario)).toBe(15000);
      expect(await Quotation.count()).toBe(quotations);
    }
  });

  it('checks paid boundaries against discounted gross including IVA and preserves payment state on rollback', async () => {
    const order = await create();
    const payment = await mutate('post', '/api/payments', { quotationId: order.quotation.id, monto: 18000, metodo: 'efectivo' });
    expect(payment.status, JSON.stringify(payment.body)).toBe(201);
    const accepted = await mutate('patch', `/api/work-orders/${order.id}`, { descuentoTipo: 'fijo', descuentoValor: 4000 });
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    expect(accepted.body.workOrder.quotation).toMatchObject({ neto: 16000, total: 19040, pagado: 18000, saldoPendiente: 1040, estadoPago: 'parcial' });
    const events = await WorkOrderEvent.count({ where: { workOrderId: order.id } });
    const rejected = await mutate('patch', `/api/work-orders/${order.id}`, { descuentoValor: 6000, kilometrajeIngreso: 9999, descripcion: 'Revertir con descuento' });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.message).toContain('monto ya pagado');
    expect(Number((await Quotation.findByPk(order.quotation.id))!.descuentoValor)).toBe(4000);
    expect(await WorkOrderEvent.count({ where: { workOrderId: order.id } })).toBe(events);
    expect((await vehicle.reload()).kilometraje).toBe(100);
    expect((await Payment.findByPk(payment.body.payment.id))!.monto.toString()).toBe('18000.00');
    const rejectedLine = await mutate('patch', `/api/work-orders/${order.id}`, { items: [line({ id: order.items[0].id, descuentoTipo: 'fijo', descuentoValor: 4000 })] });
    expect(rejectedLine.status).toBe(400);
    expect(rejectedLine.body.error.message).toContain('monto ya pagado');
    expect(Number((await lines(order.quotation.id))[0].descuentoValor)).toBe(0);
    const balance = await mutate('post', '/api/payments', { quotationId: order.quotation.id, monto: 1040, metodo: 'efectivo' });
    expect(balance.status).toBe(201);
    const paidEdit = await mutate('patch', `/api/work-orders/${order.id}`, { descuentoValor: 3000 });
    expect(paidEdit.status).toBe(400);
    expect(paidEdit.body.error.message).toContain('pagada en su totalidad');
    const operational = await mutate('patch', `/api/work-orders/${order.id}/execution`, { items: [{ id: order.items[0].id, estadoOperativo: 'en_proceso' }] });
    expect(operational.status, JSON.stringify(operational.body)).toBe(200);
    const quotation = await Quotation.findByPk(order.quotation.id);
    expect(Number(quotation!.total)).toBe(16000);
    expect(Number(quotation!.pagado)).toBe(19040);
    expect(quotation!.estadoPago).toBe('total');
  });

  it('converts using source COT discounts and keeps its item IDs, prices, payment and totals', async () => {
    const created = await mutate('post', '/api/quotations', { clientId: client.id, descuentoTipo: 'fijo', descuentoValor: 3000, items: [line({ descuentoTipo: 'porcentaje', descuentoValor: 10 })] });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const cot = created.body.quotation;
    quotationIds.push(cot.id);
    const previous = await lines(cot.id);
    const payment = await mutate('post', '/api/payments', { quotationId: cot.id, monto: 10000, metodo: 'efectivo' });
    expect(payment.status).toBe(201);
    for (const extra of [{ descuentoTipo: 'fijo' }, { descuentoValor: 0 }, { items: [] }]) {
      const rejected = await mutate('post', `/api/quotations/${cot.id}/convert-to-ot`, { vehicleId: vehicle.id, ...extra });
      expect(rejected.status).toBe(400);
      expect((await Quotation.findByPk(cot.id))!.workOrderId).toBeNull();
    }
    const converted = await mutate('post', `/api/quotations/${cot.id}/convert-to-ot`, { vehicleId: vehicle.id, itemAssignments: [{ quotationItemId: previous[0].id, assignedUserId: mechanic.id }] });
    expect(converted.status, JSON.stringify(converted.body)).toBe(201);
    const order = converted.body.workOrder;
    orderIds.push(order.id);
    expect(order).toMatchObject({ descuentoTipo: 'fijo', descuentoValor: 3000, items: [{ descuentoTipo: 'porcentaje', descuentoValor: 10, precioUnitario: 10000, assignedUserId: mechanic.id }], quotation: { id: cot.id, neto: 15000, total: 17850, pagado: 10000, saldoPendiente: 7850, estadoPago: 'parcial' } });
    const current = (await lines(cot.id))[0];
    expect(current.id).toBe(previous[0].id);
    expect(current.workOrderItemId).toBe(order.items[0].id);
    expect(Number(current.descuentoValor)).toBe(10);
    expect(Number(current.subtotal)).toBe(18000);
    expect(Number((await Quotation.findByPk(cot.id))!.total)).toBe(15000);
    expect((await Payment.findByPk(payment.body.payment.id))!.quotationId).toBe(cot.id);
    const edit = await mutate('patch', `/api/work-orders/${order.id}`, { items: [line({ id: order.items[0].id, descripcion: 'Servicio tras conversión' })] });
    expect(edit.status, JSON.stringify(edit.body)).toBe(200);
    expect(edit.body.workOrder.quotation.neto).toBe(15000);
    expect((await lines(cot.id))[0].id).toBe(previous[0].id);
  });

  it('keeps discounts and financial amounts out of the mechanic worksheet and labor list', async () => {
    const order = await create({ descuentoTipo: 'fijo', descuentoValor: 3000, items: [line({ assignedUserId: mechanic.id, descuentoTipo: 'porcentaje', descuentoValor: 10 })] });
    const login = await request(app).post('/api/auth/login').send({ email: mechanic.email, password: 'DiscountTests2026!' });
    expect(login.status).toBe(200);
    const mechanicCookies = (login.headers['set-cookie'] as unknown as string[]).map((cookie) => cookie.split(';')[0]);
    for (const path of [`/api/work-orders/${order.id}/worksheet`, '/api/work-orders/mine']) {
      const response = await request(app).get(path).set('Cookie', mechanicCookies);
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(JSON.stringify(response.body)).not.toMatch(/"(?:descuentoTipo|descuentoValor|precioUnitario|subtotal|quotation|iva|neto|pagado)":/);
    }
    expect((await request(app).get(`/api/work-orders/${order.id}`).set('Cookie', mechanicCookies)).status).toBe(403);
    expect((await request(app).get(`/api/work-orders/${order.id}/pdf`).set('Cookie', mechanicCookies)).status).toBe(403);
  });
});
