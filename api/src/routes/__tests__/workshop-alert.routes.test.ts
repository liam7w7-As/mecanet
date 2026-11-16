import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { CustomerEmail } from '../../models/CustomerEmail.js';
import { Notification } from '../../models/Notification.js';
import { Quotation } from '../../models/Quotation.js';
import { QuotationItem } from '../../models/QuotationItem.js';
import { Role } from '../../models/Role.js';
import { RolePermission } from '../../models/RolePermission.js';
import { User } from '../../models/User.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { WorkOrderEvent } from '../../models/WorkOrderEvent.js';
import { WorkOrderItem } from '../../models/WorkOrderItem.js';
import { WorkOrderItemAssignment } from '../../models/WorkOrderItemAssignment.js';
import { WorkOrderItemSession } from '../../models/WorkOrderItemSession.js';
import { WorkshopAlertSettings } from '../../models/WorkshopAlertSettings.js';
import { invalidatePermissionCache } from '../../services/permission.service.js';
import { signAccessToken } from '../../utils/jwt.js';

import type { ItemOperationalStatus, WorkshopAlertSummary, WorkOrderStatus } from '@unithor/shared';
import type { InferAttributes } from 'sequelize';

const runId = randomUUID();
const tag = runId.replaceAll('-', '').slice(0, 12);
const day = '2002-03-04';
const globalPath = '/api/work-orders/operations/alerts';
const settingsPath = '/api/work-orders/operations/alert-settings';
const csrf = `alerts-${runId}`;
const roles = { developer: 'desarrollador', admin: 'admin', chief: 'jefe', mechanic: 'mecanico', teammate: 'mecanico', seller: 'vendedor', finance: 'finanzas', warehouse: 'bodeguero' } as const;
type Actor = keyof typeof roles;
interface Fixture { order: WorkOrder; item: WorkOrderItem }
const plain = (rows: { toJSON(): object }[]) => rows.map((row) => row.toJSON());

describe('Workshop operational alerts and settings (unithor_test only)', () => {
  const actors = {} as Record<Actor, User>;
  const users: User[] = [];
  const orderIds: number[] = [];
  const quotationIds: number[] = [];
  let originalSettings: InferAttributes<WorkshopAlertSettings> | undefined;
  let capturedSettings = false;
  let sequence = 0;
  const cookies = (who: Actor) => [
    `access_token=${signAccessToken({ sub: actors[who].id, role: roles[who] })}`,
    `csrf_token=${csrf}`,
  ];
  const perOrderPath = (f: Fixture) => `/api/work-orders/${f.order.id}/alerts`;
  const get = (path: string, who: Actor = 'chief') => request(app).get(path).set('Cookie', cookies(who));
  const patch = (body: object, who: Actor = 'admin') => request(app).patch(settingsPath).set('Cookie', cookies(who)).set('X-CSRF-Token', csrf).send(body);
  const summary = async (path: string, who: Actor = 'chief'): Promise<WorkshopAlertSummary> => {
    const result = await get(path, who).query(path === globalPath ? { fecha: day } : {});
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.summary).toBeDefined();
    return result.body.summary as WorkshopAlertSummary;
  };

  beforeAll(async () => {
    if (sequelize.getDatabaseName() !== 'unithor_test') throw new Error('Alert tests require unithor_test');
    originalSettings = (await WorkshopAlertSettings.findByPk(1))?.toJSON();
    capturedSettings = true;
    for (const who of Object.keys(roles) as Actor[]) {
      const role = await Role.findOne({ where: { nombre: roles[who] } });
      if (!role) throw new Error(`Missing test role: ${roles[who]}`);
      const user = await User.create({ nombre: `Alert ${who}`, username: `alert_${who}_${tag}`, email: `alert-${who}-${runId}@example.com`,
        passwordHash: 'unused-signed-token-fixture', roleId: role.id, activo: true, salesAccessAll: false });
      actors[who] = user; users.push(user);
    }
  }, 30000);
  beforeEach(async () => {
    // Each case starts with the documented absent-row defaults. Preserve the
    // pre-suite singleton in afterAll, including its original attribution.
    if (sequelize.getDatabaseName() !== 'unithor_test') throw new Error('Alert fixtures require unithor_test');
    await WorkshopAlertSettings.destroy({ where: { id: 1 } });
  });
  afterAll(async () => {
    if (sequelize.getDatabaseName() !== 'unithor_test') return;
    if (capturedSettings) {
      await WorkshopAlertSettings.destroy({ where: { id: 1 } });
      if (originalSettings) await WorkshopAlertSettings.create(originalSettings);
    }
    if (orderIds.length) {
      await Notification.destroy({ where: { workOrderId: orderIds } });
      await CustomerEmail.destroy({ where: { kind: 'work_order', entityId: orderIds } });
    }
    if (quotationIds.length) await Quotation.destroy({ where: { id: quotationIds }, force: true });
    if (orderIds.length) await WorkOrder.destroy({ where: { id: orderIds }, force: true });
    if (users.length) {
      const ids = users.map((user) => user.id);
      await Notification.destroy({ where: { userId: ids } });
      await User.destroy({ where: { id: ids }, force: true });
    }
  }, 30000);

  const create = async (input: { state?: WorkOrderStatus; execution?: ItemOperationalStatus; quality?: 'pendiente' | 'aprobado' | 'rechazado'; actual?: number; deliveryDate?: Date } = {}): Promise<Fixture> => {
    const order = await WorkOrder.create({ codigo: `OT-AL-${tag}-${++sequence}`, estado: input.state ?? 'en_progreso', createdBy: actors.developer.id,
      fechaIngreso: new Date(`${day}T10:00:00Z`), fechaEntrega: input.deliveryDate ?? null });
    orderIds.push(order.id);
    const item = await WorkOrderItem.create({ workOrderId: order.id, catalogItemId: null, descripcion: `Alert service ${tag} ${sequence}`, tipoLinea: 'estandar', unidadMedida: 'servicio',
      cantidad: 1, precioUnitario: 10000, subtotal: 10000, horasHombreEstimadas: 1, horasHombreReales: input.actual ?? 0,
      estadoOperativo: input.execution ?? 'pendiente', qualityStatus: input.quality ?? 'pendiente' });
    return { order, item };
  };
  const team = async (f: Fixture, who: Actor = 'mechanic', saleHourly = 10000) => {
    await f.item.update({ teamManaged: true, assignedUserId: actors[who].id });
    return WorkOrderItemAssignment.create({ workOrderId: f.order.id, workOrderItemId: f.item.id, userId: actors[who].id, userName: actors[who].nombre,
      active: true, estimatedHours: 1, originalEstimatedHours: 1, costHourly: 7317.42, saleHourly, createdBy: actors.chief.id });
  };
  const recorded = (f: Fixture, assignment: WorkOrderItemAssignment, minutes = 180) => WorkOrderItemSession.create({
    workOrderId: f.order.id, workOrderItemId: f.item.id, assignmentId: assignment.id, userId: assignment.userId, userName: assignment.userName,
    kind: 'cronometro', status: 'cerrada', startedAt: new Date(`${day}T10:00:00Z`), endedAt: new Date(new Date(`${day}T10:00:00Z`).getTime() + minutes * 60000),
    durationMinutes: minutes, closeReason: 'pausa', createdBy: assignment.userId,
  });
  const quote = async (f: Fixture) => {
    const quotation = await Quotation.create({ codigo: `COT-AL-${tag}-${++sequence}`, workOrderId: f.order.id, subtotal: 10000, total: 10000, asesorId: actors.admin.id });
    quotationIds.push(quotation.id);
    await QuotationItem.create({ quotationId: quotation.id, workOrderItemId: f.item.id, catalogItemId: null, descripcion: f.item.descripcion,
      tipoLinea: 'estandar', unidadMedida: 'servicio', cantidad: 1, precioUnitario: 10000, subtotal: 10000 });
    return quotation;
  };
  const snapshot = async () => {
    const rows = await Promise.all([
      WorkOrder.findAll({ where: { id: orderIds }, order: [['id', 'ASC']] }),
      WorkOrderItem.findAll({ where: { workOrderId: orderIds }, order: [['id', 'ASC']] }),
      WorkOrderItemAssignment.findAll({ where: { workOrderId: orderIds }, order: [['id', 'ASC']] }),
      WorkOrderItemSession.findAll({ where: { workOrderId: orderIds }, order: [['id', 'ASC']] }),
      Quotation.findAll({ where: { id: quotationIds }, order: [['id', 'ASC']] }),
      QuotationItem.findAll({ where: { quotationId: quotationIds }, order: [['id', 'ASC']] }),
      WorkOrderEvent.findAll({ where: { workOrderId: orderIds }, order: [['id', 'ASC']] }),
      Notification.findAll({ where: { workOrderId: orderIds }, order: [['id', 'ASC']] }),
      CustomerEmail.findAll({ where: { kind: 'work_order', entityId: orderIds }, order: [['id', 'ASC']] }),
      WorkshopAlertSettings.findAll({ order: [['id', 'ASC']] }),
    ]);
    return rows.map(plain);
  };

  it('requires authentication for global/per-OT alerts and settings reads and writes', async () => {
    const f = await create();
    for (const target of [globalPath, perOrderPath(f), settingsPath]) expect((await request(app).get(target)).status).toBe(401);
    const result = await request(app).patch(settingsPath).set('Cookie', `csrf_token=${csrf}`).set('X-CSRF-Token', csrf).send({ timeTolerancePercent: 10 });
    expect(result.status).toBe(401);
  });

  it('returns global and per-OT summaries to chiefs, admins and developers', async () => {
    const f = await create({ execution: 'completado' });
    for (const who of ['chief', 'admin', 'developer'] as const) {
      for (const target of [globalPath, perOrderPath(f)]) {
        const data = await summary(target, who);
        expect(data.alerts).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'quality_pending', workOrderId: f.order.id, itemId: f.item.id })]));
        expect(Number.isFinite(Date.parse(data.generatedAt))).toBe(true);
      }
    }
  });

  it('denies seller, finance and warehouse access, including seller-owned OTs', async () => {
    const f = await create(); await f.order.update({ createdBy: actors.seller.id });
    for (const who of ['seller', 'finance', 'warehouse'] as const) {
      for (const target of [globalPath, perOrderPath(f), settingsPath]) {
        const result = await get(target, who);
        expect(result.status).toBe(403);
        expect(result.body).not.toHaveProperty('summary');
      }
    }
  });

  it('returns zero tolerances without materializing the settings singleton during GET', async () => {
    const before = await WorkshopAlertSettings.count();
    const result = await get(settingsPath, 'admin');
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.settings).toEqual({ id: 1, timeTolerancePercent: 0, commercialTolerancePercent: 0, updatedBy: null, updatedAt: null });
    expect((await summary(globalPath)).settings).toEqual({ timeTolerancePercent: 0, commercialTolerancePercent: 0 });
    expect(await WorkshopAlertSettings.count()).toBe(before);
  });

  it('persists partial tolerance updates with admin/developer attribution and accepts the inclusive upper bound', async () => {
    const first = await patch({ timeTolerancePercent: 12.5, commercialTolerancePercent: 35 });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.settings).toMatchObject({ id: 1, timeTolerancePercent: 12.5, commercialTolerancePercent: 35, updatedBy: actors.admin.id });
    expect(Number.isFinite(Date.parse(first.body.settings.updatedAt))).toBe(true);
    const second = await patch({ commercialTolerancePercent: 25 }, 'developer');
    expect(second.status).toBe(200);
    expect(second.body.settings).toMatchObject({ timeTolerancePercent: 12.5, commercialTolerancePercent: 25, updatedBy: actors.developer.id });
    const persisted = await WorkshopAlertSettings.findByPk(1);
    expect(Number(persisted!.timeTolerancePercent)).toBe(12.5);
    expect(Number(persisted!.commercialTolerancePercent)).toBe(25);
    expect(persisted!.updatedBy).toBe(actors.developer.id);
    const boundary = await patch({ timeTolerancePercent: 1000 }, 'admin');
    expect(boundary.status).toBe(200);
    expect((await get(settingsPath, 'developer')).body.settings).toMatchObject({ timeTolerancePercent: 1000, commercialTolerancePercent: 25, updatedBy: actors.admin.id });
  });

  it('reserves settings mutations for administration even when a mechanic or chief has workshop update permission', async () => {
    for (const who of ['chief', 'mechanic', 'seller', 'finance', 'warehouse'] as const) {
      expect((await patch({ timeTolerancePercent: 10 }, who)).status).toBe(403);
    }
    expect(await WorkshopAlertSettings.count()).toBe(0);
  });

  it('blocks missing and mismatched CSRF on otherwise-valid settings writes', async () => {
    for (const token of [undefined, 'wrong-alert-csrf']) {
      const call = request(app).patch(settingsPath).set('Cookie', cookies('admin'));
      if (token) call.set('X-CSRF-Token', token);
      const result = await call.send({ timeTolerancePercent: 10 });
      expect(result.status).toBe(403);
      expect(result.body.error.code).toBe('CSRF_INVALID');
    }
    expect(await WorkshopAlertSettings.count()).toBe(0);
  });

  it('rejects negative, excessive, nonnumeric, empty and unknown settings inputs without creating a row', async () => {
    for (const body of [{ timeTolerancePercent: -1 }, { commercialTolerancePercent: -1 }, { timeTolerancePercent: 1000.01 },
      { commercialTolerancePercent: 1001 }, { timeTolerancePercent: '10' }, {}, { timeTolerancePercent: 5, updatedBy: actors.chief.id }]) {
      const result = await patch(body);
      expect(result.status, JSON.stringify(result.body)).toBe(400);
    }
    expect(await WorkshopAlertSettings.count()).toBe(0);
  });

  it('reports pending/rejected service QA, waiting parts and overdue delivery without individual part QA or duplicate alerts', async () => {
    const f = await create({ state: 'esperando_repuesto', execution: 'completado', deliveryDate: new Date(`${day}T12:00:00Z`) });
    const rejected = await WorkOrderItem.create({ workOrderId: f.order.id, catalogItemId: null, descripcion: 'Rejected correction', estadoOperativo: 'pendiente', qualityStatus: 'rechazado', precioUnitario: 10000 });
    const part = await WorkOrderItem.create({ workOrderId: f.order.id, catalogItemId: null, descripcion: 'Waiting replacement part', tipoLinea: 'parte', estadoOperativo: 'completado' });
    const data = await summary(perOrderPath(f));
    expect(data.alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'quality_pending', itemId: f.item.id }),
      expect.objectContaining({ kind: 'quality_rejected', itemId: rejected.id }),
      expect.objectContaining({ kind: 'waiting_parts', workOrderId: f.order.id }),
      expect.objectContaining({ kind: 'delivery_overdue', workOrderId: f.order.id }),
    ]));
    expect(data.alerts.some((alert) => alert.kind === 'quality_pending' && alert.itemId === part.id)).toBe(false);
    expect(new Set(data.alerts.map((alert) => alert.id)).size).toBe(data.alerts.length);
    expect(data.counts).toEqual({ total: data.alerts.length, high: data.alerts.filter((alert) => alert.priority === 'high').length });
  });

  it('suppresses a three-hour/one-hour time overrun and commercial difference at their configured tolerance without changing prices or hours', async () => {
    const f = await create({ actual: 3 }); const assigned = await team(f); await recorded(f, assigned); const cot = await quote(f);
    const before = await summary(perOrderPath(f));
    for (const kind of ['time_deviation', 'commercial_difference']) expect(before.alerts).toEqual(expect.arrayContaining([expect.objectContaining({ kind, itemId: f.item.id })]));
    expect((await patch({ timeTolerancePercent: 200, commercialTolerancePercent: 200 })).status).toBe(200);
    const after = await summary(perOrderPath(f));
    expect(after.settings).toEqual({ timeTolerancePercent: 200, commercialTolerancePercent: 200 });
    expect(after.alerts.some((alert) => alert.itemId === f.item.id && ['time_deviation', 'commercial_difference'].includes(alert.kind))).toBe(false);
    expect(Number((await f.item.reload()).horasHombreReales)).toBe(3);
    expect(Number(f.item.precioUnitario)).toBe(10000);
    expect(Number((await cot.reload()).total)).toBe(10000);
    expect((await assigned.reload()).active).toBe(true);
  });

  it('scopes mechanic global/per-OT alerts to their active service and user without prices, private rates or other workers', async () => {
    const own = await create({ execution: 'completado' }); const mine = await team(own); await recorded(own, mine);
    const otherItem = await WorkOrderItem.create({ workOrderId: own.order.id, catalogItemId: null, descripcion: `Other worker private service ${tag}`, estadoOperativo: 'completado', qualityStatus: 'rechazado', horasHombreEstimadas: 1, precioUnitario: 98765 });
    const other = { order: own.order, item: otherItem }; const theirs = await team(other, 'teammate'); await recorded(other, theirs);
    const foreign = await create({ execution: 'completado' }); await team(foreign, 'teammate');
    await quote(own);
    const allowedItems = new Set((await WorkOrderItemAssignment.findAll({ where: { userId: actors.mechanic.id, active: true }, attributes: ['workOrderItemId'] })).map((row) => row.workOrderItemId));
    for (const target of [globalPath, perOrderPath(own)]) {
      const data = await summary(target, 'mechanic');
      expect(data.alerts).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'time_deviation', itemId: own.item.id, userId: actors.mechanic.id })]));
      expect(data.alerts.every((alert) => alert.itemId === null || (target === globalPath ? allowedItems.has(alert.itemId) : alert.itemId === own.item.id))).toBe(true);
      expect(data.alerts.every((alert) => alert.userId === null || alert.userId === actors.mechanic.id)).toBe(true);
      expect(data.alerts.some((alert) => alert.workOrderId === foreign.order.id)).toBe(false);
      expect(data.alerts.some((alert) => ['commercial_difference', 'valuation_pending', 'price_review_pending'].includes(alert.kind))).toBe(false);
      const serialized = JSON.stringify(data);
      expect(serialized).not.toMatch(/precioUnitario|netUnitPrice|costHourly|saleHourly|passwordHash|7317[.,]42|98765|CLP/);
      expect(serialized).not.toContain(otherItem.descripcion);
      expect(serialized).not.toContain(actors.teammate.nombre);
      expect(serialized).not.toContain(actors.teammate.email);
    }
  });

  it('revokes per-OT mechanic access immediately when the current team is inactive despite a legacy OT assignment', async () => {
    const f = await create({ execution: 'completado' }); const assigned = await team(f);
    await f.order.update({ assignedMechanicId: actors.mechanic.id });
    expect((await get(perOrderPath(f), 'mechanic')).status).toBe(200);
    await assigned.update({ active: false });
    expect((await get(perOrderPath(f), 'mechanic')).status).toBe(404);
    expect((await summary(globalPath, 'mechanic')).alerts.some((alert) => alert.workOrderId === f.order.id)).toBe(false);
  });

  it('keeps alert GETs read-only, including settings defaults, expired open timers and audit/mail rows', async () => {
    const f = await create(); const assigned = await team(f);
    const timer = await WorkOrderItemSession.create({ workOrderId: f.order.id, workOrderItemId: f.item.id, assignmentId: assigned.id, userId: actors.mechanic.id, userName: actors.mechanic.nombre,
      kind: 'cronometro', status: 'abierta', startedAt: new Date(`${day}T10:00:00Z`), scheduledEndAt: new Date(`${day}T12:00:00Z`), endedAt: null, durationMinutes: null, closeReason: null, createdBy: actors.mechanic.id });
    const before = await snapshot();
    await summary(globalPath); await summary(perOrderPath(f));
    expect((await get(settingsPath, 'admin')).status).toBe(200);
    expect(await snapshot()).toEqual(before);
    expect((await timer.reload()).status).toBe('abierta');
    expect(timer.endedAt).toBeNull();
    expect(timer.durationMinutes).toBeNull();
  });

  it('validates global dates as calendar ISO dates', async () => {
    for (const fecha of ['tomorrow', '04/03/2002', '2002-02-30', '2002-03-04T00:00:00Z']) {
      const result = await get(globalPath).query({ fecha });
      expect(result.status).toBe(400);
      expect(result.body).not.toHaveProperty('summary');
    }
    expect((await get(globalPath).query({ fecha: day })).status).toBe(200);
  });

  it('preserves admin/developer authorization with no permission-matrix rows', async () => {
    const f = await create();
    for (const who of ['admin', 'developer'] as const) {
      const roleId = actors[who].roleId;
      const grants = (await RolePermission.findAll({ where: { roleId } })).map((row) => ({ roleId, permissionId: row.permissionId }));
      try {
        await RolePermission.destroy({ where: { roleId } }); invalidatePermissionCache(roleId);
        await summary(globalPath, who); await summary(perOrderPath(f), who);
        expect((await get(settingsPath, who)).status).toBe(200);
        expect((await patch({ timeTolerancePercent: 10 }, who)).status).toBe(200);
      } finally {
        if (grants.length) await RolePermission.bulkCreate(grants, { ignoreDuplicates: true });
        invalidatePermissionCache(roleId);
      }
    }
  });
});
