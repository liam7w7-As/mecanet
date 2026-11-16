import { randomUUID } from 'node:crypto';

import { getQuotationGrossTotal } from '@unithor/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { CashMovement } from '../../models/CashMovement.js';
import { CatalogItem } from '../../models/CatalogItem.js';
import { Client } from '../../models/Client.js';
import { CustomerEmail } from '../../models/CustomerEmail.js';
import { Notification } from '../../models/Notification.js';
import { Payment } from '../../models/Payment.js';
import { Permission } from '../../models/Permission.js';
import { Quotation } from '../../models/Quotation.js';
import { QuotationItem } from '../../models/QuotationItem.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { RolePermission } from '../../models/RolePermission.js';
import { User } from '../../models/User.js';
import { Vehicle } from '../../models/Vehicle.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { WorkOrderEvent } from '../../models/WorkOrderEvent.js';
import { WorkOrderItem } from '../../models/WorkOrderItem.js';
import { WorkOrderItemAssignment } from '../../models/WorkOrderItemAssignment.js';
import { WorkOrderItemSession } from '../../models/WorkOrderItemSession.js';
import { WorkOrderPriceSuggestion } from '../../models/WorkOrderPriceSuggestion.js';
import { WorkOrderQualityReview } from '../../models/WorkOrderQualityReview.js';
import { WorkOrderRequest } from '../../models/WorkOrderRequest.js';
import { hashPassword } from '../../utils/password.js';

import type { WorkOrderPriceSuggestionScope } from '@unithor/shared';

const runId = randomUUID();
const password = 'CommercialPhase3Tests2026!';
const roles = { developer: 'desarrollador', admin: 'admin', chief: 'jefe', mechanic: 'mecanico', seller: 'vendedor' } as const;
type Actor = keyof typeof roles;
interface Auth { user: User; cookies: string[]; csrf: string }
interface Fixture { order: WorkOrder; quotation: Quotation; items: WorkOrderItem[]; catalog: CatalogItem }
const plain = (rows: { toJSON(): object }[]) => rows.map((row) => row.toJSON());
const editable = (item: WorkOrderItem | QuotationItem) => ({
  id: item.id, catalogItemId: item.catalogItemId, descripcion: item.descripcion,
  tipoLinea: item.tipoLinea, unidadMedida: item.unidadMedida, cantidad: Number(item.cantidad),
  precioUnitario: Number(item.precioUnitario), estadoOperativo: item.estadoOperativo,
  notasOperativas: item.notasOperativas,
});

describe('Phase 3 work-order commercial policy and proposals (unithor_test only)', () => {
  const actors = {} as Record<Actor, Auth>;
  const users: User[] = [];
  const orderIds: number[] = [];
  const quotationIds: number[] = [];
  const catalogIds: number[] = [];
  let client: Client | undefined;
  let vehicle: Vehicle | undefined;

  const mutate = (method: 'post' | 'patch', path: string, body: object = {}, who: Actor = 'developer') =>
    request(app)[method](path).set('Cookie', actors[who].cookies).set('X-CSRF-Token', actors[who].csrf).send(body);
  const get = (path: string, who: Actor = 'developer') => request(app).get(path).set('Cookie', actors[who].cookies);
  const policyPath = (f: Fixture) => `/api/work-orders/${f.order.id}/price-policy`;
  const proposalsPath = (f: Fixture) => `/api/work-orders/${f.order.id}/price-suggestions`;
  const lines = (f: Fixture) => QuotationItem.findAll({ where: { quotationId: f.quotation.id }, order: [['id', 'ASC']] });
  const proposalBody = (f: Fixture, price = 18000, scope: WorkOrderPriceSuggestionScope = 'ot') => ({
    workOrderItemId: f.items[0].id, precioSugerido: price, alcance: scope, motivo: 'Diagnóstico adicional documentado',
  });
  const propose = (f: Fixture, price = 18000, scope: WorkOrderPriceSuggestionScope = 'ot', who: Actor = 'chief') =>
    mutate('post', proposalsPath(f), proposalBody(f, price, scope), who);
  const review = (f: Fixture, id: number, decision: 'aprobar' | 'rechazar' = 'aprobar', who: Actor = 'admin') =>
    mutate('patch', `${proposalsPath(f)}/${id}`, { decision, comentario: 'Revisión comercial documentada' }, who);
  const configure = async (f: Fixture, approvalRequired: boolean, who: Actor = 'admin') => {
    const result = await mutate('patch', policyPath(f), { approvalRequired }, who);
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.policy.approvalRequired).toBe(approvalRequired);
  };

  beforeAll(async () => {
    if (sequelize.getDatabaseName() !== 'unithor_test') throw new Error('Commercial tests require unithor_test');
    // The coordinated runner owns migration 054; this suite never bootstraps another DB.
    expect((await sequelize.getQueryInterface().describeTable('work_orders')).price_approval_required).toBeDefined();
    const passwordHash = await hashPassword(password);
    for (const who of Object.keys(roles) as Actor[]) {
      const role = await Role.findOne({ where: { nombre: roles[who] } });
      if (!role) throw new Error(`Missing test role: ${roles[who]}`);
      const user = await User.create({
        nombre: `Commercial ${who}`, email: `commercial-${who}-${runId}@example.com`,
        username: `p3_${who}_${runId.replaceAll('-', '').slice(0, 16)}`,
        passwordHash, roleId: role.id, activo: true, salesAccessAll: false,
      });
      users.push(user);
      const login = await request(app).post('/api/auth/login').send({ email: user.email, password });
      expect(login.status, JSON.stringify(login.body)).toBe(200);
      const raw: unknown = login.headers['set-cookie'];
      const cookies = (Array.isArray(raw) ? raw as string[] : []).map((cookie) => cookie.split(';')[0]);
      const csrf = cookies.find((cookie) => cookie.startsWith('csrf_token='))?.slice(11);
      if (!csrf) throw new Error('Missing CSRF cookie');
      actors[who] = { user, cookies, csrf };
    }
    client = await Client.create({ nombre: `Commercial client ${runId}`, tipo: 'cliente', email: `commercial-client-${runId}@example.com` });
    vehicle = await Vehicle.create({ patente: `P${runId.replaceAll('-', '').slice(0, 7).toUpperCase()}`, clientId: client.id, kilometraje: 100 });
  }, 30000);

  afterAll(async () => {
    if (sequelize.getDatabaseName() !== 'unithor_test') return;
    if (orderIds.length) {
      await Notification.destroy({ where: { workOrderId: orderIds } });
      await CustomerEmail.destroy({ where: { kind: 'work_order', entityId: orderIds } });
      await WorkOrderQualityReview.destroy({ where: { workOrderId: orderIds } });
    }
    if (quotationIds.length) {
      await Notification.destroy({ where: { quotationId: quotationIds } });
      await CustomerEmail.destroy({ where: { kind: 'quotation', entityId: quotationIds } });
      await Quotation.destroy({ where: { id: quotationIds }, force: true });
    }
    if (orderIds.length) await WorkOrder.destroy({ where: { id: orderIds }, force: true });
    if (catalogIds.length) await CatalogItem.destroy({ where: { id: catalogIds }, force: true });
    if (vehicle) await vehicle.destroy({ force: true });
    if (client) await client.destroy({ force: true });
    if (users.length) {
      const ids = users.map((user) => user.id);
      await CashMovement.destroy({ where: { createdBy: ids } });
      await Notification.destroy({ where: { userId: ids } });
      await RefreshToken.destroy({ where: { userId: ids } });
      await User.destroy({ where: { id: ids }, force: true });
    }
  }, 30000);

  const create = async (options: { price?: number; discounted?: boolean } = {}): Promise<Fixture> => {
    const price = options.price ?? 10000;
    const catalog = await CatalogItem.create({ nombre: `Commercial service ${runId}`, tipo: 'estandar', precio: price, unidadMedida: 'servicio' });
    catalogIds.push(catalog.id);
    const created = await mutate('post', '/api/work-orders', {
      clientId: client!.id, vehicleId: vehicle!.id, kilometrajeIngreso: 100,
      ...(options.discounted ? { descuentoTipo: 'porcentaje', descuentoValor: 10 } : {}),
      items: [{ catalogItemId: catalog.id, descripcion: `Diagnóstico ${runId}`, tipoLinea: 'estandar', unidadMedida: 'servicio', cantidad: options.discounted ? 2 : 1, precioUnitario: price,
        ...(options.discounted ? { descuentoTipo: 'porcentaje', descuentoValor: 10 } : {}) },
      ...(options.discounted ? [{ descripcion: 'Trabajo complementario', tipoLinea: 'especifico', unidadMedida: 'servicio', cantidad: 1, precioUnitario: 5000, descuentoTipo: 'fijo', descuentoValor: 500 }] : [])],
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = Number(created.body.workOrder.id);
    orderIds.push(id);
    const order = await WorkOrder.findByPk(id);
    const quotation = await Quotation.findOne({ where: { workOrderId: id } });
    if (quotation) quotationIds.push(quotation.id);
    if (!order || !quotation) throw new Error('Missing OT or mirror COT');
    return { order, quotation, catalog, items: await WorkOrderItem.findAll({ where: { workOrderId: id }, order: [['id', 'ASC']] }) };
  };
  const snapshot = async (f: Fixture) => {
    const [order, quotation, items, mirror, catalog, proposals, emails, notices, events, sessions, assignments, quality, payments] = await Promise.all([
      f.order.reload(), f.quotation.reload(), WorkOrderItem.findAll({ where: { workOrderId: f.order.id }, order: [['id', 'ASC']] }), lines(f), f.catalog.reload(),
      WorkOrderPriceSuggestion.findAll({ where: { workOrderId: f.order.id }, order: [['id', 'ASC']] }),
      CustomerEmail.findAll({ where: { kind: 'work_order', entityId: f.order.id }, order: [['id', 'ASC']] }),
      Notification.findAll({ where: { workOrderId: f.order.id }, order: [['id', 'ASC']] }),
      WorkOrderEvent.findAll({ where: { workOrderId: f.order.id }, order: [['id', 'ASC']] }),
      WorkOrderItemSession.findAll({ where: { workOrderId: f.order.id }, order: [['id', 'ASC']] }),
      WorkOrderItemAssignment.findAll({ where: { workOrderId: f.order.id }, order: [['id', 'ASC']] }),
      WorkOrderQualityReview.findAll({ where: { workOrderId: f.order.id }, order: [['id', 'ASC']] }),
      Payment.findAll({ where: { quotationId: f.quotation.id }, order: [['id', 'ASC']] }),
    ]);
    return { order: order.toJSON(), quotation: quotation.toJSON(), items: plain(items), mirror: plain(mirror), catalog: catalog.toJSON(),
      proposals: plain(proposals), emails: plain(emails), notices: plain(notices), events: plain(events), sessions: plain(sessions), assignments: plain(assignments), quality: plain(quality), payments: plain(payments) };
  };
  const business = (state: Awaited<ReturnType<typeof snapshot>>) => ({
    order: state.order, quotation: state.quotation, items: state.items, mirror: state.mirror, catalog: state.catalog,
    emails: state.emails, sessions: state.sessions, assignments: state.assignments, quality: state.quality, payments: state.payments,
  });
  const pending = async (f: Fixture, price = 18000, scope: WorkOrderPriceSuggestionScope = 'ot') => {
    const result = await propose(f, price, scope);
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    expect(result.body.suggestion).toMatchObject({ estado: 'pendiente', appliedDirectly: false });
    return Number(result.body.suggestion.id);
  };
  const pay = async (f: Fixture, amount: number) => {
    const result = await mutate('post', '/api/payments', { quotationId: f.quotation.id, monto: amount, metodo: 'efectivo' }, 'admin');
    expect(result.status, JSON.stringify(result.body)).toBe(201);
  };

  it('defaults to approval and exposes the supervisor policy and chief COT read access', async () => {
    const f = await create();
    expect(f.order.toJSON()).toMatchObject({ priceApprovalRequired: true });
    for (const who of ['developer', 'admin', 'chief'] as const) {
      const result = await get(policyPath(f), who);
      expect(result.status, JSON.stringify(result.body)).toBe(200);
      expect(result.body.policy).toMatchObject({ approvalRequired: true, canConfigure: who !== 'chief' });
    }
    const cot = await get(`/api/quotations/${f.quotation.id}`, 'chief');
    expect(cot.status, JSON.stringify(cot.body)).toBe(200);
    expect(cot.body.quotation.id).toBe(f.quotation.id);
    expect(cot.body.quotation.items[0]).toMatchObject({ id: (await lines(f))[0].id, precioUnitario: 10000 });
  });

  it('lets administration configure one OT without changing another OT or granting the chief configuration', async () => {
    const first = await create(); const other = await create();
    await configure(first, false, 'admin');
    expect((await get(policyPath(other), 'chief')).body.policy.approvalRequired).toBe(true);
    const before = await snapshot(first);
    expect((await mutate('patch', policyPath(first), { approvalRequired: true }, 'chief')).status).toBe(403);
    expect(await snapshot(first)).toEqual(before);
    await configure(first, true, 'developer');
    const otherBefore = await snapshot(other);
    expect((await mutate('patch', policyPath(other), { approvalRequired: false }, 'chief')).status).toBe(403);
    expect(await snapshot(other)).toEqual(otherBefore);
  });

  it('requires authentication for policy, proposal listing and every otherwise-valid commercial write', async () => {
    const f = await create(); const id = await pending(f); await configure(f, false);
    const before = await snapshot(f);
    for (const path of [policyPath(f), proposalsPath(f)]) expect((await request(app).get(path)).status).toBe(401);
    const actions = [
      { method: 'patch', path: policyPath(f), body: { approvalRequired: true } },
      { method: 'post', path: proposalsPath(f), body: proposalBody(f, 20000) },
      { method: 'patch', path: `${proposalsPath(f)}/${id}`, body: { decision: 'aprobar' } },
    ] as const;
    for (const action of actions) {
      const result = await request(app)[action.method](action.path).set('Cookie', 'csrf_token=anonymous-commercial')
        .set('X-CSRF-Token', 'anonymous-commercial').send(action.body);
      expect(result.status).toBe(401);
    }
    expect(await snapshot(f)).toEqual(before);
  });

  it('blocks missing and mismatched CSRF on valid policy, immediate-apply and review writes', async () => {
    const f = await create(); const id = await pending(f); await configure(f, false);
    const before = await snapshot(f);
    const actions = [
      { method: 'patch', path: policyPath(f), body: { approvalRequired: true } },
      { method: 'post', path: proposalsPath(f), body: proposalBody(f, 20000) },
      { method: 'patch', path: `${proposalsPath(f)}/${id}`, body: { decision: 'aprobar' } },
    ] as const;
    for (const wrongToken of [undefined, 'wrong-commercial-token']) {
      for (const action of actions) {
        const call = request(app)[action.method](action.path).set('Cookie', actors.admin.cookies);
        if (wrongToken) call.set('X-CSRF-Token', wrongToken);
        const result = await call.send(action.body);
        expect(result.status).toBe(403);
        expect(result.body.error.code).toBe('CSRF_INVALID');
      }
    }
    expect(await snapshot(f)).toEqual(before);
  });

  it('keeps pending and rejected proposals out of prices and customer email, and denies chief review', async () => {
    const f = await create(); const before = business(await snapshot(f)); const id = await pending(f);
    expect(business(await snapshot(f))).toEqual(before);
    const listed = await get(proposalsPath(f), 'chief');
    expect(listed.status).toBe(200);
    expect(listed.body.suggestions).toEqual(expect.arrayContaining([expect.objectContaining({ id, estado: 'pendiente', precioSugerido: 18000 })]));
    const beforeDenied = await snapshot(f);
    expect((await review(f, id, 'aprobar', 'chief')).status).toBe(403);
    expect(await snapshot(f)).toEqual(beforeDenied);
    const rejected = await review(f, id, 'rechazar');
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(200);
    expect(rejected.body.suggestion.estado).toBe('rechazada');
    expect(business(await snapshot(f))).toEqual(before);
  });

  const retainedExecution = async (f: Fixture) => ({
    order: ((row) => ({ estado: row.estado, qualityApprovedAt: row.qualityApprovedAt, qualityApprovedBy: row.qualityApprovedBy, qualityApprovalNote: row.qualityApprovalNote }))((await f.order.reload()).toJSON()),
    items: (await WorkOrderItem.findAll({ where: { workOrderId: f.order.id }, order: [['id', 'ASC']] })).map((row) => ({
      id: row.id, assignedUserId: row.assignedUserId, estadoOperativo: row.estadoOperativo,
      horasHombreReales: row.horasHombreReales, horasHombreEstimadas: row.horasHombreEstimadas,
      laborValidatedAt: row.laborValidatedAt, laborValidatedBy: row.laborValidatedBy, laborValidationNote: row.laborValidationNote,
      qualityStatus: row.qualityStatus, qualityReviewedAt: row.qualityReviewedAt, qualityReviewedBy: row.qualityReviewedBy, qualityNote: row.qualityNote,
    })),
    sessions: plain(await WorkOrderItemSession.findAll({ where: { workOrderId: f.order.id }, order: [['id', 'ASC']] })),
    assignments: plain(await WorkOrderItemAssignment.findAll({ where: { workOrderId: f.order.id }, order: [['id', 'ASC']] })),
    quality: plain(await WorkOrderQualityReview.findAll({ where: { workOrderId: f.order.id }, order: [['id', 'ASC']] })),
  });
  const prepareQuality = async (f: Fixture) => {
    const team = await mutate('post', `/api/work-orders/${f.order.id}/items/${f.items[0].id}/team`, {
      members: [{ userId: actors.mechanic.user.id, estimatedHours: 2 }], motivo: 'Conservar el equipo y sus horas',
    }, 'chief');
    expect(team.status, JSON.stringify(team.body)).toBe(200);
    await WorkOrderItemAssignment.update({ costHourly: 7317.42, saleHourly: 9321.57 }, { where: { workOrderItemId: f.items[0].id } });
    await WorkOrderItemSession.create({ workOrderId: f.order.id, workOrderItemId: f.items[0].id, userId: actors.mechanic.user.id, userName: actors.mechanic.user.nombre,
      startedAt: new Date('2026-10-10T10:00:00Z'), endedAt: new Date('2026-10-10T10:30:00Z'), durationMinutes: 30, status: 'cerrada', closeReason: 'completado', createdBy: actors.mechanic.user.id });
    await f.items[0].update({ horasHombreReales: 0.5, laborValidatedBy: actors.developer.user.id, laborValidatedAt: new Date('2026-10-10T11:00:00Z'), laborValidationNote: 'Horas conservadas' });
    for (const item of f.items) {
      expect((await mutate('patch', `/api/work-orders/${f.order.id}/execution`, { items: [{ id: item.id, estadoOperativo: 'completado' }] }, 'chief')).status).toBe(200);
      expect((await mutate('post', `/api/work-orders/${f.order.id}/items/${item.id}/quality`, { decision: 'aprobar' }, 'chief')).status).toBe(200);
    }
    expect((await mutate('post', `/api/work-orders/${f.order.id}/quality/confirm`, {}, 'chief')).status).toBe(200);
  };
  const checkApplication = async (approvalRequired: boolean) => {
    const f = await create({ discounted: true });
    if (!approvalRequired) await configure(f, false);
    await prepareQuality(f);
    const execution = await retainedExecution(f); const originalLines = await lines(f); const before = await snapshot(f);
    const created = await propose(f);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = Number(created.body.suggestion.id);
    const result = approvalRequired ? await review(f, id) : created;
    expect(result.status, JSON.stringify(result.body)).toBe(approvalRequired ? 200 : 201);
    expect(result.body.suggestion).toMatchObject({ estado: 'aprobada', appliedDirectly: !approvalRequired });
    expect(await retainedExecution(f)).toEqual(execution);
    const currentLines = await lines(f);
    expect(currentLines.map((row) => [row.id, row.workOrderItemId, row.descuentoTipo, Number(row.descuentoValor)])).toEqual(originalLines.map((row) => [row.id, row.workOrderItemId, row.descuentoTipo, Number(row.descuentoValor)]));
    expect(currentLines.map((row) => Number(row.precioUnitario))).toEqual([18000, 5000]);
    expect(currentLines.map((row) => Number(row.subtotal))).toEqual([32400, 4500]);
    expect((await f.quotation.reload()).toJSON()).toMatchObject({ descuentoTipo: 'porcentaje' });
    expect(Number(f.quotation.descuentoValor)).toBe(10);
    expect(Number(f.quotation.total)).toBe(33210);
    expect(Number((await f.items[0].reload()).precioUnitario)).toBe(18000);
    expect(Number((await f.catalog.reload()).precio)).toBe(10000);
    const after = await snapshot(f);
    const emails = await CustomerEmail.findAll({ where: { kind: 'work_order', entityId: f.order.id, category: 'progress' } });
    const added = emails.filter((row) => !before.emails.some((old) => (old as { id: number }).id === row.id));
    expect(added).toHaveLength(1);
    const message = added[0].payload.message ?? '';
    expect(message).toMatch(/neto/i);
    expect(message).toMatch(/total.*IVA|IVA.*total/i);
    for (const amount of ['10[.,]?000', '18[.,]?000', '39[.,]?520']) expect(message).toMatch(new RegExp(`(?<!\\d)${amount}(?!\\d)`));
    expect(JSON.stringify([result.body, added[0].payload, after.notices.slice(before.notices.length), after.events.slice(before.events.length)]))
      .not.toMatch(/costHourly|saleHourly|cost_hourly|sale_hourly|7317[.,]42|9321[.,]57/);
    expect(after.notices.length).toBeGreaterThan(before.notices.length);
    expect(after.events.length).toBeGreaterThan(before.events.length);
    expect(after.payments).toEqual(before.payments);
    expect(after.events).toEqual(expect.arrayContaining([expect.objectContaining({ metadata: expect.objectContaining({ priceSuggestionId: id }) })]));
  };

  it('applies direct OT changes atomically while retaining discounts, identities, hours and final QA', async () => { await checkApplication(false); });
  it('applies admin-approved OT changes with the same preservation and customer net/gross message', async () => { await checkApplication(true); });

  it('requires admin review for catalog and combined proposals even when direct OT pricing is enabled', async () => {
    for (const scope of ['catalogo', 'ambos'] as const) {
      const f = await create(); await configure(f, false);
      const before = business(await snapshot(f)); const id = await pending(f, 18000, scope);
      expect(business(await snapshot(f))).toEqual(before);
      expect((await review(f, id, 'aprobar', 'chief')).status).toBe(403);
      const result = await review(f, id);
      expect(result.status, JSON.stringify(result.body)).toBe(200);
      expect(result.body.suggestion).toMatchObject({ estado: 'aprobada', appliedDirectly: false });
      expect(Number((await f.catalog.reload()).precio)).toBe(18000);
      expect(Number((await f.items[0].reload()).precioUnitario)).toBe(scope === 'ambos' ? 18000 : 10000);
      expect(Number((await lines(f))[0].precioUnitario)).toBe(scope === 'ambos' ? 18000 : 10000);
    }
  });

  it('allows a zero-price diagnosis to acquire a price through either policy', async () => {
    for (const approvalRequired of [true, false]) {
      const f = await create({ price: 0 });
      if (!approvalRequired) await configure(f, false);
      const created = await propose(f, 12000);
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      if (approvalRequired) expect((await review(f, Number(created.body.suggestion.id))).status).toBe(200);
      expect(Number((await f.items[0].reload()).precioUnitario)).toBe(12000);
      expect(Number((await lines(f))[0].precioUnitario)).toBe(12000);
    }
  });

  it('accepts a price at the existing numeric input ceiling without an extra business cap', async () => {
    const f = await create(); await configure(f, false);
    const result = await propose(f, 999999999);
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    expect(result.body.suggestion).toMatchObject({ estado: 'aprobada', appliedDirectly: true, precioSugerido: 999999999 });
    expect(Number((await lines(f))[0].precioUnitario)).toBe(999999999);
  });

  it('returns 409 and leaves pending proposals unchanged when either OT or catalog snapshots are stale', async () => {
    for (const source of ['OT', 'catalog'] as const) {
      const f = await create(); const id = await pending(f, 18000, 'ambos');
      if (source === 'OT') {
        const changed = await mutate('patch', `/api/work-orders/${f.order.id}`, { items: [{ ...editable(f.items[0]), precioUnitario: 12000 }] }, 'admin');
        expect(changed.status, JSON.stringify(changed.body)).toBe(200);
      } else await f.catalog.update({ precio: 12000 });
      const before = await snapshot(f);
      expect((await review(f, id)).status).toBe(409);
      expect(await snapshot(f)).toEqual(before);
      expect((await WorkOrderPriceSuggestion.findByPk(id))!.estado).toBe('pendiente');
    }
  });

  it('rolls back direct and reviewed changes on fully-paid COTs or when the new gross is below payments', async () => {
    for (const direct of [false, true]) {
      for (const fullyPaid of [false, true]) {
        const f = await create();
        if (direct) await configure(f, false);
        const price = fullyPaid ? 18000 : 7000;
        const id = direct ? undefined : await pending(f, price, 'ambos');
        await pay(f, fullyPaid ? 11900 : 9000);
        const before = await snapshot(f);
        const result = direct ? await propose(f, price) : await review(f, id!);
        expect(result.status, JSON.stringify(result.body)).toBe(400);
        expect(await snapshot(f)).toEqual(before);
      }
    }
  });

  it('compares partial payments with the new gross rather than rejecting a valid lower net total', async () => {
    const f = await create(); await configure(f, false); await pay(f, 9000);
    const result = await propose(f, 8000);
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    expect(Number((await f.quotation.reload()).total)).toBe(8000);
    expect(getQuotationGrossTotal(Number(f.quotation.total))).toBe(9520);
    expect(Number(f.quotation.pagado)).toBe(9000);
    expect(f.quotation.estadoPago).toBe('parcial');
  });

  it('blocks policy and price mutations on delivered and cancelled orders without partial effects', async () => {
    for (const estado of ['entregada', 'cancelada'] as const) {
      const f = await create(); const id = await pending(f); await configure(f, false); await f.order.update({ estado });
      const before = await snapshot(f);
      expect((await mutate('patch', policyPath(f), { approvalRequired: true }, 'admin')).status).toBe(400);
      expect((await propose(f, 20000)).status).toBe(400);
      expect((await review(f, id)).status).toBe(400);
      expect(await snapshot(f)).toEqual(before);
    }
  });

  it('requires the chief to use Propuestas for existing OT and COT service prices under either policy', async () => {
    for (const approvalRequired of [true, false]) {
      const f = await create(); if (!approvalRequired) await configure(f, false);
      const before = await snapshot(f);
      const attempts = [
        { path: `/api/work-orders/${f.order.id}`, body: { items: [{ ...editable(f.items[0]), precioUnitario: 18000 }] } },
        { path: `/api/quotations/${f.quotation.id}`, body: { items: [{ ...editable((await lines(f))[0]), precioUnitario: 18000 }] } },
      ];
      for (const attempt of attempts) {
        const result = await mutate('patch', attempt.path, attempt.body, 'chief');
        expect([400, 403], JSON.stringify(result.body)).toContain(result.status);
        expect(result.body.error.message).toMatch(/propuestas?/i);
      }
      expect(await snapshot(f)).toEqual(before);
    }
  });

  it('denies mechanics proposal and policy access even with taller:update while retaining their assigned request flow', async () => {
    const f = await create(); const id = await pending(f);
    await f.order.update({ assignedMechanicId: actors.mechanic.user.id });
    await f.items[0].update({ assignedUserId: actors.mechanic.user.id });
    const permission = await Permission.findOne({ where: { modulo: 'taller', accion: 'update' } });
    expect(permission).not.toBeNull();
    expect(await RolePermission.count({ where: { roleId: actors.mechanic.user.roleId, permissionId: permission!.id } })).toBe(1);
    const before = await snapshot(f);
    expect((await get(policyPath(f), 'mechanic')).status).toBe(403);
    expect((await get(proposalsPath(f), 'mechanic')).status).toBe(403);
    expect((await propose(f, 20000, 'ot', 'mechanic')).status).toBe(403);
    expect((await review(f, id, 'aprobar', 'mechanic')).status).toBe(403);
    expect((await mutate('patch', policyPath(f), { approvalRequired: false }, 'mechanic')).status).toBe(403);
    expect(await snapshot(f)).toEqual(before);
    const ownRequest = await mutate('post', `/api/work-orders/${f.order.id}/requests`, { tipo: 'aumento_precio', workOrderItemId: f.items[0].id, precioSugerido: 20000, motivo: 'Solicitud propia del mecánico' }, 'mechanic');
    expect(ownRequest.status, JSON.stringify(ownRequest.body)).toBe(201);
    const foreign = await create();
    const hidden = await mutate('post', `/api/work-orders/${foreign.order.id}/requests`, { tipo: 'aumento_precio', workOrderItemId: foreign.items[0].id, precioSugerido: 20000, motivo: 'Intento en OT ajena' }, 'mechanic');
    expect([403, 404]).toContain(hidden.status);
  });

  it('preserves seller isolation on policy, proposals and linked quote reads', async () => {
    const f = await create(); const id = await pending(f); const before = await snapshot(f);
    for (const path of [policyPath(f), proposalsPath(f), `/api/quotations/${f.quotation.id}`]) {
      const result = await get(path, 'seller');
      expect(result.status).toBe(404);
      expect(JSON.stringify(result.body)).not.toContain(f.items[0].descripcion);
    }
    expect((await propose(f, 20000, 'ot', 'seller')).status).toBe(404);
    expect((await review(f, id, 'aprobar', 'seller')).status).toBe(404);
    expect((await mutate('patch', policyPath(f), { approvalRequired: false }, 'seller')).status).toBe(404);
    expect(await snapshot(f)).toEqual(before);
  });

  it('cannot review a proposal through another OT or spoof the strict policy input', async () => {
    const first = await create(); const other = await create(); const id = await pending(first);
    const before = [await snapshot(first), await snapshot(other)];
    expect((await review(other, id)).status).toBe(404);
    for (const body of [{ approvalRequired: 'false' }, { approvalRequired: false, canConfigure: true }]) {
      expect((await mutate('patch', policyPath(first), body, 'admin')).status).toBe(400);
    }
    expect([await snapshot(first), await snapshot(other)]).toEqual(before);
  });

  it.each([true, false])('routes the mechanic increase through the chief and current admin policy (%s)', async (approvalRequired) => {
    const f = await create();
    if (!approvalRequired) await configure(f, false);
    await f.order.update({ assignedMechanicId: actors.mechanic.user.id });
    await f.items[0].update({ assignedUserId: actors.mechanic.user.id });
    const requested = await mutate('post', `/api/work-orders/${f.order.id}/requests`, { tipo: 'aumento_precio', workOrderItemId: f.items[0].id, precioSugerido: 19000, motivo: 'Complejidad adicional comprobada' }, 'mechanic');
    expect(requested.status, JSON.stringify(requested.body)).toBe(201);
    const source = await WorkOrderRequest.findOne({ where: { workOrderId: f.order.id, tipo: 'aumento_precio' } });
    expect(source).not.toBeNull();
    const before = await CustomerEmail.count({ where: { kind: 'work_order', entityId: f.order.id, category: 'progress' } });
    const validated = await mutate('patch', `/api/work-orders/${f.order.id}/requests/${source!.id}`, { decision: 'aprobar' }, 'chief');
    expect(validated.status, JSON.stringify(validated.body)).toBe(200);
    const proposal = await WorkOrderPriceSuggestion.findOne({ where: { sourceRequestId: source!.id } });
    expect(proposal?.estado).toBe(approvalRequired ? 'pendiente' : 'aprobada');
    expect(Number((await f.items[0].reload()).precioUnitario)).toBe(approvalRequired ? 10000 : 19000);
    const worksheet = await get(`/api/work-orders/${f.order.id}/worksheet`, 'mechanic');
    const own = worksheet.body.worksheet.requests.find((entry: { id: number }) => entry.id === source!.id);
    expect(own.pendingPriceApproval).toBe(approvalRequired);
    expect(own.precioSugerido).toBeUndefined();
    expect(own.precioAprobado).toBeUndefined();
    if (approvalRequired) {
      expect(await CustomerEmail.count({ where: { kind: 'work_order', entityId: f.order.id, category: 'progress' } })).toBe(before);
      expect((await review(f, proposal!.id)).status).toBe(200);
    }
    expect(Number((await f.items[0].reload()).precioUnitario)).toBe(19000);
    expect(Number((await lines(f))[0].precioUnitario)).toBe(19000);
    const completed = await get(`/api/work-orders/${f.order.id}/worksheet`, 'mechanic');
    expect(completed.body.worksheet.requests.find((entry: { id: number }) => entry.id === source!.id).pendingPriceApproval).toBe(false);
    expect(await CustomerEmail.count({ where: { kind: 'work_order', entityId: f.order.id, category: 'progress' } })).toBe(before + 1);
  });
});
