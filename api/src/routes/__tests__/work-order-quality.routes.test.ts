import { randomUUID } from 'node:crypto';

import { WORK_ORDER_DELIVERY_CHECKLIST } from '@unithor/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { sequelize } from '../../config/database.js';
import { up as ensureQualitySchema } from '../../database/migrations/053-work-order-quality.js';
import { app } from '../../main.js';
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
import { WorkOrderDelivery } from '../../models/WorkOrderDelivery.js';
import { WorkOrderItem } from '../../models/WorkOrderItem.js';
import { WorkOrderItemAssignment } from '../../models/WorkOrderItemAssignment.js';
import { WorkOrderItemSession } from '../../models/WorkOrderItemSession.js';
import { WorkOrderQualityReview } from '../../models/WorkOrderQualityReview.js';
import { WorkOrderRequest } from '../../models/WorkOrderRequest.js';
import { invalidatePermissionCache } from '../../services/permission.service.js';
import { hashPassword } from '../../utils/password.js';

import type { CatalogType } from '@unithor/shared';

const runId = randomUUID();
const password = 'QualityPhase2Tests2026!';
const roleNames = {
  developer: 'desarrollador', admin: 'admin', chief: 'jefe',
  mechanic: 'mecanico', teammate: 'mecanico', outsider: 'mecanico', warehouse: 'bodeguero',
} as const;
type Actor = keyof typeof roleNames;
interface Auth { user: User; cookies: string[]; csrf: string }
interface Fixture { order: WorkOrder; quotation: Quotation; items: WorkOrderItem[] }
interface ItemInput {
  descripcion?: string;
  tipoLinea?: CatalogType;
  precioUnitario?: number;
}

describe('Phase 2 work-order quality and security (unithor_test only)', () => {
  const actors = {} as Record<Actor, Auth>;
  const users: User[] = [];
  const orderIds: number[] = [];
  const quotationIds: number[] = [];
  const catalogIds: number[] = [];
  let client: Client | undefined;
  let vehicle: Vehicle | undefined;

  const mutate = (method: 'post' | 'patch' | 'delete', path: string, body: object = {}, who: Actor = 'developer') =>
    request(app)[method](path).set('Cookie', actors[who].cookies)
      .set('X-CSRF-Token', actors[who].csrf).send(body);
  const get = (path: string, who: Actor = 'developer') =>
    request(app).get(path).set('Cookie', actors[who].cookies);
  const itemPath = (fixture: Fixture, index = 0) =>
    `/api/work-orders/${fixture.order.id}/items/${fixture.items[index].id}`;
  const confirmPath = (fixture: Fixture) => `/api/work-orders/${fixture.order.id}/quality/confirm`;
  const lines = (quotationId: number) => QuotationItem.findAll({
    where: { quotationId }, order: [['id', 'ASC']],
  });
  const reviews = (orderId: number) => WorkOrderQualityReview.findAll({
    where: { workOrderId: orderId }, order: [['id', 'ASC']],
  });

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-16T15:00:00Z'));
    if (sequelize.getDatabaseName() !== 'unithor_test') throw new Error('Quality tests require unithor_test');
    // The parent runner applies migrations and registers models before this suite.
    expect((await sequelize.getQueryInterface().describeTable('work_order_items')).quality_status).toBeDefined();
    const passwordHash = await hashPassword(password);
    for (const who of Object.keys(roleNames) as Actor[]) {
      const role = await Role.findOne({ where: { nombre: roleNames[who] } });
      if (!role) throw new Error(`Missing seeded role: ${roleNames[who]}`);
      const user = await User.create({
        nombre: `QA ${who}`, email: `quality-${who}-${runId}@example.com`,
        passwordHash, roleId: role.id, activo: true,
      });
      users.push(user);
      const login = await request(app).post('/api/auth/login').send({ email: user.email, password });
      expect(login.status, JSON.stringify(login.body)).toBe(200);
      const raw = login.headers['set-cookie'] as unknown;
      const cookies = (Array.isArray(raw) ? raw as string[] : []).map((cookie) => cookie.split(';')[0]);
      const csrf = cookies.find((cookie) => cookie.startsWith('csrf_token='))?.slice(11);
      if (!csrf) throw new Error('Login did not issue a CSRF cookie');
      actors[who] = { user, cookies, csrf };
    }
    client = await Client.create({ nombre: `Quality client ${runId}`, tipo: 'cliente' });
    vehicle = await Vehicle.create({ patente: `Q${runId.replaceAll('-', '').slice(0, 7).toUpperCase()}`, clientId: client.id });
  }, 30000);

  afterAll(async () => {
    vi.useRealTimers();
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
      const userIds = users.map((user) => user.id);
      await Notification.destroy({ where: { userId: userIds } });
      await RefreshToken.destroy({ where: { userId: userIds } });
      await User.destroy({ where: { id: userIds }, force: true });
    }
  }, 30000);

  const createOrder = async (inputs: ItemInput[] = [{}]): Promise<Fixture> => {
    const created = await mutate('post', '/api/work-orders', {
      clientId: client!.id, vehicleId: vehicle!.id, kilometrajeIngreso: 100,
      items: inputs.map((input, index) => ({
        descripcion: input.descripcion ?? `Quality service ${index} ${runId}`,
        tipoLinea: input.tipoLinea ?? 'estandar', unidadMedida: 'servicio',
        cantidad: 1, precioUnitario: input.precioUnitario ?? 10000,
      })),
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = Number(created.body.workOrder.id);
    orderIds.push(id);
    const order = await WorkOrder.findByPk(id);
    const quotation = await Quotation.findOne({ where: { workOrderId: id } });
    if (quotation) quotationIds.push(quotation.id);
    if (!order || !quotation) throw new Error('Missing created OT or its mirror COT');
    const items = await WorkOrderItem.findAll({ where: { workOrderId: id }, order: [['id', 'ASC']] });
    expect(items).toHaveLength(inputs.length);
    return { order, quotation, items };
  };
  const setExecution = (fixture: Fixture, status: 'completado' | 'omitido' | 'en_proceso', index = 0) =>
    mutate('patch', `/api/work-orders/${fixture.order.id}/execution`, {
      items: [{ id: fixture.items[index].id, estadoOperativo: status }],
    }, 'chief');
  const setTeam = (fixture: Fixture, members: Actor[] = ['mechanic', 'teammate']) =>
    mutate('post', `${itemPath(fixture)}/team`, {
      members: members.map((who) => ({ userId: actors[who].user.id, estimatedHours: 1 })),
      motivo: 'Asignación del equipo para pruebas de calidad',
    }, 'chief');
  const approve = (fixture: Fixture, index = 0, who: Actor = 'chief', body: object = { decision: 'aprobar' }) =>
    mutate('post', `${itemPath(fixture, index)}/quality`, body, who);
  const finishAndApprove = async (fixture: Fixture) => {
    for (const [index, item] of fixture.items.entries()) {
      expect((await setExecution(fixture, 'completado', index)).status).toBe(200);
      if (item.tipoLinea !== 'parte') {
        const result = await approve(fixture, index);
        expect(result.status, JSON.stringify(result.body)).toBe(200);
      }
    }
    const confirmed = await mutate('post', confirmPath(fixture), {}, 'chief');
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
    return confirmed;
  };
  const completeWithTime = async (fixture: Fixture, who: Actor = 'mechanic', minutes = 30) => {
    const started = await mutate('post', `${itemPath(fixture)}/start`, {}, who);
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    await WorkOrderItemSession.update({ startedAt: new Date(Date.now() - minutes * 60000) }, {
      where: { workOrderItemId: fixture.items[0].id, userId: actors[who].user.id, status: 'abierta' },
    });
    const completed = await mutate('post', `${itemPath(fixture)}/complete`, {}, who);
    expect(completed.status, JSON.stringify(completed.body)).toBe(200);
  };
  const deliveryBody = () => ({
    kilometrajeSalida: 150, receptorNombre: 'Receptor de calidad',
    receptorRut: '12.345.678-5', receptorTelefono: '+56912345678',
    checklist: [...WORK_ORDER_DELIVERY_CHECKLIST], conformidad: true,
    firmaRecepcion: 'Receptor de calidad',
  });
  const deliver = (fixture: Fixture) => mutate('post', `/api/work-orders/${fixture.order.id}/deliver`, deliveryBody());
  const editable = (item: WorkOrderItem | QuotationItem) => ({
    id: item.id, catalogItemId: item.catalogItemId, descripcion: item.descripcion,
    tipoLinea: item.tipoLinea, unidadMedida: item.unidadMedida, cantidad: Number(item.cantidad),
    precioUnitario: Number(item.precioUnitario), estadoOperativo: item.estadoOperativo,
    notasOperativas: item.notasOperativas,
  });
  const snapshot = async (fixture: Fixture) => ({
    order: (await fixture.order.reload()).toJSON(),
    items: (await WorkOrderItem.findAll({ where: { workOrderId: fixture.order.id }, order: [['id', 'ASC']] })).map((row) => row.toJSON()),
    history: (await reviews(fixture.order.id)).map((row) => row.toJSON()),
    mirror: (await lines(fixture.quotation.id)).map((row) => row.toJSON()),
  });

  it('requires authentication on summary, item review and final confirmation', async () => {
    const fixture = await createOrder();
    expect((await setExecution(fixture, 'completado')).status).toBe(200);
    const beforeReview = await snapshot(fixture);
    expect((await request(app).get(`/api/work-orders/${fixture.order.id}/quality`)).status).toBe(401);
    const review = await request(app).post(`${itemPath(fixture)}/quality`)
      .set('Cookie', 'csrf_token=anonymous-quality-test').set('X-CSRF-Token', 'anonymous-quality-test')
      .send({ decision: 'aprobar' });
    expect(review.status).toBe(401);
    expect(await snapshot(fixture)).toEqual(beforeReview);
    expect((await approve(fixture)).status).toBe(200);
    const beforeConfirm = await snapshot(fixture);
    const confirmed = await request(app).post(confirmPath(fixture))
      .set('Cookie', 'csrf_token=anonymous-quality-test').set('X-CSRF-Token', 'anonymous-quality-test')
      .send({});
    expect(confirmed.status).toBe(401);
    expect(await snapshot(fixture)).toEqual(beforeConfirm);
  });

  it.each(['missing', 'mismatched'] as const)('rejects %s CSRF on both quality mutations without changing the OT', async (csrf) => {
    for (const kind of ['review', 'confirm'] as const) {
      const fixture = await createOrder();
      expect((await setExecution(fixture, 'completado')).status).toBe(200);
      if (kind === 'confirm') expect((await approve(fixture)).status).toBe(200);
      const before = await snapshot(fixture);
      const path = kind === 'review' ? `${itemPath(fixture)}/quality` : confirmPath(fixture);
      const body = kind === 'review' ? { decision: 'aprobar' } : {};
      const pending = request(app).post(path).set('Cookie', actors.chief.cookies);
      if (csrf === 'mismatched') pending.set('X-CSRF-Token', 'wrong-quality-token');
      const result = await pending.send(body);
      expect(result.status).toBe(403);
      expect(result.body.error.code).toBe('CSRF_INVALID');
      expect(await snapshot(fixture)).toEqual(before);
    }
  });

  it.each(['mechanic', 'warehouse'] as const)('denies reviews and final confirmation to %s even with taller:update', async (who) => {
    const fixture = await createOrder();
    expect((await setTeam(fixture, ['mechanic'])).status).toBe(200);
    expect((await setExecution(fixture, 'completado')).status).toBe(200);
    const before = await snapshot(fixture);
    expect((await approve(fixture, 0, who)).status).toBe(403);
    expect((await mutate('post', confirmPath(fixture), {}, who)).status).toBe(403);
    expect(await snapshot(fixture)).toEqual(before);
  });

  it('requires taller:update as well as the chief role', async () => {
    const fixture = await createOrder();
    expect((await setExecution(fixture, 'completado')).status).toBe(200);
    const permission = await Permission.findOne({ where: { modulo: 'taller', accion: 'update' } });
    if (!permission) throw new Error('Missing taller:update permission');
    const where = { roleId: actors.chief.user.roleId, permissionId: permission.id };
    const grant = await RolePermission.findOne({ where });
    expect(grant).not.toBeNull();
    try {
      await RolePermission.destroy({ where });
      invalidatePermissionCache(where.roleId);
      const before = await snapshot(fixture);
      expect((await approve(fixture)).status).toBe(403);
      expect((await mutate('post', confirmPath(fixture), {}, 'chief')).status).toBe(403);
      expect(await snapshot(fixture)).toEqual(before);
    } finally {
      if (grant) await RolePermission.findOrCreate({ where, defaults: where });
      invalidatePermissionCache(where.roleId);
    }
  });

  it('lets a mechanic read only assigned quality summaries without commercial or credential leaks', async () => {
    const own = await createOrder();
    const foreign = await createOrder([{ descripcion: `Private foreign service ${runId}` }]);
    expect((await setTeam(own, ['mechanic'])).status).toBe(200);
    expect((await setTeam(foreign, ['outsider'])).status).toBe(200);
    const allowed = await get(`/api/work-orders/${own.order.id}/quality`, 'mechanic');
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(200);
    expect(allowed.body).toHaveProperty('quality');
    expect(JSON.stringify(allowed.body)).not.toMatch(/precioUnitario|subtotal|costHourly|saleHourly|passwordHash|refreshToken/);
    const hidden = await get(`/api/work-orders/${foreign.order.id}/quality`, 'mechanic');
    expect(hidden.status).toBe(404);
    expect(JSON.stringify(hidden.body)).not.toContain(foreign.items[0].descripcion);
    expect(hidden.body).not.toHaveProperty('quality');
  });

  it('rejects an item ID belonging to another OT without appending either history', async () => {
    const first = await createOrder();
    const other = await createOrder();
    expect((await setExecution(other, 'completado')).status).toBe(200);
    const before = [await snapshot(first), await snapshot(other)];
    const result = await mutate('post', `/api/work-orders/${first.order.id}/items/${other.items[0].id}/quality`, { decision: 'aprobar' }, 'chief');
    expect(result.status).toBe(400);
    expect([await snapshot(first), await snapshot(other)]).toEqual(before);
  });

  it('keeps technical completion separate from QA and blocks status/delivery bypasses', async () => {
    const fixture = await createOrder();
    expect((await setTeam(fixture, ['mechanic'])).status).toBe(200);
    await completeWithTime(fixture);
    expect((await fixture.items[0].reload()).toJSON()).toMatchObject({
      estadoOperativo: 'completado', qualityStatus: 'pendiente', qualityReviewedAt: null,
    });
    expect((await fixture.order.reload()).toJSON()).toMatchObject({ estado: 'en_progreso', qualityApprovedAt: null });
    expect((await mutate('post', confirmPath(fixture), {}, 'chief')).status).toBe(400);
    expect((await mutate('patch', `/api/work-orders/${fixture.order.id}/status`, { nuevoEstado: 'finalizada' })).status).toBe(400);
    expect((await deliver(fixture)).status).toBe(400);
    expect(await WorkOrderDelivery.count({ where: { workOrderId: fixture.order.id } })).toBe(0);
    expect(await reviews(fixture.order.id)).toHaveLength(0);
  });

  it.each(['chief', 'admin', 'developer'] as const)('allows %s to approve a service and confirm without notes or an extra checklist', async (who) => {
    const fixture = await createOrder();
    expect((await setExecution(fixture, 'completado')).status).toBe(200);
    expect((await approve(fixture, 0, who)).status).toBe(200);
    const approvedItem = (await fixture.items[0].reload()).toJSON();
    expect(approvedItem).toMatchObject({ qualityStatus: 'aprobado', qualityReviewedBy: actors[who].user.id, qualityNote: null });
    expect(approvedItem).toHaveProperty('qualityReviewedAt', expect.any(Date));
    expect((await fixture.order.reload()).toJSON()).toMatchObject({ estado: 'en_progreso', qualityApprovedAt: null });
    const result = await mutate('post', confirmPath(fixture), {}, who);
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.quality.history).toEqual(expect.arrayContaining([
      expect.objectContaining({ workOrderItemId: fixture.items[0].id, decision: 'aprobado', reviewedBy: actors[who].user.id, reviewerName: actors[who].user.nombre }),
      expect.objectContaining({ workOrderItemId: null, decision: 'aprobado', reviewedBy: actors[who].user.id, reviewerName: actors[who].user.nombre }),
    ]));
    expect((await fixture.order.reload()).toJSON()).toMatchObject({
      estado: 'finalizada', qualityApprovedBy: actors[who].user.id, qualityApprovalNote: null,
      qualityApprovedAt: expect.any(Date),
    });
    expect((await reviews(fixture.order.id)).map((row) => ({ decision: row.decision, itemId: row.workOrderItemId }))).toEqual([
      { decision: 'aprobado', itemId: fixture.items[0].id },
      { decision: 'aprobado', itemId: null },
    ]);
  });

  it('trims and retains optional service and final notes in the current state and audit history', async () => {
    const fixture = await createOrder();
    expect((await setExecution(fixture, 'completado')).status).toBe(200);
    expect((await approve(fixture, 0, 'chief', { decision: 'aprobar', nota: '  Servicio conforme  ' })).status).toBe(200);
    expect((await mutate('post', confirmPath(fixture), { notas: '  Inspección final conforme  ' }, 'chief')).status).toBe(200);
    expect((await fixture.items[0].reload()).toJSON()).toMatchObject({ qualityNote: 'Servicio conforme' });
    expect((await fixture.order.reload()).toJSON()).toMatchObject({ qualityApprovalNote: 'Inspección final conforme' });
    expect((await reviews(fixture.order.id)).map((row) => ({ decision: row.decision, note: row.note, reviewedBy: row.reviewedBy }))).toEqual([
      { decision: 'aprobado', note: 'Servicio conforme', reviewedBy: actors.chief.user.id },
      { decision: 'aprobado', note: 'Inspección final conforme', reviewedBy: actors.chief.user.id },
    ]);
  });

  it.each([
    ['missing rejection note', { decision: 'rechazar' }],
    ['null rejection note', { decision: 'rechazar', nota: null }],
    ['short trimmed rejection note', { decision: 'rechazar', nota: ' x ' }],
    ['oversized approval note', { decision: 'aprobar', nota: 'a'.repeat(2001) }],
    ['members on approval', { decision: 'aprobar', members: [] }],
    ['injected approval state', { decision: 'aprobar', qualityStatus: 'aprobado' }],
  ] as const)('validates strict review input before changing state: %s', async (_label, body) => {
    const fixture = await createOrder();
    expect((await setExecution(fixture, 'completado')).status).toBe(200);
    const before = await snapshot(fixture);
    expect((await mutate('post', `${itemPath(fixture)}/quality`, body, 'chief')).status).toBe(400);
    expect(await snapshot(fixture)).toEqual(before);
  });

  it.each([
    ['extra checklist', { checklist: [] }],
    ['oversized note', { notas: 'a'.repeat(2001) }],
    ['injected reviewer', { qualityApprovedBy: 1 }],
  ] as const)('rejects unsupported final confirmation fields: %s', async (_label, body) => {
    const fixture = await createOrder();
    expect((await setExecution(fixture, 'completado')).status).toBe(200);
    expect((await approve(fixture)).status).toBe(200);
    const before = await snapshot(fixture);
    expect((await mutate('post', confirmPath(fixture), body, 'chief')).status).toBe(400);
    expect(await snapshot(fixture)).toEqual(before);
  });

  it('requires review of every non-part service including omitted work, while parts use execution checks', async () => {
    const fixture = await createOrder([{ tipoLinea: 'estandar' }, { tipoLinea: 'especifico' }, { tipoLinea: 'parte', precioUnitario: 0 }]);
    expect((await approve(fixture)).status).toBe(400);
    expect((await setExecution(fixture, 'completado')).status).toBe(200);
    expect((await setExecution(fixture, 'omitido', 1)).status).toBe(200);
    expect((await approve(fixture)).status).toBe(200);
    expect((await mutate('post', confirmPath(fixture), {}, 'chief')).status).toBe(400);
    expect((await approve(fixture, 1)).status).toBe(200);
    // A pending part blocks final confirmation but never needs an individual QA decision.
    expect((await mutate('post', confirmPath(fixture), {}, 'chief')).status).toBe(400);
    expect((await setExecution(fixture, 'omitido', 2)).status).toBe(200);
    expect((await approve(fixture, 2)).status).toBe(400);
    expect((await mutate('post', confirmPath(fixture), { notas: null }, 'chief')).status).toBe(200);
    expect((await reviews(fixture.order.id)).filter((row) => row.workOrderItemId === fixture.items[2].id)).toHaveLength(0);
    expect((await deliver(fixture)).status).toBe(200);
  });

  it.each([false, true])('rejects finalized work, resets completion, preserves hours and mirror IDs (reassign: %s)', async (reassign) => {
    const fixture = await createOrder();
    expect((await setTeam(fixture)).status).toBe(200);
    await completeWithTime(fixture, 'mechanic', 30);
    await completeWithTime(fixture, 'teammate', 15);
    expect((await approve(fixture)).status).toBe(200);
    expect((await mutate('post', confirmPath(fixture), {}, 'chief')).status).toBe(200);
    const originalSessions = (await WorkOrderItemSession.findAll({ where: { workOrderId: fixture.order.id }, order: [['id', 'ASC']] })).map((row) => row.toJSON());
    const originalLines = await lines(fixture.quotation.id);
    const originalAssignments = await WorkOrderItemAssignment.findAll({ where: { workOrderItemId: fixture.items[0].id, active: true } });
    expect(originalAssignments).toHaveLength(2);
    expect(originalAssignments.every((row) => row.completedAt !== null)).toBe(true);
    const body = {
      decision: 'rechazar', nota: '  Corregir la pérdida detectada  ',
      ...(reassign ? { members: [{ userId: actors.outsider.user.id, estimatedHours: 2 }] } : {}),
    };
    const rejected = await mutate('post', `${itemPath(fixture)}/quality`, body, 'chief');
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(200);
    expect(rejected.body.quality.history).toEqual(expect.arrayContaining([
      expect.objectContaining({ workOrderItemId: fixture.items[0].id, decision: 'rechazado', reviewerName: actors.chief.user.nombre }),
    ]));
    expect((await fixture.items[0].reload()).toJSON()).toMatchObject({
      estadoOperativo: 'pendiente', qualityStatus: 'rechazado', qualityNote: 'Corregir la pérdida detectada',
      qualityReviewedBy: actors.chief.user.id,
    });
    expect(Number(fixture.items[0].horasHombreReales)).toBe(0.75);
    expect((await fixture.order.reload()).toJSON()).toMatchObject({
      estado: 'en_progreso', qualityApprovedAt: null, qualityApprovedBy: null, qualityApprovalNote: null,
    });
    const assignments = await WorkOrderItemAssignment.findAll({ where: { workOrderItemId: fixture.items[0].id } });
    expect(assignments.every((row) => row.completedAt === null)).toBe(true);
    expect(assignments.filter((row) => row.active).map((row) => row.userId).sort()).toEqual(
      (reassign ? [actors.outsider.user.id] : [actors.mechanic.user.id, actors.teammate.user.id]).sort(),
    );
    expect(originalAssignments.every((original) => assignments.some((row) => row.id === original.id))).toBe(true);
    expect((await WorkOrderItemSession.findAll({ where: { workOrderId: fixture.order.id }, order: [['id', 'ASC']] })).map((row) => row.toJSON())).toEqual(originalSessions);
    const mirror = await lines(fixture.quotation.id);
    expect(mirror.map((row) => [row.id, row.workOrderItemId])).toEqual(originalLines.map((row) => [row.id, row.workOrderItemId]));
    expect(mirror[0].estadoOperativo).toBe('pendiente');
    expect((await reviews(fixture.order.id)).map((row) => row.decision)).toEqual(['aprobado', 'aprobado', 'rechazado']);
    expect((await deliver(fixture)).status).toBe(400);
    if (reassign) {
      expect((await get(`/api/work-orders/${fixture.order.id}/quality`, 'mechanic')).status).toBe(404);
      expect((await get(`/api/work-orders/${fixture.order.id}/quality`, 'outsider')).status).toBe(200);
    }
  });

  it.each(['OT content', 'COT content', 'execution'] as const)('invalidates service and global approvals when reopening via %s', async (origin) => {
    const fixture = await createOrder();
    expect((await setTeam(fixture, ['mechanic'])).status).toBe(200);
    await completeWithTime(fixture);
    expect((await approve(fixture)).status).toBe(200);
    expect((await mutate('post', confirmPath(fixture), {}, 'chief')).status).toBe(200);
    const beforeLines = await lines(fixture.quotation.id);
    const beforeSessions = await WorkOrderItemSession.findAll({ where: { workOrderId: fixture.order.id }, order: [['id', 'ASC']] });
    const previousHistory = (await reviews(fixture.order.id)).map((row) => row.toJSON());
    const savedHours = Number((await fixture.items[0].reload()).horasHombreReales);
    const changed = origin === 'OT content'
      ? await mutate('patch', `/api/work-orders/${fixture.order.id}`, { items: [{ ...editable(fixture.items[0]), descripcion: 'Trabajo corregido desde OT' }] })
      : origin === 'COT content'
        ? await mutate('patch', `/api/quotations/${fixture.quotation.id}`, { items: [{ ...editable(beforeLines[0]), descripcion: 'Trabajo corregido desde COT' }] })
        : origin === 'execution'
          ? await setExecution(fixture, 'en_proceso')
          : await mutate('post', `${itemPath(fixture)}/start`, {}, 'mechanic');
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect((await fixture.items[0].reload()).toJSON()).toMatchObject({
      qualityStatus: 'pendiente', qualityReviewedBy: null, qualityReviewedAt: null, qualityNote: null,
    });
    expect((await fixture.order.reload()).toJSON()).toMatchObject({
      estado: 'en_progreso', qualityApprovedAt: null, qualityApprovedBy: null, qualityApprovalNote: null,
    });
    expect(Number(fixture.items[0].horasHombreReales)).toBe(savedHours);
    expect((await lines(fixture.quotation.id)).map((row) => [row.id, row.workOrderItemId])).toEqual(beforeLines.map((row) => [row.id, row.workOrderItemId]));
    const retained = await WorkOrderItemSession.findAll({ where: { id: beforeSessions.map((row) => row.id) }, order: [['id', 'ASC']] });
    expect(retained.map((row) => row.toJSON())).toEqual(beforeSessions.map((row) => row.toJSON()));
    expect((await reviews(fixture.order.id)).slice(0, previousHistory.length).map((row) => row.toJSON())).toEqual(previousHistory);
    expect((await deliver(fixture)).status).toBe(400);

  });

  it('requires the chief to reopen approved work before a mechanic can restart its timer', async () => {
    const fixture = await createOrder();
    expect((await setTeam(fixture, ['mechanic'])).status).toBe(200);
    await completeWithTime(fixture);
    expect((await approve(fixture)).status).toBe(200);
    expect((await mutate('post', confirmPath(fixture), {}, 'chief')).status).toBe(200);
    const approvedAt = (await fixture.order.reload()).qualityApprovedAt!.getTime();
    const savedHours = Number((await fixture.items[0].reload()).horasHombreReales);
    expect((await mutate('post', `${itemPath(fixture)}/start`, {}, 'mechanic')).status).toBe(400);
    expect((await fixture.order.reload()).qualityApprovedAt!.getTime()).toBe(approvedAt);
    expect((await mutate('post', `${itemPath(fixture)}/quality`, { decision: 'rechazar', nota: 'Corregir ajuste detectado en revisión final' }, 'chief')).status).toBe(200);
    expect((await mutate('post', `${itemPath(fixture)}/start`, {}, 'mechanic')).status).toBe(200);
    expect((await mutate('post', `${itemPath(fixture)}/complete`, {}, 'mechanic')).status).toBe(200);
    expect((await fixture.items[0].reload()).qualityStatus).toBe('pendiente');
    expect(Number(fixture.items[0].horasHombreReales)).toBeGreaterThanOrEqual(savedHours);
    expect((await fixture.order.reload()).qualityApprovedAt).toBeNull();
  });

  it('requires a fresh final review after an additional part is approved', async () => {
    const fixture = await createOrder();
    await finishAndApprove(fixture);
    const part = await CatalogItem.create({ tipo: 'parte', nombre: `Pieza QA ${runId}`, codigo: `QA-${runId}`, precio: 5000, stock: 0 });
    catalogIds.push(part.id);
    const pending = await WorkOrderRequest.create({ workOrderId: fixture.order.id, workOrderItemId: null, catalogItemId: part.id, requestedBy: actors.mechanic.user.id, tipo: 'repuesto', motivo: 'Pieza adicional detectada después de la revisión', cantidad: 1, precioSugerido: null, precioAprobado: null, reviewedBy: null, reviewNote: null, reviewedAt: null });
    const result = await mutate('patch', `/api/work-orders/${fixture.order.id}/requests/${pending.id}`, { decision: 'aprobar' }, 'chief');
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect((await fixture.order.reload()).qualityApprovedAt).toBeNull();
    expect(fixture.order.estado).toBe('en_progreso');
    expect((await fixture.items[0].reload()).qualityStatus).toBe('aprobado');
    const addedPart = await WorkOrderItem.findOne({ where: { workOrderId: fixture.order.id, catalogItemId: part.id } });
    expect(addedPart).not.toBeNull();
    const mirrorPart = await QuotationItem.findOne({ where: { quotationId: fixture.quotation.id, workOrderItemId: addedPart!.id } });
    expect(mirrorPart?.tipoLinea).toBe('parte');
    expect(mirrorPart?.unidadMedida).toBe(addedPart!.unidadMedida);
    const quality = await get(`/api/work-orders/${fixture.order.id}/quality`, 'chief');
    expect(quality.body.quality.items.filter((item: { tipoLinea: string }) => item.tipoLinea !== 'parte')).toHaveLength(1);
    expect((await deliver(fixture)).status).toBe(400);
  });

  it('invalidates inherited service reviews when the general mechanic changes', async () => {
    const fixture = await createOrder();
    await fixture.order.update({ assignedMechanicId: actors.mechanic.user.id });
    await finishAndApprove(fixture);
    const result = await mutate('patch', `/api/work-orders/${fixture.order.id}/assignment`, { mechanicId: actors.teammate.user.id }, 'chief');
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect((await fixture.items[0].reload()).qualityStatus).toBe('pendiente');
    expect((await fixture.order.reload()).qualityApprovedAt).toBeNull();
    expect((await get(`/api/work-orders/${fixture.order.id}/quality`, 'mechanic')).status).toBe(404);
    expect((await get(`/api/work-orders/${fixture.order.id}/quality`, 'teammate')).status).toBe(200);
  });

  it.each(['completado', 'omitido'] as const)('blocks zero-price %s services using authoritative COT prices', async (status) => {
    const fixture = await createOrder();
    expect((await setExecution(fixture, status)).status).toBe(200);
    expect((await approve(fixture)).status).toBe(200);
    expect((await mutate('post', confirmPath(fixture), {}, 'chief')).status).toBe(200);
    // Simulate a legacy mismatch: the OT has a price but its linked commercial line does not.
    await QuotationItem.update({ precioUnitario: 0, subtotal: 0 }, { where: { quotationId: fixture.quotation.id } });
    const response = await deliver(fixture);
    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/precio|cotiz|servicio/i);
    expect((await fixture.order.reload()).estado).toBe('finalizada');
    expect(await WorkOrderDelivery.count({ where: { workOrderId: fixture.order.id } })).toBe(0);
    expect(await Payment.count({ where: { quotationId: fixture.quotation.id } })).toBe(0);
  });

  it('delivers unpaid work using a positive linked COT price despite a stale zero OT price', async () => {
    const fixture = await createOrder();
    await finishAndApprove(fixture);
    // A read must prefer the linked COT price, without manufacturing payment records.
    await fixture.items[0].update({ precioUnitario: 0 });
    const result = await deliver(fixture);
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect((await fixture.order.reload()).estado).toBe('entregada');
    expect((await fixture.quotation.reload()).estadoPago).toBe('por_pagar');
    expect(Number(fixture.quotation.pagado)).toBe(0);
    expect(await Payment.count({ where: { quotationId: fixture.quotation.id } })).toBe(0);
    expect(await WorkOrderDelivery.count({ where: { workOrderId: fixture.order.id } })).toBe(1);
  });

  it.each([0, 10000])('falls back to the OT price only when no mirror COT exists (price: %s)', async (price) => {
    const fixture = await createOrder([{ precioUnitario: price }]);
    await fixture.quotation.destroy({ force: true });
    await finishAndApprove(fixture);
    const result = await deliver(fixture);
    expect(result.status, JSON.stringify(result.body)).toBe(price > 0 ? 200 : 400);
    expect(await WorkOrderDelivery.count({ where: { workOrderId: fixture.order.id } })).toBe(price > 0 ? 1 : 0);
  });

  it('never invents approvals for legacy finalizada/entregada orders when migration 053 is repeated', async () => {
    const fixtures = [await createOrder(), await createOrder()];
    const states = ['finalizada', 'entregada'] as const;
    for (const [index, fixture] of fixtures.entries()) {
      await fixture.items[0].update({ estadoOperativo: 'completado' });
      await fixture.order.update({ estado: states[index] });
    }
    await ensureQualitySchema(sequelize.getQueryInterface());
    await ensureQualitySchema(sequelize.getQueryInterface());
    for (const [index, fixture] of fixtures.entries()) {
      expect((await fixture.order.reload()).toJSON()).toMatchObject({ estado: states[index], qualityApprovedAt: null, qualityApprovedBy: null });
      expect((await fixture.items[0].reload()).toJSON()).toMatchObject({ qualityStatus: 'pendiente', qualityReviewedAt: null, qualityReviewedBy: null });
      expect(await reviews(fixture.order.id)).toHaveLength(0);
    }
    expect((await deliver(fixtures[0])).status).toBe(400);
  });

  it('provides no mutation endpoint for editing or deleting an earlier quality decision', async () => {
    const fixture = await createOrder();
    await finishAndApprove(fixture);
    const before = await snapshot(fixture);
    for (const method of ['patch', 'delete'] as const) {
      expect((await mutate(method, `${itemPath(fixture)}/quality`, { decision: 'rechazar', nota: 'Editar historial' })).status).toBe(404);
    }
    expect(await snapshot(fixture)).toEqual(before);
  });

  it('removes only redundant codigo indexes without losing the unique constraint or order data', async () => {
    const fixture = await createOrder();
    const before = await snapshot(fixture);
    const queryInterface = sequelize.getQueryInterface();
    await queryInterface.addIndex('work_orders', ['codigo'], { name: 'codigo_63', unique: true });
    await ensureQualitySchema(queryInterface);
    const indexes = await queryInterface.showIndex('work_orders') as Array<{ name: string; unique: boolean; fields: Array<{ attribute: string }> }>;
    expect(indexes.some((index) => index.name === 'codigo_63')).toBe(false);
    expect(indexes.some((index) => index.unique && index.fields.length === 1 && index.fields[0].attribute === 'codigo')).toBe(true);
    expect(WorkOrder.rawAttributes.codigo.unique).not.toBe(true);
    expect(await snapshot(fixture)).toEqual(before);
  });
});
