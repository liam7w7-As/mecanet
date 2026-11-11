import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { Client } from '../../models/Client.js';
import { Notification } from '../../models/Notification.js';
import { Payment } from '../../models/Payment.js';
import { Permission } from '../../models/Permission.js';
import { Quotation } from '../../models/Quotation.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { SalesAccessGrant } from '../../models/SalesAccessGrant.js';
import { User } from '../../models/User.js';
import { Vehicle } from '../../models/Vehicle.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { getRolePermissions, updateRolePermissions } from '../../services/permission.service.js';
import { getSalesScope } from '../../services/sales-access.service.js';
import { hashPassword } from '../../utils/password.js';

import type { Response as SuperAgentResponse } from 'superagent';

const password = 'SalesModes2026!';
const binaryParser = (response: SuperAgentResponse, callback: (error: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  const stream = response as unknown as NodeJS.ReadableStream;
  stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  stream.on('end', () => callback(null, Buffer.concat(chunks)));
  stream.on('error', (error: Error) => callback(error, Buffer.alloc(0)));
};

describe('Seller sharing modes (unithor_test E2E)', () => {
  let developer: User;
  let admin: User;
  let seller: User;
  let other: User;
  let mechanic: User;
  let client: Client;
  let vehicle: Vehicle;
  let ownOrder: WorkOrder;
  let ownQuotation: Quotation;
  let foreignOrder: WorkOrder;
  let foreignQuotation: Quotation;
  let unlinkedQuotation: Quotation;
  let foreignPayment: Payment;
  let deletedOrder: WorkOrder;
  let deletedQuotation: Quotation;
  const users: User[] = [];
  const orders: WorkOrder[] = [];
  const quotations: Quotation[] = [];
  const sessions = new Map<number, string[]>();
  let sellerRoleId: number;
  let originalPermissions: number[];
  let sellerPermissions: number[];

  const url = () => `/api/users/${seller.id}/sales-access`;
  const cookie = (user: User) => sessions.get(user.id) ?? [];
  const csrf = (user: User) => cookie(user).find((value) => value.startsWith('csrf_token='))?.slice(11) ?? '';
  const get = (path: string, user = developer) => request(app).get(path).set('Cookie', cookie(user));
  const put = (body: object, user = developer, path = url()) => request(app).put(path)
    .set('Cookie', cookie(user)).set('X-CSRF-Token', csrf(user)).send(body);
  const post = (path: string, body: object, user = admin) => request(app).post(path)
    .set('Cookie', cookie(user)).set('X-CSRF-Token', csrf(user)).send(body);
  const notificationCount = () => Notification.count({ where: { userId: seller.id, tipo: 'acceso_compartido' } });
  const record = (scopeType: 'work_order' | 'quotation', targetId: number) => ({ scopeType, targetId });
  const addOrder = async (codigo: string, owner = other) => {
    const order = await WorkOrder.create({
      codigo, createdBy: owner.id, clientId: client.id, vehicleId: vehicle.id,
      assignedMechanicId: mechanic.id, fechaIngreso: new Date(),
    });
    orders.push(order);
    return order;
  };
  const addQuotation = async (codigo: string, order?: WorkOrder, owner = other) => {
    const quotation = await Quotation.create({
      codigo, asesorId: owner.id, workOrderId: order?.id ?? null,
      clientId: client.id, vehicleId: vehicle.id, subtotal: 10000, total: 10000,
      pagado: 1000, estadoPago: 'parcial',
    });
    quotations.push(quotation);
    return quotation;
  };

  beforeAll(async () => {
    expect(sequelize.getDatabaseName()).toBe('unithor_test');
    await User.destroy({
      where: { email: ['developer', 'admin', 'seller', 'other', 'mechanic'].map((name) => `sharing-modes-${name}@example.com`) },
      force: true,
    });
    await Vehicle.destroy({ where: { patente: 'SMOD12' }, force: true });
    await Client.destroy({ where: { nombre: 'Sharing client searchable' }, force: true });
    const roles = await Role.findAll();
    const passwordHash = await hashPassword(password);
    for (const [name, roleName] of [
      ['developer', 'desarrollador'], ['admin', 'admin'], ['seller', 'vendedor'],
      ['other', 'vendedor'], ['mechanic', 'mecanico'],
    ]) {
      const role = roles.find((item) => item.nombre === roleName);
      if (!role) throw new Error(`Missing test role ${roleName}`);
      const user = await User.create({ nombre: `Sharing ${name}`, email: `sharing-modes-${name}@example.com`, passwordHash, roleId: role.id });
      users.push(user);
      const response = await request(app).post('/api/auth/login').send({ email: user.email, password });
      expect(response.status).toBe(200);
      const header: unknown = response.headers['set-cookie'];
      sessions.set(user.id, (Array.isArray(header) ? header as string[] : []).map((value) => value.split(';')[0]));
    }
    [developer, admin, seller, other, mechanic] = users;
    sellerRoleId = seller.roleId;
    originalPermissions = (await getRolePermissions(sellerRoleId)).map((permission) => permission.id);
    sellerPermissions = (await Permission.findAll({ where: { modulo: ['taller', 'comercial'] } })).map((permission) => permission.id);
    await updateRolePermissions(sellerRoleId, sellerPermissions);
    client = await Client.create({ nombre: 'Sharing client searchable', tipo: 'cliente' });
    vehicle = await Vehicle.create({ patente: 'SMOD12', clientId: client.id });
    ownOrder = await addOrder('OT-MODES-OWN', seller);
    foreignOrder = await addOrder('OT-MODES-FOREIGN');
    ownQuotation = await addQuotation('COT-MODES-OWN', ownOrder, seller);
    foreignQuotation = await addQuotation('COT-MODES-FOREIGN', foreignOrder);
    unlinkedQuotation = await addQuotation('COT-MODES-UNLINKED');
    foreignPayment = await Payment.create({ quotationId: foreignQuotation.id, monto: 1000, metodo: 'efectivo', estado: 'confirmado', fecha: new Date(), createdBy: admin.id });
    deletedOrder = await addOrder('OT-MODES-DELETED');
    deletedQuotation = await addQuotation('COT-MODES-DELETED', deletedOrder);
    await deletedOrder.destroy();
    await deletedQuotation.destroy();
  });

  afterAll(async () => {
    if (originalPermissions) await updateRolePermissions(sellerRoleId, originalPermissions);
    const ids = users.map((user) => user.id);
    await SalesAccessGrant.destroy({ where: { userId: ids } });
    await Notification.destroy({ where: { userId: ids } });
    await RefreshToken.destroy({ where: { userId: ids } });
    await Payment.destroy({ where: { quotationId: quotations.map((quotation) => quotation.id) } });
    await Quotation.destroy({ where: { id: quotations.map((quotation) => quotation.id) }, force: true });
    await WorkOrder.destroy({ where: { id: orders.map((order) => order.id) }, force: true });
    if (vehicle) await vehicle.destroy({ force: true });
    if (client) await client.destroy({ force: true });
    await User.destroy({ where: { id: ids }, force: true });
  });

  it('defaults to own, retaining old grant fields and deriving mode from active grants', async () => {
    expect((await seller.reload()).salesAccessAll).toBe(false);
    expect((await get(url())).body).toEqual({ mode: 'own', grants: [] });
    const grant = await SalesAccessGrant.create({ userId: seller.id, scopeType: 'quotation', targetId: unlinkedQuotation.id, grantedBy: admin.id, expiresAt: new Date('2020-01-01') });
    const expired = await get(url());
    expect(expired.body.mode).toBe('own');
    expect(expired.body.grants[0]).toMatchObject({
      id: grant.id, userId: seller.id, scopeType: 'quotation', targetId: unlinkedQuotation.id,
      targetCodigo: unlinkedQuotation.codigo, grantedBy: admin.id, grantedByName: admin.nombre,
      expired: true, clientName: client.nombre, patente: vehicle.patente, linkedRecord: null,
    });
    expect(expired.body.grants[0].createdAt).toEqual(expect.any(String));
    expect(expired.body.grants[0].expiresAt).toEqual(expect.any(String));
    await grant.update({ expiresAt: null });
    expect((await get(url())).body.mode).toBe('selected');
    await grant.destroy();
  });

  it('searches SQL-backed paginated active records with exact items, owners and links', async () => {
    for (const scopeType of ['work_order', 'quotation']) {
      for (const search of [client.nombre, vehicle.patente, scopeType === 'work_order' ? 'OT-MODES' : 'COT-MODES']) {
        const response = await get(`${url()}/records`).query({ scopeType, search, pageSize: 1 });
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ page: 1, pageSize: 1, total: scopeType === 'work_order' ? 2 : 3, totalPages: scopeType === 'work_order' ? 2 : 3 });
        expect(response.body.items).toHaveLength(1);
        expect(Object.keys(response.body.items[0]).sort()).toEqual(['scopeType', 'targetId', 'codigo', 'clientName', 'patente', 'ownerName', 'owned', 'linkedRecord'].sort());
      }
    }
    const own = await get(`${url()}/records`).query({ scopeType: 'work_order', search: ownOrder.codigo });
    expect(own.body.items).toEqual([{
      scopeType: 'work_order', targetId: ownOrder.id, codigo: ownOrder.codigo,
      clientName: client.nombre, patente: vehicle.patente, ownerName: seller.nombre, owned: true,
      linkedRecord: { scopeType: 'quotation', targetId: ownQuotation.id, codigo: ownQuotation.codigo },
    }]);
    expect((await get(`${url()}/records`).query({ scopeType: 'quotation', search: foreignQuotation.codigo })).body.items[0])
      .toMatchObject({ ownerName: other.nombre, owned: false, linkedRecord: { scopeType: 'work_order', targetId: foreignOrder.id, codigo: foreignOrder.codigo } });
    const empty = await get(`${url()}/records`).query({ scopeType: 'work_order', search: "' OR 1=1 --" });
    expect(empty.body).toMatchObject({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 });
    expect((await get(`${url()}/records`).query({ scopeType: 'work_order', page: 20 })).body.items).toEqual([]);
  });

  it('rejects unauthorized access and missing CSRF through the existing middleware', async () => {
    for (const path of [url(), `${url()}/records?scopeType=work_order`]) {
      expect((await request(app).get(path)).status).toBe(401);
      expect((await get(path, seller)).status).toBe(403);
      expect((await get(path, mechanic)).status).toBe(403);
    }
    expect((await request(app).put(url()).set('Cookie', 'csrf_token=test').set('X-CSRF-Token', 'test').send({ mode: 'all' })).status).toBe(401);
    expect((await put({ mode: 'all' }, seller)).status).toBe(403);
    const csrfFailure = await request(app).put(url()).set('Cookie', cookie(admin)).send({ mode: 'all' });
    expect(csrfFailure.status).toBe(403);
    expect(csrfFailure.body.error.code).toBe('CSRF_INVALID');
    expect((await get(url())).body).toEqual({ mode: 'own', grants: [] });
  });

  it('validates strict bodies and queries, roles, inactive users and every target atomically', async () => {
    expect((await put({ mode: 'all' }, admin)).status).toBe(200);
    const before = (await get(url())).body;
    const countBefore = await notificationCount();
    const valid = record('work_order', foreignOrder.id);
    for (const body of [
      {}, { mode: 'invalid' }, { mode: 'selected' }, { mode: 'selected', records: [] },
      { mode: 'all', extra: true }, { mode: 'selected', records: [{ ...valid, extra: true }] },
      { mode: 'selected', records: [{ ...valid, targetId: String(foreignOrder.id) }] },
      { mode: 'selected', records: [valid, record('quotation', 2147483647)] },
      { mode: 'selected', records: [valid, record('work_order', ownOrder.id)] },
      { mode: 'selected', records: [valid, record('work_order', deletedOrder.id)] },
      { mode: 'selected', records: [valid, record('quotation', deletedQuotation.id)] },
      { mode: 'selected', records: Array.from({ length: 501 }, () => valid) },
    ]) {
      expect((await put(body)).status).toBe(400);
      expect((await get(url())).body).toEqual(before);
    }
    expect(await notificationCount()).toBe(countBefore);
    expect((await put({ mode: 'own' }, developer, '/api/users/2147483647/sales-access')).status).toBe(404);
    expect((await put({ mode: 'all' }, developer, `/api/users/${mechanic.id}/sales-access`)).status).toBe(400);
    await other.update({ activo: false });
    try {
      expect((await put({ mode: 'all' }, developer, `/api/users/${other.id}/sales-access`)).status).toBe(400);
      expect((await get(`/api/users/${other.id}/sales-access/records?scopeType=work_order`)).status).toBe(400);
      await expect(getSalesScope(other.id)).rejects.toMatchObject({ statusCode: 401 });
    } finally { await other.update({ activo: true }); }
    for (const query of [{}, { scopeType: 'bad' }, { scopeType: 'work_order', page: 0 }, { scopeType: 'quotation', pageSize: 21 }, { scopeType: 'quotation', search: 'x'.repeat(101) }]) {
      expect((await get(`${url()}/records`).query(query)).status).toBe(400);
    }
    expect((await put({ mode: 'own' })).status).toBe(200);
  });

  it('shares selected targets and linked counterparts once and preserves ownership and assignments', async () => {
    const countBefore = await notificationCount();
    const body = { mode: 'selected', records: [record('work_order', foreignOrder.id), record('work_order', foreignOrder.id), record('quotation', foreignQuotation.id)] };
    const response = await put(body);
    expect(response.status).toBe(200);
    expect(response.body.mode).toBe('selected');
    expect(response.body.grants).toHaveLength(2);
    expect(response.body.grants.find((grant: { scopeType: string }) => grant.scopeType === 'work_order')).toMatchObject({
      targetId: foreignOrder.id, expiresAt: null, expired: false, clientName: client.nombre, patente: vehicle.patente,
      linkedRecord: { scopeType: 'quotation', targetId: foreignQuotation.id, codigo: foreignQuotation.codigo },
    });
    expect(await notificationCount()).toBe(countBefore + 1);
    const repeated = await put(body, admin);
    expect(repeated.body).toEqual(response.body);
    expect(await notificationCount()).toBe(countBefore + 1);
    expect((await foreignOrder.reload()).createdBy).toBe(other.id);
    expect(foreignOrder.assignedMechanicId).toBe(mechanic.id);
    expect((await foreignQuotation.reload()).asesorId).toBe(other.id);
    expect((await get(`/api/work-orders/${foreignOrder.id}`, seller)).status).toBe(200);
    expect((await get(`/api/quotations/${foreignQuotation.id}`, seller)).status).toBe(200);
    expect((await get(`/api/quotations/${unlinkedQuotation.id}`, seller)).status).toBe(404);
    expect((await get(`/api/work-orders/${ownOrder.id}`, other)).status).toBe(404);
  });

  it('retains active expiry/audit, replaces expired selections, and removes deselected grants', async () => {
    const grant = await SalesAccessGrant.findOne({ where: { userId: seller.id, scopeType: 'quotation', targetId: foreignQuotation.id } });
    if (!grant) throw new Error('Missing fixture grant');
    const expiry = new Date('2099-01-01T00:00:00Z');
    await grant.update({ expiresAt: expiry, grantedBy: admin.id });
    await grant.reload();
    const original = grant.toJSON();
    expect((await put({ mode: 'selected', records: [record('quotation', foreignQuotation.id), record('quotation', unlinkedQuotation.id)] })).status).toBe(200);
    await grant.reload();
    expect(grant.toJSON()).toEqual(original);
    await grant.update({ expiresAt: new Date('2020-01-01') });
    const renewed = await put({ mode: 'selected', records: [record('quotation', foreignQuotation.id)] });
    expect(renewed.status).toBe(200);
    expect(renewed.body.grants).toHaveLength(2);
    const current = renewed.body.grants.find((item: { scopeType: string }) => item.scopeType === 'quotation');
    expect(current).toMatchObject({ expiresAt: null, grantedBy: developer.id, expired: false });
    expect(current.id).not.toBe(grant.id);
    expect(await SalesAccessGrant.count({ where: { userId: seller.id, targetId: unlinkedQuotation.id, scopeType: 'quotation' } })).toBe(0);
    const before = (await get(url())).body;
    expect((await put({ mode: 'selected', records: [record('quotation', unlinkedQuotation.id), record('work_order', 2147483647)] })).status).toBe(400);
    expect((await get(url())).body).toEqual(before);
  });

  it('keeps selected scope consistent for lists, detail, payments, dashboard and report exports', async () => {
    expect((await get('/api/work-orders', seller)).body.total).toBe(2);
    expect((await get('/api/quotations', seller)).body.total).toBe(2);
    expect((await get('/api/payments', seller)).body.items.map((item: { id: number }) => item.id)).toEqual([foreignPayment.id]);
    expect((await get(`/api/quotations/${foreignQuotation.id}/payments`, seller)).body.payments.map((item: { id: number }) => item.id)).toEqual([foreignPayment.id]);
    expect((await get('/api/dashboard/summary', seller)).body.metrics.activeWorkOrders).toBe(2);
    await unlinkedQuotation.update({ archivedAt: new Date() });
    try {
      expect((await get('/api/quotations?archiveStatus=active', seller)).body.total).toBe(2);
      expect((await get('/api/quotations?archiveStatus=archived', seller)).body.total).toBe(0);
    } finally { await unlinkedQuotation.update({ archivedAt: null }); }
    const year = new Date().getUTCFullYear();
    for (const area of ['commercial', 'workshop']) {
      const response = await get(`/api/reports/${area}/excel?fechaDesde=${year}-01-01&fechaHasta=${year}-12-31`, seller).buffer(true).parse(binaryParser);
      expect(response.status).toBe(200);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(response.body);
      const content = JSON.stringify(workbook.worksheets.map((sheet) => sheet.getSheetValues()));
      expect(content).toContain(area === 'commercial' ? foreignQuotation.codigo : foreignOrder.codigo);
      expect(content).not.toContain(unlinkedQuotation.codigo);
    }
  });

  it('accepts a nonowned source whose linked counterpart is owned without granting the owned target', async () => {
    await foreignOrder.update({ createdBy: seller.id });
    try {
      const response = await put({ mode: 'selected', records: [record('quotation', foreignQuotation.id)] });
      expect(response.status).toBe(200);
      expect(response.body.grants).toHaveLength(1);
      expect(response.body.grants[0]).toMatchObject({
        scopeType: 'quotation', targetId: foreignQuotation.id,
        linkedRecord: { scopeType: 'work_order', targetId: foreignOrder.id, codigo: foreignOrder.codigo },
      });
      expect((await get(`/api/work-orders/${foreignOrder.id}`, seller)).status).toBe(200);
      expect((await get(`/api/quotations/${foreignQuotation.id}`, seller)).status).toBe(200);
    } finally { await foreignOrder.update({ createdBy: other.id }); }
  });

  it('rolls back grant deletions and the all flag when a later transactional write fails', async () => {
    const before = (await get(url())).body;
    const countBefore = await notificationCount();
    const spy = vi.spyOn(Notification, 'bulkCreate').mockRejectedValueOnce(new Error('Simulated write failure'));
    try {
      expect((await put({ mode: 'all' })).status).toBe(500);
    } finally { spy.mockRestore(); }
    expect((await get(url())).body).toEqual(before);
    expect((await seller.reload()).salesAccessAll).toBe(false);
    expect(await notificationCount()).toBe(countBefore);
  });

  it('uses real all mode for future records without grants and keeps soft deletes hidden', async () => {
    const before = await notificationCount();
    const response = await put({ mode: 'all' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ mode: 'all', grants: [] });
    expect((await seller.reload()).salesAccessAll).toBe(true);
    expect(await getSalesScope(seller.id)).toBeUndefined();
    expect(await notificationCount()).toBe(before + 1);
    expect((await put({ mode: 'all' })).body).toEqual(response.body);
    expect(await notificationCount()).toBe(before + 1);
    const futureOrder = await addOrder('OT-MODES-FUTURE');
    const futureQuotation = await addQuotation('COT-MODES-FUTURE', futureOrder);
    const futurePayment = await Payment.create({ quotationId: futureQuotation.id, monto: 1000, metodo: 'efectivo', estado: 'confirmado', fecha: new Date(), createdBy: admin.id });
    expect((await get(`/api/work-orders/${futureOrder.id}`, seller)).status).toBe(200);
    expect((await get(`/api/quotations/${futureQuotation.id}`, seller)).status).toBe(200);
    expect((await get('/api/quotations', seller)).body.total).toBe(4);
    expect((await get('/api/payments', seller)).body.total).toBe(2);
    expect((await get(`/api/quotations/${futureQuotation.id}/payments`, seller)).body.payments.map((item: { id: number }) => item.id)).toEqual([futurePayment.id]);
    expect((await get('/api/dashboard/summary', seller)).body.metrics.activeWorkOrders).toBe(3);
    const year = new Date().getUTCFullYear();
    for (const area of ['commercial', 'workshop']) {
      const report = await get(`/api/reports/${area}/excel?fechaDesde=${year}-01-01&fechaHasta=${year}-12-31`, seller).buffer(true).parse(binaryParser);
      expect(report.status).toBe(200);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(report.body);
      const content = JSON.stringify(workbook.worksheets.map((sheet) => sheet.getSheetValues()));
      expect(content).toContain(area === 'commercial' ? futureQuotation.codigo : futureOrder.codigo);
      expect(content).not.toContain(deletedQuotation.codigo);
      expect(content).not.toContain(deletedOrder.codigo);
    }
    expect((await get(`/api/work-orders/${deletedOrder.id}`, seller)).status).toBe(404);
    expect((await get(`/api/quotations/${deletedQuotation.id}`, seller)).status).toBe(404);
    expect(await SalesAccessGrant.count({ where: { userId: seller.id } })).toBe(0);
    // Legacy calls cannot materialize redundant grants in all mode.
    expect((await request(app).post(`${url()}`).set('Cookie', cookie(admin)).set('X-CSRF-Token', csrf(admin))
      .send({ scopeType: 'work_order', targetId: foreignOrder.id })).status).toBe(201);
    expect(await SalesAccessGrant.count({ where: { userId: seller.id } })).toBe(0);
    expect(await notificationCount()).toBe(before + 1);
  });

  it('keeps normal module permissions enforced in all mode', async () => {
    await updateRolePermissions(sellerRoleId, []);
    try {
      for (const path of ['/api/work-orders', `/api/work-orders/${foreignOrder.id}`, '/api/quotations', '/api/payments', '/api/reports/commercial/excel']) {
        expect((await get(path, seller)).status).toBe(403);
      }
      expect(await getSalesScope(seller.id)).toBeUndefined();
    } finally { await updateRolePermissions(sellerRoleId, sellerPermissions); }
  });

  it('revokes all and selected access with own while preserving own records', async () => {
    for (const previousMode of ['all', 'selected']) {
      if (previousMode === 'selected') expect((await put({ mode: 'selected', records: [record('quotation', foreignQuotation.id)] })).status).toBe(200);
      const response = await put({ mode: 'own' });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ mode: 'own', grants: [] });
      expect((await seller.reload()).salesAccessAll).toBe(false);
      for (const path of [`/api/work-orders/${foreignOrder.id}`, `/api/quotations/${foreignQuotation.id}`, `/api/quotations/${foreignQuotation.id}/payments`, `/api/payments/${foreignPayment.id}/receipt`]) {
        expect((await get(path, seller)).status).toBe(404);
      }
      expect((await get('/api/work-orders', seller)).body.total).toBe(1);
      expect((await get('/api/quotations', seller)).body.total).toBe(1);
      expect((await get('/api/quotations?archiveStatus=active', seller)).body.total).toBe(1);
      expect((await get('/api/payments', seller)).body.total).toBe(0);
      expect((await get(`/api/work-orders/${ownOrder.id}`, seller)).status).toBe(200);
      expect((await get(`/api/quotations/${ownQuotation.id}`, seller)).status).toBe(200);
    }
  });

  it('serializes a legacy grant already in flight before an own reset', async () => {
    let entered!: () => void;
    let release!: () => void;
    const atInsert = new Promise<void>((resolve) => { entered = resolve; });
    const resume = new Promise<void>((resolve) => { release = resolve; });
    const original = SalesAccessGrant.findOrCreate.bind(SalesAccessGrant);
    const spy = vi.spyOn(SalesAccessGrant, 'findOrCreate').mockImplementationOnce(async (options) => {
      entered();
      await resume;
      return original(options);
    });
    const legacy = request(app).post(url()).set('Cookie', cookie(admin)).set('X-CSRF-Token', csrf(admin))
      .send({ scopeType: 'work_order', targetId: foreignOrder.id }).then((response) => response);
    await atInsert;
    let resetReachedLock!: () => void;
    const resetAtLock = new Promise<void>((resolve) => { resetReachedLock = resolve; });
    const findUser = User.findByPk.bind(User);
    const lockSpy = vi.spyOn(User, 'findByPk').mockImplementation((id, options) => {
      if (id === seller.id && options?.lock && options.transaction) resetReachedLock();
      return findUser(id, options);
    });
    const reset = put({ mode: 'own' }).then((response) => response);
    try {
      await resetAtLock;
      release();
      expect((await legacy).status).toBe(201);
      expect((await reset).status).toBe(200);
      expect((await get(url())).body).toEqual({ mode: 'own', grants: [] });
      expect((await get(`/api/work-orders/${foreignOrder.id}`, seller)).status).toBe(404);
    } finally { release(); spy.mockRestore(); lockSpy.mockRestore(); }
  });

  it('propagates a selected OT grant when its COT is created later, preserving expiry and audit', async () => {
    const source = await addOrder('OT-MODES-LINK-LATER');
    expect((await put({ mode: 'selected', records: [record('work_order', source.id)] })).status).toBe(200);
    const sourceGrant = await SalesAccessGrant.findOne({ where: { userId: seller.id, scopeType: 'work_order', targetId: source.id } });
    if (!sourceGrant) throw new Error('Missing selected OT grant');
    await sourceGrant.update({ expiresAt: new Date('2099-01-01'), grantedBy: developer.id });
    const created = await post('/api/quotations', {
      workOrderId: source.id, items: [{ descripcion: 'Later shared quotation', cantidad: 1, precioUnitario: 10000 }],
    });
    expect(created.status).toBe(201);
    const linked = await Quotation.findByPk(created.body.quotation.id);
    if (!linked) throw new Error('Missing created quotation');
    quotations.push(linked);
    const grants = (await get(url())).body.grants;
    expect(grants).toHaveLength(2);
    expect(grants.find((grant: { scopeType: string }) => grant.scopeType === 'quotation')).toMatchObject({
      targetId: linked.id, expiresAt: '2099-01-01T00:00:00.000Z', grantedBy: developer.id,
    });
    expect((await get(`/api/work-orders/${source.id}`, seller)).body.workOrder.quotation.codigo).toBe(linked.codigo);
    expect((await get(`/api/quotations/${linked.id}`, seller)).body.quotation.workOrder.codigo).toBe(source.codigo);
    expect((await source.reload()).createdBy).toBe(other.id);
    expect(linked.asesorId).toBe(admin.id);
    expect((await put({ mode: 'own' })).status).toBe(200);
    expect((await get(`/api/work-orders/${source.id}`, seller)).status).toBe(404);
    expect((await get(`/api/quotations/${linked.id}`, seller)).status).toBe(404);
  });

  it('propagates a selected COT grant through conversion and revokes both records and payments', async () => {
    const source = await addQuotation('COT-MODES-CONVERT-LATER');
    expect((await put({ mode: 'selected', records: [record('quotation', source.id)] })).status).toBe(200);
    const converted = await post(`/api/quotations/${source.id}/convert-to-ot`, {
      clientId: client.id, vehicleId: vehicle.id, assignedMechanicId: mechanic.id,
    });
    expect(converted.status).toBe(201);
    const linked = await WorkOrder.findByPk(converted.body.workOrder.id);
    if (!linked) throw new Error('Missing converted OT');
    orders.push(linked);
    const payment = await Payment.create({ quotationId: source.id, monto: 1000, metodo: 'efectivo', estado: 'confirmado', fecha: new Date(), createdBy: admin.id });
    expect((await get(url())).body.grants).toHaveLength(2);
    expect((await get(`/api/work-orders/${linked.id}`, seller)).status).toBe(200);
    expect((await get(`/api/quotations/${source.id}`, seller)).status).toBe(200);
    expect((await get(`/api/quotations/${source.id}/payments`, seller)).body.payments.map((item: { id: number }) => item.id)).toEqual([payment.id]);
    expect(linked.createdBy).toBe(admin.id);
    expect(linked.assignedMechanicId).toBe(mechanic.id);
    expect((await source.reload()).asesorId).toBe(other.id);
    expect((await put({ mode: 'own' })).status).toBe(200);
    for (const path of [`/api/work-orders/${linked.id}`, `/api/quotations/${source.id}`, `/api/quotations/${source.id}/payments`, `/api/payments/${payment.id}/receipt`]) {
      expect((await get(path, seller)).status).toBe(404);
    }
  });

  it('does not resurrect grants when an own reset completes during later linking', async () => {
    const source = await addOrder('OT-MODES-REVOKE-LINK');
    expect((await put({ mode: 'selected', records: [record('work_order', source.id)] })).status).toBe(200);
    const countBefore = await notificationCount();
    let entered!: () => void;
    let release!: () => void;
    const atUserLock = new Promise<void>((resolve) => { entered = resolve; });
    const resume = new Promise<void>((resolve) => { release = resolve; });
    const original = User.findAll.bind(User);
    let paused = false;
    const spy = vi.spyOn(User, 'findAll').mockImplementation(async (options) => {
      if (!paused && options?.lock && Array.isArray(options.attributes) && options.attributes.includes('salesAccessAll')) {
        paused = true;
        entered();
        await resume;
      }
      return original(options);
    });
    const creation = post('/api/quotations', { workOrderId: source.id }).then((response) => response);
    try {
      await atUserLock;
      expect((await put({ mode: 'own' })).status).toBe(200);
      release();
      const response = await creation;
      expect(response.status).toBe(201);
      const linked = await Quotation.findByPk(response.body.quotation.id);
      if (!linked) throw new Error('Missing created quotation');
      quotations.push(linked);
      expect((await get(url())).body).toEqual({ mode: 'own', grants: [] });
      expect((await get(`/api/work-orders/${source.id}`, seller)).status).toBe(404);
      expect((await get(`/api/quotations/${linked.id}`, seller)).status).toBe(404);
      expect(await notificationCount()).toBe(countBefore);
    } finally { release(); spy.mockRestore(); }
  });

  it('includes the new counterpart when a selected save starts during conversion', async () => {
    const source = await addQuotation('COT-MODES-CONCURRENT-LINK');
    let entered!: () => void;
    let release!: () => void;
    const atCreation = new Promise<void>((resolve) => { entered = resolve; });
    const resume = new Promise<void>((resolve) => { release = resolve; });
    const createOrder = WorkOrder.create.bind(WorkOrder);
    const spy = vi.spyOn(WorkOrder, 'create').mockImplementationOnce(async (values, options) => {
      entered();
      await resume;
      return createOrder(values, options);
    });
    const conversion = post(`/api/quotations/${source.id}/convert-to-ot`, { clientId: client.id, vehicleId: vehicle.id }).then((response) => response);
    await atCreation;
    let saveReachedLock!: () => void;
    const atSourceLock = new Promise<void>((resolve) => { saveReachedLock = resolve; });
    const findQuotations = Quotation.findAll.bind(Quotation);
    const lockSpy = vi.spyOn(Quotation, 'findAll').mockImplementation((options) => {
      if (options?.lock) saveReachedLock();
      return findQuotations(options);
    });
    const save = put({ mode: 'selected', records: [record('quotation', source.id)] }).then((response) => response);
    try {
      await atSourceLock;
      release();
      const converted = await conversion;
      expect(converted.status).toBe(201);
      const linked = await WorkOrder.findByPk(converted.body.workOrder.id);
      if (!linked) throw new Error('Missing concurrently converted OT');
      orders.push(linked);
      const saved = await save;
      expect(saved.status).toBe(200);
      expect(saved.body.grants).toHaveLength(2);
      expect((await get(`/api/work-orders/${linked.id}`, seller)).status).toBe(200);
      expect((await put({ mode: 'own' })).body).toEqual({ mode: 'own', grants: [] });
      expect((await get(`/api/work-orders/${linked.id}`, seller)).status).toBe(404);
    } finally { release(); spy.mockRestore(); lockSpy.mockRestore(); }
  });
});
