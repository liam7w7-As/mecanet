import { randomUUID } from 'node:crypto';

import ExcelJS from 'exceljs';
import { Op } from 'sequelize';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
import { WorkOrderInspectionPhoto } from '../../models/WorkOrderInspectionPhoto.js';
import { removeStoredFile, storeFile } from '../../services/file-storage.service.js';
import { getRolePermissions, updateRolePermissions } from '../../services/permission.service.js';
import { hashPassword } from '../../utils/password.js';

import type { SalesAccessScopeType } from '@unithor/shared';
import type { Response as SuperAgentResponse } from 'superagent';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const password = 'Revocation2026!';
const runId = randomUUID().slice(0, 8);
const binaryParser = (response: SuperAgentResponse, callback: (error: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  const stream = response as unknown as NodeJS.ReadableStream;
  stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  stream.on('end', () => callback(null, Buffer.concat(chunks)));
  stream.on('error', (error: Error) => callback(error, Buffer.alloc(0)));
};

interface Pair { order: WorkOrder; quotation: Quotation; payment: Payment }

describe('Seller pair revocation and current access revision (unithor_test E2E)', () => {
  const users: User[] = [];
  const pairs: Pair[] = [];
  const files: string[] = [];
  const cookies = new Map<number, string[]>();
  let admin: User;
  let seller: User;
  let owner: User;
  let observer: User;
  let own: Pair;
  let removed: Pair;
  let kept: Pair;
  let client: Client;
  let vehicle: Vehicle;
  let roleId: number;
  let originalPermissions: number[];
  let fullPermissions: number[];
  const accessUrl = () => `/api/users/${seller.id}/sales-access`;
  const session = (user: User) => cookies.get(user.id) ?? [];
  const csrf = (user: User) => session(user).find((cookie) => cookie.startsWith('csrf_token='))?.slice(11) ?? '';
  const get = (path: string, user = seller) => request(app).get(path).set('Cookie', session(user));
  const putAccess = (body: object) => request(app).put(accessUrl())
    .set('Cookie', session(admin)).set('X-CSRF-Token', csrf(admin)).send(body);
  const del = (path: string) => request(app).delete(path)
    .set('Cookie', session(admin)).set('X-CSRF-Token', csrf(admin));
  const record = (pair: Pair, scopeType: SalesAccessScopeType = 'work_order') => ({
    scopeType, targetId: scopeType === 'work_order' ? pair.order.id : pair.quotation.id,
  });
  const selectBoth = async () => {
    expect((await putAccess({ mode: 'selected', records: [record(removed), record(kept, 'quotation')] })).status).toBe(200);
  };
  const current = async () => {
    const response = await get('/api/auth/sales-access');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(Object.keys(response.body).sort()).toEqual(['mode', 'revision']);
    expect(response.body.revision).toMatch(/^[a-f0-9]{64}$/);
    return response.body as { mode: 'own' | 'selected' | 'all'; revision: string };
  };
  const assertPair = async (pair: Pair, allowed: boolean, user = seller) => {
    const expected = allowed ? 200 : 404;
    const order = await get(`/api/work-orders/${pair.order.id}`, user);
    const quotation = await get(`/api/quotations/${pair.quotation.id}`, user);
    expect(order.status).toBe(expected);
    expect(quotation.status).toBe(expected);
    if (allowed) {
      expect(order.body.workOrder.quotation.id).toBe(pair.quotation.id);
      expect(quotation.body.quotation.workOrder.id).toBe(pair.order.id);
    }
    const payments = await get(`/api/quotations/${pair.quotation.id}/payments`, user);
    expect(payments.status).toBe(expected);
    if (allowed) expect(payments.body.payments.map((payment: { id: number }) => payment.id)).toEqual([pair.payment.id]);
    for (const [path, mime] of [
      [`/api/work-orders/${pair.order.id}/pdf`, 'application/pdf'],
      [`/api/work-orders/${pair.order.id}/reception-pdf`, 'application/pdf'],
      [`/api/work-orders/${pair.order.id}/inspection/photos/frontal`, 'image/png'],
      [`/api/quotations/${pair.quotation.id}/inspection/photos/frontal`, 'image/png'],
      [`/api/payments/${pair.payment.id}/receipt`, 'image/png'],
    ]) {
      const response = await get(path, user).buffer(true).parse(binaryParser);
      expect(response.status, path).toBe(expected);
      if (allowed) {
        expect(response.headers['content-type']).toContain(mime);
        if (mime === 'image/png') expect(response.body).toEqual(PNG);
        else expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      }
    }
  };
  const assertCollections = async (visible: Pair[]) => {
    for (const [path, ids] of [
      ['/api/work-orders', visible.map((pair) => pair.order.id)],
      ['/api/quotations', visible.map((pair) => pair.quotation.id)],
      ['/api/payments', visible.map((pair) => pair.payment.id)],
    ] as const) {
      const response = await get(path).query({ pageSize: 100 });
      expect(response.status).toBe(200);
      expect(response.body.total).toBe(ids.length);
      expect(response.body.items.map((item: { id: number }) => item.id).sort((a: number, b: number) => a - b))
        .toEqual([...ids].sort((a, b) => a - b));
    }
    expect((await get('/api/dashboard/summary')).body.metrics.activeWorkOrders).toBe(visible.length);
    const year = new Date().getUTCFullYear();
    for (const area of ['commercial', 'workshop']) {
      const response = await get(`/api/reports/${area}/excel`).query({ fechaDesde: `${year}-01-01`, fechaHasta: `${year}-12-31` })
        .buffer(true).parse(binaryParser);
      expect(response.status).toBe(200);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(response.body);
      const content = JSON.stringify(workbook.worksheets.map((sheet) => sheet.getSheetValues()));
      for (const pair of pairs) {
        const codigo = area === 'commercial' ? pair.quotation.codigo : pair.order.codigo;
        if (visible.includes(pair)) expect(content).toContain(codigo);
        else expect(content).not.toContain(codigo);
      }
    }
    const paymentsExport = await get('/api/exports/payments/excel').buffer(true).parse(binaryParser);
    expect(paymentsExport.status).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(paymentsExport.body);
    const content = JSON.stringify(workbook.worksheets.map((sheet) => sheet.getSheetValues()));
    for (const pair of pairs) {
      if (visible.includes(pair)) expect(content).toContain(pair.payment.referencia);
      else expect(content).not.toContain(pair.payment.referencia);
    }
  };
  const assertRemoval = async () => {
    await assertPair(removed, false);
    await assertPair(kept, true);
    await assertPair(own, true);
    await assertPair(removed, true, observer);
    await assertCollections([own, kept]);
    for (const path of [`/api/work-orders/${removed.order.id}`, `/api/quotations/${removed.quotation.id}`]) {
      expect((await request(app).patch(path).set('Cookie', session(seller)).set('X-CSRF-Token', csrf(seller)).send({})).status).toBe(404);
      expect((await request(app).delete(path).set('Cookie', session(seller)).set('X-CSRF-Token', csrf(seller))).status).toBe(404);
    }
    const payment = await request(app).post('/api/payments').set('Cookie', session(seller)).set('X-CSRF-Token', csrf(seller))
      .send({ quotationId: removed.quotation.id, monto: 1, metodo: 'efectivo' });
    expect(payment.status).toBe(404);
    expect((await removed.order.reload()).createdBy).toBe(owner.id);
    expect((await removed.quotation.reload()).asesorId).toBe(owner.id);
    expect(Number((await removed.quotation.reload()).pagado)).toBe(1000);
    expect(await SalesAccessGrant.count({ where: { userId: observer.id } })).toBe(2);
  };

  beforeAll(async () => {
    expect(sequelize.getDatabaseName()).toBe('unithor_test');
    const roles = await Role.findAll();
    const passwordHash = await hashPassword(password);
    for (const name of ['admin', 'seller', 'owner', 'observer']) {
      const role = roles.find((item) => item.nombre === (name === 'admin' ? 'admin' : 'vendedor'));
      if (!role) throw new Error('Missing test role');
      const user = await User.create({ nombre: `Revocation ${name}`, email: `pair-revocation-${name}-${runId}@example.com`, passwordHash, roleId: role.id });
      users.push(user);
      const login = await request(app).post('/api/auth/login').send({ email: user.email, password });
      expect(login.status).toBe(200);
      const header: unknown = login.headers['set-cookie'];
      cookies.set(user.id, (Array.isArray(header) ? header as string[] : []).map((value) => value.split(';')[0]));
    }
    [admin, seller, owner, observer] = users;
    roleId = seller.roleId;
    originalPermissions = (await getRolePermissions(roleId)).map((permission) => permission.id);
    fullPermissions = (await Permission.findAll({ where: { modulo: ['taller', 'comercial'] } })).map((permission) => permission.id);
    await updateRolePermissions(roleId, fullPermissions);
    client = await Client.create({ nombre: 'Pair revocation client', tipo: 'cliente' });
    vehicle = await Vehicle.create({ patente: `RV${runId.toUpperCase()}`, clientId: client.id });
    for (const name of ['OWN', 'REMOVED', 'KEPT']) {
      const createdBy = name === 'OWN' ? seller.id : owner.id;
      const order = await WorkOrder.create({ codigo: `OT-REVOKE-${name}`, createdBy, clientId: client.id, vehicleId: vehicle.id, fechaIngreso: new Date() });
      const quotation = await Quotation.create({ codigo: `COT-REVOKE-${name}`, asesorId: createdBy, workOrderId: order.id,
        clientId: client.id, vehicleId: vehicle.id, subtotal: 10000, total: 10000, pagado: 1000, estadoPago: 'parcial' });
      const receiptKey = `sales-access-revocation/${quotation.id}-receipt.png`;
      await storeFile(receiptKey, PNG, 'image/png');
      files.push(receiptKey);
      const payment = await Payment.create({ quotationId: quotation.id, monto: 1000, metodo: 'efectivo', estado: 'confirmado',
        fecha: new Date(), createdBy: admin.id, comprobantePago: receiptKey, referencia: `PAY-REVOKE-${name}` });
      pairs.push({ order, quotation, payment });
      const upload = await request(app).post(`/api/work-orders/${order.id}/inspection/photos/frontal`)
        .set('Cookie', session(admin)).set('X-CSRF-Token', csrf(admin)).attach('photo', PNG, { filename: 'frontal.png', contentType: 'image/png' });
      expect(upload.status).toBe(201);
      const photo = await WorkOrderInspectionPhoto.findByPk(upload.body.photo.id);
      if (!photo) throw new Error('Missing uploaded fixture photo');
      files.push(photo.storageKey);
    }
    [own, removed, kept] = pairs;
    const observerAccess = await request(app).put(`/api/users/${observer.id}/sales-access`)
      .set('Cookie', session(admin)).set('X-CSRF-Token', csrf(admin)).send({ mode: 'selected', records: [record(removed)] });
    expect(observerAccess.status).toBe(200);
  });

  beforeEach(selectBoth);

  afterAll(async () => {
    vi.restoreAllMocks();
    if (originalPermissions) await updateRolePermissions(roleId, originalPermissions);
    for (const file of files) await removeStoredFile(file, false);
    const userIds = users.map((user) => user.id);
    await SalesAccessGrant.destroy({ where: { userId: userIds } });
    await Notification.destroy({ where: { userId: userIds } });
    await RefreshToken.destroy({ where: { userId: userIds } });
    await Payment.destroy({ where: { quotationId: pairs.map((pair) => pair.quotation.id) } });
    await Quotation.destroy({ where: { id: pairs.map((pair) => pair.quotation.id) }, force: true });
    await WorkOrder.destroy({ where: { id: pairs.map((pair) => pair.order.id) }, force: true });
    if (vehicle) await vehicle.destroy({ force: true });
    if (client) await client.destroy({ force: true });
    await User.destroy({ where: { id: userIds }, force: true });
  });

  it('narrows all to selected, removes one pair, then resets to own using the same seller session', async () => {
    expect((await putAccess({ mode: 'all' })).status).toBe(200);
    await assertPair(removed, true);
    await assertCollections(pairs);
    await selectBoth();
    await assertPair(removed, true);
    const response = await putAccess({ mode: 'selected', records: [record(kept, 'quotation')] });
    expect(response.status).toBe(200);
    expect(response.body.grants).toHaveLength(2);
    await assertRemoval();
    expect((await putAccess({ mode: 'own' })).status).toBe(200);
    await assertPair(removed, false);
    await assertPair(kept, false);
    await assertPair(own, true);
    await assertCollections([own]);
  });

  it.each([
    ['user', 'work_order'], ['user', 'quotation'], ['record', 'work_order'], ['record', 'quotation'],
  ] as const)('revokes both counterparts through the legacy %s %s deletion without changing another pair or seller', async (route, scopeType) => {
    await assertPair(removed, true);
    const grant = await SalesAccessGrant.findOne({ where: { userId: seller.id, ...record(removed, scopeType) } });
    if (!grant) throw new Error('Missing revocation grant');
    const path = route === 'user' ? `${accessUrl()}/${grant.id}`
      : `/api/${scopeType === 'work_order' ? 'work-orders' : 'quotations'}/${grant.targetId}/access/${grant.id}`;
    expect((await del(path)).status).toBe(204);
    await assertRemoval();
    expect((await get(accessUrl(), admin)).body.grants).toHaveLength(2);
    expect((await del(path)).status).toBe(404);
  });

  it('ignores expired grants on every read surface while retaining another pair and own records', async () => {
    await SalesAccessGrant.update({ expiresAt: new Date('2020-01-01') }, {
      where: { userId: seller.id, [Op.or]: [record(removed), record(removed, 'quotation')] },
    });
    await assertRemoval();
  });

  it.each(['selected', 'all'] as const)('keeps soft-deleted pairs, their payments and stored receipts hidden in %s mode', async (mode) => {
    if (mode === 'all') expect((await putAccess({ mode })).status).toBe(200);
    await removed.order.destroy();
    await removed.quotation.destroy();
    try {
      expect.soft((await get(`/api/payments/${removed.payment.id}/receipt`)).status).toBe(404);
      const payments = await get('/api/payments');
      expect.soft(payments.body.items.map((payment: { id: number }) => payment.id)).not.toContain(removed.payment.id);
      expect((await get(`/api/payments/${removed.payment.id}/receipt`, admin)).status).toBe(200);
      expect((await get('/api/payments', admin)).body.items.map((payment: { id: number }) => payment.id)).toContain(removed.payment.id);
      await assertPair(removed, false);
      await assertPair(own, true);
      await assertPair(kept, true);
      await assertCollections([own, kept]);
    } finally {
      await removed.order.restore();
      await removed.quotation.restore();
    }
  });

  it.each(['work_order', 'quotation'] as const)('revokes a soft-deleted %s and its counterpart so restoration cannot restore access', async (scopeType) => {
    const grant = await SalesAccessGrant.findOne({ where: { userId: seller.id, ...record(removed, scopeType) } });
    if (!grant) throw new Error('Missing deleted source grant');
    const source = scopeType === 'work_order' ? removed.order : removed.quotation;
    await source.destroy();
    try {
      expect((await putAccess({ mode: 'all' })).status).toBe(200);
      const sourcePath = `/api/${scopeType === 'work_order' ? 'work-orders' : 'quotations'}/${source.id}`;
      expect((await get(sourcePath)).status).toBe(404);
      // Recreate historical grants to exercise revocation of an already deleted source.
      await putAccess({ mode: 'own' });
      await SalesAccessGrant.bulkCreate([
        { userId: seller.id, ...record(removed), grantedBy: admin.id },
        { userId: seller.id, ...record(removed, 'quotation'), grantedBy: admin.id },
      ]);
      const historical = await SalesAccessGrant.findOne({ where: { userId: seller.id, ...record(removed, scopeType) } });
      expect((await del(`${accessUrl()}/${historical!.id}`)).status).toBe(204);
      expect(await SalesAccessGrant.count({ where: { userId: seller.id } })).toBe(0);
    } finally { await source.restore(); }
    await assertPair(removed, false);
    await selectBoth();
    expect((await putAccess({ mode: 'selected', records: [record(kept)] })).status).toBe(200);
    await assertRemoval();
  });

  it('keeps read scope independent from create, update, delete, export and access administration permissions in every mode', async () => {
    const reads = await Permission.findAll({ where: { modulo: ['taller', 'comercial'], accion: 'read' } });
    await updateRolePermissions(roleId, reads.map((permission) => permission.id));
    try {
      for (const mode of ['own', 'selected', 'all'] as const) {
        expect((await putAccess({ mode, ...(mode === 'selected' ? { records: [record(kept)] } : {}) })).status).toBe(200);
        const pair = mode === 'own' ? own : kept;
        await assertPair(pair, true);
        for (const path of [`/api/work-orders/${pair.order.id}`, `/api/quotations/${pair.quotation.id}`]) {
          expect((await request(app).patch(path).set('Cookie', session(seller)).set('X-CSRF-Token', csrf(seller)).send({})).status).toBe(403);
          expect((await request(app).delete(path).set('Cookie', session(seller)).set('X-CSRF-Token', csrf(seller))).status).toBe(403);
        }
        expect((await request(app).post('/api/payments').set('Cookie', session(seller)).set('X-CSRF-Token', csrf(seller))
          .send({ quotationId: pair.quotation.id, monto: 1, metodo: 'efectivo' })).status).toBe(403);
        for (const path of ['/api/reports/commercial/excel', '/api/reports/workshop/pdf', accessUrl(), `/api/work-orders/${pair.order.id}/access`]) {
          expect((await get(path)).status).toBe(403);
        }
      }
    } finally { await updateRolePermissions(roleId, fullPermissions); }
  });

  it('exposes only the authenticated seller revision, without module permissions or another user selector', async () => {
    expect((await request(app).get('/api/auth/sales-access')).status).toBe(401);
    expect((await get('/api/auth/sales-access', admin)).status).toBe(403);
    const baseline = await current();
    expect(baseline.mode).toBe('selected');
    expect((await get('/api/auth/sales-access').query({ userId: owner.id, id: owner.id })).body).toEqual(baseline);
    await updateRolePermissions(roleId, []);
    try { expect(await current()).toEqual(baseline); }
    finally { await updateRolePermissions(roleId, fullPermissions); }
    await seller.update({ activo: false });
    try { expect((await get('/api/auth/sales-access')).status).toBe(401); }
    finally { await seller.update({ activo: true }); }
  });

  it('changes revision for additions, removals, expiry edits and all mode while repeated saves stay stable', async () => {
    expect((await putAccess({ mode: 'own' })).status).toBe(200);
    const ownRevision = await current();
    expect(ownRevision.mode).toBe('own');
    expect(await current()).toEqual(ownRevision);
    await selectBoth();
    const selectedRevision = await current();
    expect(selectedRevision.mode).toBe('selected');
    expect(selectedRevision.revision).not.toBe(ownRevision.revision);
    await selectBoth();
    expect(await current()).toEqual(selectedRevision);
    const grant = await SalesAccessGrant.findOne({ where: { userId: seller.id, ...record(removed) } });
    await grant!.update({ expiresAt: new Date('2099-01-01') });
    const expiryRevision = await current();
    expect(expiryRevision.revision).not.toBe(selectedRevision.revision);
    expect((await putAccess({ mode: 'selected', records: [record(kept)] })).status).toBe(200);
    const removedRevision = await current();
    expect(removedRevision.mode).toBe('selected');
    expect(removedRevision.revision).not.toBe(expiryRevision.revision);
    expect((await putAccess({ mode: 'all' })).status).toBe(200);
    const allRevision = await current();
    expect(allRevision.mode).toBe('all');
    expect(allRevision.revision).not.toBe(removedRevision.revision);
    expect((await putAccess({ mode: 'all' })).status).toBe(200);
    expect(await current()).toEqual(allRevision);
    expect((await putAccess({ mode: 'own' })).status).toBe(200);
    expect(await current()).toEqual(ownRevision);
  });

  it('checks only requested readable records in each mode without exposing or granting other records', async () => {
    const ids = { workOrderIds: pairs.map((pair) => pair.order.id).join(','), quotationIds: pairs.map((pair) => pair.quotation.id).join(',') };
    for (const mode of ['own', 'selected', 'all'] as const) {
      expect((await putAccess({ mode, ...(mode === 'selected' ? { records: [record(kept)] } : {}) })).status).toBe(200);
      const response = await get('/api/auth/sales-access').query({ ...ids, userId: owner.id });
      expect(response.status).toBe(200);
      const expected = mode === 'own' ? [own] : mode === 'selected' ? [own, kept] : pairs;
      expect(response.body.records.workOrderIds.sort()).toEqual(expected.map((pair) => pair.order.id).sort());
      expect(response.body.records.quotationIds.sort()).toEqual(expected.map((pair) => pair.quotation.id).sort());
      expect(Object.keys(response.body.records).sort()).toEqual(['quotationIds', 'workOrderIds']);
      if (mode !== 'all') await assertPair(removed, false);
    }
    await kept.order.destroy();
    await kept.quotation.destroy();
    try {
      const response = await get('/api/auth/sales-access').query(ids);
      expect(response.body.records.workOrderIds).not.toContain(kept.order.id);
      expect(response.body.records.quotationIds).not.toContain(kept.quotation.id);
    } finally { await kept.order.restore(); await kept.quotation.restore(); }
  });

  it('rejects malformed or oversized open-record checks', async () => {
    for (const workOrderIds of ['0', '-1', '1,x', '1.5', '9007199254740992', Array.from({ length: 201 }, (_, index) => index + 1).join(',')]) {
      expect((await get('/api/auth/sales-access').query({ workOrderIds })).status).toBe(400);
    }
    const response = await get('/api/auth/sales-access').query({ quotationIds: `${kept.quotation.id},${kept.quotation.id}` });
    expect(response.body.records).toEqual({ workOrderIds: [], quotationIds: [kept.quotation.id] });
    expect(await SalesAccessGrant.count({ where: { userId: seller.id } })).toBe(4);
  });

  it('changes revision and effective mode as grants expire without any database write', async () => {
    const now = Date.now();
    await SalesAccessGrant.update({ expiresAt: new Date(now + 60000) }, { where: { userId: seller.id } });
    const before = await current();
    expect(before.mode).toBe('selected');
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(now + 60001);
      const after = await current();
      expect(after.mode).toBe('own');
      expect(after.revision).not.toBe(before.revision);
      await assertPair(removed, false);
      await assertPair(kept, false);
      await assertPair(own, true);
    } finally { vi.useRealTimers(); }
  });
});
