import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { CatalogItem } from '../../models/CatalogItem.js';
import { Client } from '../../models/Client.js';
import { CustomerEmail } from '../../models/CustomerEmail.js';
import { Notification } from '../../models/Notification.js';
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
import { invalidatePermissionCache } from '../../services/permission.service.js';
import { hashPassword } from '../../utils/password.js';

import type { CatalogType, ItemOperationalStatus, UnitMeasure, WorkOrderStatus, WorkshopServiceHistory } from '@unithor/shared';

const runId = randomUUID();
const tag = runId.replaceAll('-', '').slice(0, 12);
const password = 'HistoryPhase4Tests2026!';
const roles = { developer: 'desarrollador', admin: 'admin', chief: 'jefe', mechanic: 'mecanico', seller: 'vendedor', finance: 'finanzas', warehouse: 'bodeguero' } as const;
type Actor = keyof typeof roles;
interface Auth { user: User; cookies: string[] }
interface Sample { order: WorkOrder; item: WorkOrderItem }
interface Context { current: Sample; catalogId: number | null; description: string }
interface SampleInput {
  catalogId: number | null; description: string; type?: CatalogType; unit?: UnitMeasure;
  quantity?: number; estimate?: number | null; actual?: number | null; price?: number;
  state?: WorkOrderStatus; execution?: ItemOperationalStatus; date?: Date; vehicleId?: number | null; approved?: boolean;
}
const plain = (rows: { toJSON(): object }[]) => rows.map((row) => row.toJSON());

describe('Phase 4 workshop service history (unithor_test only)', () => {
  const actors = {} as Record<Actor, Auth>;
  const users: User[] = [];
  const orderIds: number[] = [];
  const quotationIds: number[] = [];
  const catalogIds: number[] = [];
  const vehicles: Vehicle[] = [];
  const temporaryGrants: { roleId: number; permissionId: number }[] = [];
  let client: Client | undefined;
  let readPermission: Permission;
  let sequence = 0;
  const path = (sample: Sample) => `/api/work-orders/${sample.order.id}/items/${sample.item.id}/history`;
  const get = (sample: Sample, query: Record<string, string | number | boolean> = {}, who: Actor = 'chief') =>
    request(app).get(path(sample)).set('Cookie', actors[who].cookies).query(query);
  const history = async (sample: Sample, query: Record<string, string | number | boolean> = {}, who: Actor = 'chief'): Promise<WorkshopServiceHistory> => {
    const result = await get(sample, query, who);
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    return result.body.history as WorkshopServiceHistory;
  };

  beforeAll(async () => {
    if (sequelize.getDatabaseName() !== 'unithor_test') throw new Error('History tests require unithor_test');
    const permission = await Permission.findOne({ where: { modulo: 'taller', accion: 'read' } });
    if (!permission) throw new Error('Missing taller:read permission');
    readPermission = permission;
    const passwordHash = await hashPassword(password);
    for (const who of Object.keys(roles) as Actor[]) {
      const role = await Role.findOne({ where: { nombre: roles[who] } });
      if (!role) throw new Error(`Missing role: ${roles[who]}`);
      const user = await User.create({ nombre: `History ${who}`, username: `h4_${who}_${tag}`, email: `history-${who}-${runId}@example.com`, passwordHash, roleId: role.id, activo: true, salesAccessAll: false });
      users.push(user);
      const login = await request(app).post('/api/auth/login').send({ email: user.email, password });
      expect(login.status, JSON.stringify(login.body)).toBe(200);
      const raw: unknown = login.headers['set-cookie'];
      actors[who] = { user, cookies: (Array.isArray(raw) ? raw as string[] : []).map((cookie) => cookie.split(';')[0]) };
    }
    client = await Client.create({ nombre: `Private history client ${runId}`, tipo: 'cliente', email: `private-history-${runId}@example.com`, notas: 'Private customer notes' });
    for (const suffix of ['A', 'B']) vehicles.push(await Vehicle.create({ patente: `H${tag.slice(0, 6)}${suffix}`.toUpperCase(), marca: 'History make', modelo: `History model ${suffix}`, clientId: client.id }));
  }, 30000);

  afterAll(async () => {
    if (sequelize.getDatabaseName() !== 'unithor_test') return;
    for (const grant of temporaryGrants) {
      await RolePermission.destroy({ where: grant });
      invalidatePermissionCache(grant.roleId);
    }
    if (orderIds.length) {
      await Notification.destroy({ where: { workOrderId: orderIds } });
      await CustomerEmail.destroy({ where: { kind: 'work_order', entityId: orderIds } });
    }
    if (quotationIds.length) await Quotation.destroy({ where: { id: quotationIds }, force: true });
    if (orderIds.length) await WorkOrder.destroy({ where: { id: orderIds }, force: true });
    if (catalogIds.length) await CatalogItem.destroy({ where: { id: catalogIds }, force: true });
    if (vehicles.length) await Vehicle.destroy({ where: { id: vehicles.map((vehicle) => vehicle.id) }, force: true });
    if (client) await client.destroy({ force: true });
    if (users.length) {
      const ids = users.map((user) => user.id);
      await Notification.destroy({ where: { userId: ids } });
      await RefreshToken.destroy({ where: { userId: ids } });
      await User.destroy({ where: { id: ids }, force: true });
    }
  }, 30000);

  // Manual fixtures avoid unrelated mail, payment, clock and delivery workflows.
  const sample = async (input: SampleInput): Promise<Sample> => {
    const approved = input.approved ?? false;
    const order = await WorkOrder.create({ codigo: `OT-H4-${tag}-${++sequence}`, clientId: client!.id,
      vehicleId: input.vehicleId === undefined ? vehicles[0].id : input.vehicleId,
      estado: input.state ?? 'finalizada', fechaIngreso: input.date ?? new Date('2020-04-15T12:00:00Z'),
      createdBy: actors.developer.user.id, descripcion: 'Private order description',
      qualityApprovedAt: approved ? new Date('2020-04-16T12:00:00Z') : null,
      qualityApprovedBy: approved ? actors.chief.user.id : null,
    });
    orderIds.push(order.id);
    const quantity = input.quantity ?? 1; const price = input.price ?? 10000;
    const item = await WorkOrderItem.create({ workOrderId: order.id, catalogItemId: input.catalogId, descripcion: input.description,
      tipoLinea: input.type ?? 'estandar', unidadMedida: input.unit ?? 'servicio', cantidad: quantity,
      precioUnitario: price, subtotal: quantity * price, estadoOperativo: input.execution ?? 'completado',
      horasHombreEstimadas: input.estimate ?? null, horasHombreReales: input.actual ?? null,
      qualityStatus: approved ? 'aprobado' : 'pendiente', qualityReviewedBy: approved ? actors.chief.user.id : null,
      qualityReviewedAt: approved ? new Date('2020-04-16T11:00:00Z') : null,
    });
    return { order, item };
  };
  const context = async (free = false): Promise<Context> => {
    const description = `Revision de frenos ${tag} ${++sequence}`;
    const catalog = free ? null : await CatalogItem.create({ nombre: description, tipo: 'estandar', unidadMedida: 'servicio', precio: 99000 });
    if (catalog) catalogIds.push(catalog.id);
    const catalogId = catalog?.id ?? null;
    return { catalogId, description, current: await sample({ catalogId, description, state: 'en_progreso', execution: 'pendiente' }) };
  };
  const previous = (ctx: Context, input: Partial<SampleInput> = {}) => sample({ catalogId: ctx.catalogId, description: ctx.description, ...input });
  const mirror = async (entry: Sample, lineInputs: { linked?: boolean; price?: number; quantity?: number; discount?: number }[] = [{}], globalDiscount = 0) => {
    const quotation = await Quotation.create({ codigo: `COT-H4-${tag}-${++sequence}`, workOrderId: entry.order.id, clientId: client!.id, asesorId: actors.developer.user.id,
      subtotal: 0, total: 0, descuentoTipo: globalDiscount ? 'fijo' : null, descuentoValor: globalDiscount });
    quotationIds.push(quotation.id);
    const lines = await QuotationItem.bulkCreate(lineInputs.map((input) => ({ quotationId: quotation.id,
      workOrderItemId: input.linked === false ? null : entry.item.id, catalogItemId: entry.item.catalogItemId,
      descripcion: entry.item.descripcion, tipoLinea: entry.item.tipoLinea, unidadMedida: entry.item.unidadMedida,
      cantidad: input.quantity ?? Number(entry.item.cantidad), precioUnitario: input.price ?? 10000,
      subtotal: (input.quantity ?? Number(entry.item.cantidad)) * (input.price ?? 10000) - (input.discount ?? 0),
      descuentoTipo: input.discount ? 'fijo' : null, descuentoValor: input.discount ?? 0,
      estadoOperativo: 'completado',
    })));
    await quotation.update({ subtotal: lines.reduce((sum, line) => sum + Number(line.cantidad) * Number(line.precioUnitario), 0), total: lines.reduce((sum, line) => sum + Number(line.subtotal), 0) - globalDiscount });
    return { quotation, lines };
  };
  const assignment = (entry: Sample, input: { hours: number | null; active?: boolean; who?: Actor }) => {
    const user = actors[input.who ?? 'mechanic'].user;
    return WorkOrderItemAssignment.create({ workOrderId: entry.order.id, workOrderItemId: entry.item.id, userId: user.id, userName: user.nombre,
      active: input.active ?? true, estimatedHours: input.hours, originalEstimatedHours: input.hours,
      costHourly: 7317.42, saleHourly: 9321.57, createdBy: actors.chief.user.id });
  };
  const session = (entry: Sample, input: Partial<Pick<WorkOrderItemSession, 'kind' | 'status' | 'startedAt' | 'endedAt' | 'durationMinutes' | 'closeReason' | 'scheduledEndAt' | 'supersededAt'>> = {}) => WorkOrderItemSession.create({
    workOrderId: entry.order.id, workOrderItemId: entry.item.id, userId: actors.mechanic.user.id, userName: actors.mechanic.user.nombre,
    kind: 'cronometro', status: 'cerrada', startedAt: new Date('2020-04-15T10:00:00Z'), endedAt: new Date('2020-04-15T11:30:00Z'),
    durationMinutes: 90, closeReason: 'completado', createdBy: actors.mechanic.user.id, ...input,
  });

  it('allows only authenticated supervisors with workshop read access, including for seller-owned OTs', async () => {
    const ctx = await context(); await previous(ctx);
    await ctx.current.order.update({ createdBy: actors.seller.user.id, assignedMechanicId: actors.mechanic.user.id });
    await ctx.current.item.update({ assignedUserId: actors.mechanic.user.id });
    expect((await request(app).get(path(ctx.current))).status).toBe(401);
    for (const who of ['developer', 'admin', 'chief'] as const) {
      const data = await history(ctx.current, {}, who);
      expect(data).toMatchObject({ workOrderId: ctx.current.order.id, itemId: ctx.current.item.id, page: 1, pageSize: 10, total: 1 });
    }
    for (const who of ['mechanic', 'seller', 'finance', 'warehouse'] as const) {
      const where = { roleId: actors[who].user.roleId, permissionId: readPermission.id };
      const [, created] = await RolePermission.findOrCreate({ where, defaults: where });
      if (created) temporaryGrants.push(where);
      invalidatePermissionCache(where.roleId);
      const result = await get(ctx.current, {}, who);
      expect(result.status).toBe(403);
      expect(result.body).not.toHaveProperty('history');
    }
  });

  it('checks the current database role and the chief taller:read grant rather than trusting login-time authorization', async () => {
    const ctx = await context();
    const originalRole = actors.admin.user.roleId;
    try {
      await actors.admin.user.update({ roleId: actors.mechanic.user.roleId });
      expect((await get(ctx.current, {}, 'admin')).status).toBe(403);
    } finally { await actors.admin.user.update({ roleId: originalRole }); }
    const where = { roleId: actors.chief.user.roleId, permissionId: readPermission.id };
    const grant = await RolePermission.findOne({ where });
    expect(grant).not.toBeNull();
    try {
      await RolePermission.destroy({ where }); invalidatePermissionCache(where.roleId);
      expect((await get(ctx.current)).status).toBe(403);
    } finally {
      if (grant) await RolePermission.findOrCreate({ where, defaults: where });
      invalidatePermissionCache(where.roleId);
    }
  });

  it('requires an existing active current OT and its own service item, rejecting parts', async () => {
    const ctx = await context(); const foreign = await previous(ctx);
    const wrongItem = await request(app).get(`/api/work-orders/${ctx.current.order.id}/items/${foreign.item.id}/history`).set('Cookie', actors.chief.cookies);
    expect(wrongItem.status).toBe(404);
    await ctx.current.item.update({ tipoLinea: 'parte' });
    expect((await get(ctx.current)).status).toBe(400);
    await ctx.current.order.destroy();
    expect((await get(ctx.current)).status).toBe(404);
  });

  it('matches catalog identity, type and unit even after a historical description changes', async () => {
    const ctx = await context();
    const matching = await previous(ctx, { description: 'Old catalog description', quantity: 2, actual: 4 });
    await previous(ctx, { catalogId: null });
    await previous(ctx, { type: 'especifico' });
    await previous(ctx, { unit: 'unidad' });
    const data = await history(ctx.current);
    expect(data.matchMode).toBe('catalog');
    expect(data.service).toEqual({ description: ctx.description, catalogItemId: ctx.catalogId, unit: 'servicio', quantity: 1 });
    expect(data.items.map((row) => row.itemId)).toEqual([matching.item.id]);
  });

  it('matches free descriptions by exact lowercase/trim without collapsing internal spaces or accepting substrings', async () => {
    const ctx = await context(true);
    await ctx.current.item.update({ descripcion: `  ${ctx.description.toUpperCase()}  ` });
    const matching = await previous(ctx, { description: ` ${ctx.description.toLowerCase()} ` });
    await previous(ctx, { description: ctx.description.replace(' de ', '  de ') });
    await previous(ctx, { description: `${ctx.description} adicional` });
    await previous(ctx, { description: `Extra ${ctx.description}` });
    await previous(ctx, { type: 'especifico' });
    await previous(ctx, { unit: 'unidad' });
    const data = await history(ctx.current);
    expect(data.matchMode).toBe('description');
    expect(data.items.map((row) => row.itemId)).toEqual([matching.item.id]);
  });

  it('excludes current, cancelled, unfinished, omitted, deleted and future records but includes ordinary completed legacy work', async () => {
    const ctx = await context();
    await ctx.current.order.update({ estado: 'finalizada' }); await ctx.current.item.update({ estadoOperativo: 'completado' });
    const legacy = await previous(ctx); const approved = await previous(ctx, { state: 'entregada', approved: true });
    for (const state of ['cancelada', 'en_progreso', 'esperando_repuesto'] as const) await previous(ctx, { state });
    for (const execution of ['omitido', 'pendiente', 'en_proceso'] as const) await previous(ctx, { execution });
    const deleted = await previous(ctx); await deleted.order.destroy();
    await previous(ctx, { date: new Date(Date.now() + 86400000) });
    const futureCreation = await previous(ctx);
    const futureCreatedAt = new Date(Math.floor(Date.now() / 1000) * 1000 + 86400000);
    await sequelize.getQueryInterface().bulkUpdate('work_orders', { created_at: futureCreatedAt }, { id: futureCreation.order.id });
    expect((await futureCreation.order.reload()).createdAt.getTime()).toBe(futureCreatedAt.getTime());
    const data = await history(ctx.current);
    expect(data.total).toBe(2);
    expect(data.items.map((row) => row.itemId).sort()).toEqual([legacy.item.id, approved.item.id].sort());
    expect(data.items.find((row) => row.itemId === legacy.item.id)!.qualityApproved).toBe(false);
    expect(data.items.find((row) => row.itemId === approved.item.id)!.qualityApproved).toBe(true);
  });

  it('filters by the actual current vehicle only when requested and represents absent historical vehicles as null', async () => {
    const ctx = await context(); const own = await previous(ctx); await previous(ctx, { vehicleId: vehicles[1].id });
    const absent = await previous(ctx, { vehicleId: null });
    const all = await history(ctx.current, { sameVehicle: false });
    expect(all.total).toBe(3);
    expect(all.items.find((row) => row.itemId === absent.item.id)!.vehicle).toBeNull();
    const same = await history(ctx.current, { sameVehicle: true });
    expect(same.items.map((row) => row.itemId)).toEqual([own.item.id]);
    await ctx.current.order.update({ vehicleId: null });
    const missing = await history(ctx.current, { sameVehicle: true });
    expect(missing).toMatchObject({ items: [], total: 0, reference: { samples: 0 } });
    expect(missing.notes.join(' ')).toMatch(/vehículo|vehiculo/i);
    expect((await history(ctx.current, { sameVehicle: false })).total).toBe(3);
  });

  it('filters by OT admission dates, OT code and vehicle plate, independently of the current OT date', async () => {
    const ctx = await context();
    const first = await previous(ctx, { date: new Date('2020-05-10T12:00:00Z') });
    const second = await previous(ctx, { date: new Date('2020-05-20T12:00:00Z'), vehicleId: vehicles[1].id });
    await previous(ctx, { date: new Date('2020-05-30T12:00:00Z') });
    const dated = await history(ctx.current, { fechaDesde: '2020-05-10', fechaHasta: '2020-05-20' });
    expect(dated.items.map((row) => row.itemId).sort()).toEqual([first.item.id, second.item.id].sort());
    expect((await history(ctx.current, { search: second.order.codigo })).items.map((row) => row.itemId)).toEqual([second.item.id]);
    expect((await history(ctx.current, { search: vehicles[1].patente })).items.map((row) => row.itemId)).toEqual([second.item.id]);
    expect((await history(ctx.current, { fechaDesde: '2020-05-10', fechaHasta: '2020-05-20', search: vehicles[0].patente })).items.map((row) => row.itemId)).toEqual([first.item.id]);
  });

  it('paginates without duplicates and calculates references from the filtered page, including empty pages', async () => {
    const ctx = await context();
    const newest = await previous(ctx, { date: new Date('2020-04-03T12:00:00Z'), actual: 2, price: 100 });
    const middle = await previous(ctx, { date: new Date('2020-04-02T12:00:00Z'), actual: 6, price: 300 });
    const oldest = await previous(ctx, { date: new Date('2020-04-01T12:00:00Z'), actual: 10, price: 500 });
    const first = await history(ctx.current, { pageSize: 2 });
    expect(first).toMatchObject({ page: 1, pageSize: 2, total: 3, totalPages: 2,
      reference: { samples: 2, hourSamples: 2, priceSamples: 2, averageHoursPerUnit: 4, averageNetUnitPrice: 200 } });
    expect(first.items.map((row) => row.itemId)).toEqual([newest.item.id, middle.item.id]);
    const second = await history(ctx.current, { page: 2, pageSize: 2 });
    expect(second.items.map((row) => row.itemId)).toEqual([oldest.item.id]);
    expect(second.reference).toMatchObject({ samples: 1, averageHoursPerUnit: 10, averageNetUnitPrice: 500 });
    expect(second.notes.join(' ')).toMatch(/página|pagina|page/i);
    const empty = await history(ctx.current, { page: 3, pageSize: 2 });
    expect(empty).toMatchObject({ items: [], total: 3, totalPages: 2,
      reference: { samples: 0, hourSamples: 0, priceSamples: 0, averageHoursPerUnit: null, averageNetUnitPrice: null } });
    expect((await history(ctx.current, { pageSize: 30 })).items).toHaveLength(3);
  });

  it('rejects invalid pagination, non-ISO or reversed dates, invalid booleans, long search and unknown query fields', async () => {
    const ctx = await context();
    const queries: Record<string, string | number | boolean>[] = [
      { page: 0 }, { page: -1 }, { page: 1.5 }, { pageSize: 0 }, { pageSize: 31 },
      { fechaDesde: '10/05/2020' }, { fechaHasta: '2020-05-10T00:00:00Z' }, { fechaDesde: '2020-02-30' },
      { fechaDesde: '2020-05-20', fechaHasta: '2020-05-10' }, { sameVehicle: '1' }, { sameVehicle: 'TRUE' },
      { search: 'x'.repeat(81) }, { orderBy: 'price' },
    ];
    for (const query of queries) {
      const result = await get(ctx.current, query);
      expect(result.status, JSON.stringify({ query, body: result.body })).toBe(400);
      expect(result.body).not.toHaveProperty('history');
    }
  });

  it('sums canonical signed sessions, bounds open timers by schedule and sums only active team estimates once', async () => {
    const ctx = await context(); const entry = await previous(ctx, { quantity: 2, estimate: 50, actual: 99 });
    await entry.item.update({ teamManaged: true });
    await assignment(entry, { hours: 1.5 }); await assignment(entry, { hours: 2.5, who: 'chief' });
    await assignment(entry, { hours: 100, active: false, who: 'warehouse' });
    await session(entry);
    await session(entry, { kind: 'manual', durationMinutes: 60 });
    await session(entry, { kind: 'ajuste', durationMinutes: -30 });
    await session(entry, { status: 'abierta', durationMinutes: null, endedAt: null, closeReason: null,
      startedAt: new Date('2020-04-15T12:00:00Z'), scheduledEndAt: new Date('2020-04-15T13:00:00Z') });
    await session(entry, { durationMinutes: 600, supersededAt: new Date('2020-04-16T12:00:00Z') });
    const data = await history(ctx.current);
    expect(data.total).toBe(1);
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toMatchObject({ itemId: entry.item.id, quantity: 2, estimatedHours: 4, actualHours: 3, hoursPerUnit: 1.5 });
    expect(data.reference).toMatchObject({ samples: 1, hourSamples: 1, averageHoursPerUnit: 1.5 });
  });

  it('uses quantity-adjusted legacy estimates and actuals only without sessions, preserving unknown values as null', async () => {
    const ctx = await context();
    const legacy = await previous(ctx, { quantity: 4, estimate: 1.25, actual: 8 });
    const unknown = await previous(ctx, { estimate: null, actual: null });
    const unknownTeam = await previous(ctx, { estimate: 9, actual: null });
    await unknownTeam.item.update({ teamManaged: true });
    await assignment(unknownTeam, { hours: null });
    const data = await history(ctx.current);
    expect(data.items.find((row) => row.itemId === legacy.item.id)).toMatchObject({ estimatedHours: 5, actualHours: 8, hoursPerUnit: 2 });
    for (const id of [unknown.item.id, unknownTeam.item.id]) expect(data.items.find((row) => row.itemId === id)).toMatchObject({ estimatedHours: null, actualHours: null, hoursPerUnit: null });
    expect(data.reference).toMatchObject({ samples: 3, hourSamples: 1, averageHoursPerUnit: 2 });
  });

  it('does not resurrect legacy actuals when every recorded session has been superseded', async () => {
    const ctx = await context(); const entry = await previous(ctx, { actual: 77, quantity: 2 });
    await session(entry, { durationMinutes: 600, supersededAt: new Date('2020-04-16T12:00:00Z') });
    const data = await history(ctx.current);
    expect(data.items[0]).toMatchObject({ itemId: entry.item.id, actualHours: 0, hoursPerUnit: 0 });
    expect(data.reference).toMatchObject({ hourSamples: 1, averageHoursPerUnit: 0 });
  });

  it('uses the explicitly linked current COT price after line and proportional global discounts, excluding IVA and live tariffs', async () => {
    const ctx = await context(); const entry = await previous(ctx, { quantity: 2, price: 25000 });
    const other = await WorkOrderItem.create({ workOrderId: entry.order.id, catalogItemId: null, descripcion: 'Other commercial service', tipoLinea: 'especifico', unidadMedida: 'servicio', cantidad: 1, precioUnitario: 6000, subtotal: 6000, estadoOperativo: 'completado' });
    const cot = await mirror(entry, [{ price: 10000, quantity: 2, discount: 2000 }, { price: 6000, quantity: 1 }], 3000);
    await cot.lines[0].update({ descripcion: 'Renamed commercial line' });
    await cot.lines[1].update({ workOrderItemId: other.id, descripcion: other.descripcion, catalogItemId: null, tipoLinea: 'especifico' });
    const data = await history(ctx.current);
    expect(data.items).toHaveLength(1);
    // (20,000 - 2,000) * (21,000 / 24,000) / 2 = 7,875 net per unit.
    expect(data.items[0]).toMatchObject({ itemId: entry.item.id, netUnitPrice: 7875 });
    expect(data.reference).toMatchObject({ priceSamples: 1, averageNetUnitPrice: 7875 });
  });

  it('keeps ambiguous prices unknown and zero-price diagnoses out of averages, with OT fallback only without an active mirror', async () => {
    const ctx = await context();
    const ambiguous = await previous(ctx, { price: 50000 });
    await mirror(ambiguous, [{ linked: false, price: 12000 }, { linked: false, price: 18000 }]);
    const diagnosis = await previous(ctx, { price: 0 });
    const known = await previous(ctx, { price: 9000, actual: 4 });
    const deletedMirror = await previous(ctx, { price: 8000 });
    await (await mirror(deletedMirror, [{ price: 88000 }])).quotation.destroy();
    const data = await history(ctx.current);
    expect(data.items.find((row) => row.itemId === ambiguous.item.id)!.netUnitPrice).toBeNull();
    expect(data.items.find((row) => row.itemId === diagnosis.item.id)!.netUnitPrice).toBe(0);
    expect(data.items.find((row) => row.itemId === known.item.id)!.netUnitPrice).toBe(9000);
    expect(data.items.find((row) => row.itemId === deletedMirror.item.id)!.netUnitPrice).toBe(8000);
    expect(data.reference).toEqual({ samples: 4, hourSamples: 1, priceSamples: 2, averageHoursPerUnit: 4, averageNetUnitPrice: 8500 });
  });

  it('never relinks old lines, settles expired timers or changes source data, and returns only the public history projection', async () => {
    const ctx = await context(); const entry = await previous(ctx);
    const cot = await mirror(entry, [{ linked: false, price: 12000 }]);
    await assignment(entry, { hours: 2 });
    const timer = await session(entry, { status: 'abierta', durationMinutes: null, endedAt: null, closeReason: null,
      startedAt: new Date('2020-04-15T12:00:00Z'), scheduledEndAt: new Date('2020-04-15T13:00:00Z') });
    const snapshot = async () => {
      const collections = await Promise.all([
        WorkOrder.findAll({ where: { id: orderIds }, paranoid: false, order: [['id', 'ASC']] }),
        WorkOrderItem.findAll({ where: { workOrderId: orderIds }, order: [['id', 'ASC']] }),
        Quotation.findAll({ where: { id: quotationIds }, paranoid: false, order: [['id', 'ASC']] }),
        QuotationItem.findAll({ where: { quotationId: quotationIds }, order: [['id', 'ASC']] }),
        WorkOrderItemAssignment.findAll({ where: { workOrderId: orderIds }, order: [['id', 'ASC']] }),
        WorkOrderItemSession.findAll({ where: { workOrderId: orderIds }, order: [['id', 'ASC']] }),
        WorkOrderEvent.findAll({ where: { workOrderId: orderIds }, order: [['id', 'ASC']] }),
        Notification.findAll({ where: { workOrderId: orderIds }, order: [['id', 'ASC']] }),
        CustomerEmail.findAll({ where: { kind: 'work_order', entityId: orderIds }, order: [['id', 'ASC']] }),
        CatalogItem.findAll({ where: { id: catalogIds }, paranoid: false, order: [['id', 'ASC']] }),
      ]);
      return collections.map(plain);
    };
    const before = await snapshot();
    const data = await history(ctx.current);
    expect(data.items[0]).toMatchObject({ itemId: entry.item.id, netUnitPrice: 12000, actualHours: 1,
      vehicle: { id: vehicles[0].id, patente: vehicles[0].patente, marca: vehicles[0].marca, modelo: vehicles[0].modelo } });
    expect(Object.keys(data.items[0]).sort()).toEqual(['workOrderId', 'codigo', 'fechaIngreso', 'estado', 'vehicle', 'itemId', 'description', 'quantity', 'unit', 'estimatedHours', 'actualHours', 'hoursPerUnit', 'netUnitPrice', 'qualityApproved'].sort());
    const serialized = JSON.stringify(data);
    expect(serialized).not.toMatch(/clientId|contactEmail|billingName|costHourly|saleHourly|cost_hourly|sale_hourly|passwordHash|7317[.,]42|9321[.,]57/);
    expect(serialized).not.toContain(client!.nombre);
    expect(serialized).not.toContain(client!.email!);
    expect(serialized).not.toContain(actors.mechanic.user.email);
    expect(await snapshot()).toEqual(before);
    expect((await cot.lines[0].reload()).workOrderItemId).toBeNull();
    expect((await timer.reload()).status).toBe('abierta');
  });
});
