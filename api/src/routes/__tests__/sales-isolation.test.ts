import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../../main.js';
import { Client } from '../../models/Client.js';
import { Notification } from '../../models/Notification.js';
import { Payment } from '../../models/Payment.js';
import { Permission } from '../../models/Permission.js';
import { Quotation } from '../../models/Quotation.js';
import { QuotationItem } from '../../models/QuotationItem.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { Vehicle } from '../../models/Vehicle.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { getRolePermissions, updateRolePermissions } from '../../services/permission.service.js';
import { hashPassword } from '../../utils/password.js';

import type { Response as SuperAgentResponse } from 'superagent';

const password = 'SalesIsolation2026!';
const binaryParser = (
  response: SuperAgentResponse,
  callback: (error: Error | null, body: Buffer) => void,
) => {
  const chunks: Buffer[] = [];
  const stream = response as unknown as NodeJS.ReadableStream;
  stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  stream.on('end', () => callback(null, Buffer.concat(chunks)));
  stream.on('error', (error: Error) => callback(error, Buffer.alloc(0)));
};

describe('Sales record isolation', () => {
  let sellers: User[];
  let orders: WorkOrder[];
  let quotations: Quotation[];
  let payments: Payment[];
  let client: Client;
  let vehicle: Vehicle;
  let roleId: number;
  let originalPermissions: number[];
  let cookies: string[][];
  let adminCookies: string[];

  const login = async (user: User): Promise<string[]> => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password });
    expect(response.status).toBe(200);
    const header: unknown = response.headers['set-cookie'];
    return (Array.isArray(header) ? (header as string[]) : []).map(
      (cookie) => cookie.split(';')[0],
    );
  };
  const csrf = (index = 0): string =>
    cookies[index].find((cookie) => cookie.startsWith('csrf_token='))?.slice(11) ?? '';
  const get = (url: string, index = 0) => request(app).get(url).set('Cookie', cookies[index]);
  const patch = (url: string) =>
    request(app).patch(url).set('Cookie', cookies[0]).set('X-CSRF-Token', csrf());
  const post = (url: string) =>
    request(app).post(url).set('Cookie', cookies[0]).set('X-CSRF-Token', csrf());

  beforeAll(async () => {
    const role = await Role.findOne({ where: { nombre: 'vendedor' } });
    const admin = await User.findOne({ where: { email: 'dev@unithor.local' } });
    if (!role || !admin) throw new Error('Faltan roles de prueba');
    roleId = role.id;
    originalPermissions = (await getRolePermissions(roleId)).map((permission) => permission.id);
    const allowed = await Permission.findAll({ where: { modulo: ['taller', 'comercial'] } });
    await updateRolePermissions(
      roleId,
      allowed.map((permission) => permission.id),
    );
    const passwordHash = await hashPassword(password);
    await admin.update({ passwordHash });
    adminCookies = await login(admin);
    sellers = await Promise.all(
      ['a', 'b'].map((suffix) =>
        User.create({
          nombre: `Sales ${suffix}`,
          email: `sales-scope-${suffix}@example.com`,
          passwordHash,
          roleId,
          activo: true,
        }),
      ),
    );
    cookies = await Promise.all(sellers.map(login));
    client = await Client.create({ nombre: 'Shared customer', tipo: 'cliente' });
    vehicle = await Vehicle.create({ patente: 'SCOP12', clientId: client.id });
    orders = await Promise.all(
      sellers.map((seller, index) =>
        WorkOrder.create({
          codigo: `OT-SCOPE-${index}`,
          createdBy: seller.id,
          clientId: client.id,
          vehicleId: vehicle.id,
          estado: 'en_progreso',
          fechaIngreso: new Date(),
        }),
      ),
    );
    quotations = await Promise.all(
      sellers.map((seller, index) =>
        Quotation.create({
          codigo: `COT-SCOPE-${index}`,
          asesorId: seller.id,
          workOrderId: orders[index].id,
          clientId: client.id,
          vehicleId: vehicle.id,
          subtotal: index ? 90000 : 10000,
          total: index ? 90000 : 10000,
          pagado: index ? 50000 : 3000,
          estadoPago: 'parcial',
        }),
      ),
    );
    payments = await Promise.all(
      quotations.map((quotation, index) =>
        Payment.create({
          quotationId: quotation.id,
          monto: index ? 50000 : 3000,
          metodo: 'efectivo',
          estado: 'confirmado',
          fecha: new Date(),
          createdBy: admin.id,
        }),
      ),
    );
    await QuotationItem.bulkCreate(
      quotations.map((quotation, index) => ({
        quotationId: quotation.id,
        descripcion: index ? 'PRIVATE-OTHER-SERVICE' : 'OWN-SERVICE',
        cantidad: 1,
        precioUnitario: Number(quotation.total),
        subtotal: Number(quotation.total),
      })),
    );
  });

  afterAll(async () => {
    if (originalPermissions) await updateRolePermissions(roleId, originalPermissions);
    if (quotations) {
      await Payment.destroy({
        where: { quotationId: quotations.map((quotation) => quotation.id) },
      });
      await Quotation.destroy({
        where: { id: quotations.map((quotation) => quotation.id) },
        force: true,
      });
    }
    if (orders)
      await WorkOrder.destroy({ where: { id: orders.map((order) => order.id) }, force: true });
    if (vehicle) await vehicle.destroy({ force: true });
    if (client) await client.destroy({ force: true });
    if (sellers) {
      const ids = sellers.map((seller) => seller.id);
      await Notification.destroy({ where: { userId: ids } });
      await RefreshToken.destroy({ where: { userId: ids } });
      await User.destroy({ where: { id: ids }, force: true });
    }
  });

  it('filters lists and pagination by owner while keeping clients and vehicles shared', async () => {
    for (const index of [0, 1]) {
      for (const [path, id] of [
        ['/api/work-orders', orders[index].id],
        ['/api/quotations', quotations[index].id],
        ['/api/payments', payments[index].id],
      ] as const) {
        const response = await get(
          `${path}?pageSize=1&asesorId=${sellers[1 - index].id}&createdBy=${sellers[1 - index].id}`,
          index,
        );
        expect(response.status).toBe(200);
        expect(response.body.total).toBe(1);
        expect(response.body.items.map((item: { id: number }) => item.id)).toEqual([id]);
      }
      expect((await get(`/api/clients/${client.id}`, index)).status).toBe(200);
      expect((await get(`/api/vehicles/${vehicle.id}`, index)).status).toBe(200);
    }
    expect((await get(`/api/work-orders?clientId=${client.id}`)).body.total).toBe(1);
    expect(
      (await get(`/api/quotations?vehicleId=${vehicle.id}&workOrderId=${orders[1].id}`)).body.total,
    ).toBe(0);
    expect((await get(`/api/payments?quotationId=${quotations[1].id}`)).body.total).toBe(0);
    const admin = await request(app).get('/api/quotations').set('Cookie', adminCookies);
    expect(admin.body.total).toBe(2);
  });

  it('blocks foreign IDs including documents, photos, payments and mutation subroutes', async () => {
    for (const url of [
      `/api/work-orders/${orders[1].id}`,
      `/api/work-orders/${orders[1].id}/pdf`,
      `/api/work-orders/${orders[1].id}/reception-pdf`,
      `/api/work-orders/${orders[1].id}/inspection/photos/frontal`,
      `/api/quotations/${quotations[1].id}`,
      `/api/quotations/${quotations[1].id}/payments`,
      `/api/quotations/${quotations[1].id}/inspection/photos/frontal`,
      `/api/payments/${payments[1].id}/receipt`,
    ])
      expect((await get(url)).status).toBe(404);
    for (const url of [
      `/api/work-orders/${orders[1].id}`,
      `/api/work-orders/${orders[1].id}/status`,
      `/api/quotations/${quotations[1].id}`,
      `/api/quotations/${quotations[1].id}/archive`,
    ])
      expect((await patch(url).send({ notas: 'not allowed' })).status).toBe(404);
    expect(
      (
        await post(`/api/quotations/${quotations[1].id}/convert-to-ot`).send({
          vehicleId: vehicle.id,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .delete(`/api/payments/${payments[1].id}`)
          .set('Cookie', cookies[0])
          .set('X-CSRF-Token', csrf())
      ).status,
    ).toBe(404);
    expect(
      (
        await post('/api/payments').send({
          quotationId: quotations[1].id,
          monto: 1,
          metodo: 'efectivo',
        })
      ).status,
    ).toBe(404);
    expect((await post('/api/quotations').send({ workOrderId: orders[1].id })).status).toBe(404);
    expect((await quotations[1].reload()).notas).toBeNull();
    expect(await Payment.count()).toBe(2);
  });

  it('keeps own detail and payment history accessible, including payments recorded by finance', async () => {
    expect((await get(`/api/work-orders/${orders[0].id}`)).status).toBe(200);
    expect((await get(`/api/quotations/${quotations[0].id}`)).status).toBe(200);
    const paymentsResponse = await get(`/api/quotations/${quotations[0].id}/payments`);
    expect(paymentsResponse.status).toBe(200);
    expect(paymentsResponse.body.payments.map((payment: { id: number }) => payment.id)).toEqual([
      payments[0].id,
    ]);
  });

  it('scopes dashboard metrics and recent records', async () => {
    const response = await get('/api/dashboard/summary');
    expect(response.status).toBe(200);
    expect(response.body.metrics).toMatchObject({
      activeWorkOrders: 1,
      pendingQuotations: 1,
      pendingBalance: 7000,
      monthlyRevenue: 3000,
    });
    expect(response.body.recentWorkOrders.map((order: { id: number }) => order.id)).toEqual([
      orders[0].id,
    ]);
  });

  it('hides historical notifications about another salesperson records', async () => {
    await Notification.bulkCreate(
      orders.map((order) => ({
        userId: sellers[0].id,
        tipo: 'ot_estado_cambiado',
        nivel: 'info',
        titulo: order.codigo,
        mensaje: 'status',
        href: `/work-orders/${order.id}`,
        workOrderId: order.id,
      })),
    );
    const response = await get('/api/notifications');
    expect(response.status).toBe(200);
    expect(response.body.items.map((item: { workOrderId: number }) => item.workOrderId)).toEqual([
      orders[0].id,
    ]);
    expect(response.body.noLeidas).toBe(1);
  });

  it('exports only own quotations and services even when a different advisor is requested', async () => {
    const year = new Date().getUTCFullYear();
    const response = await get(
      `/api/reports/commercial/excel?fechaDesde=${year}-01-01&fechaHasta=${year}-12-31&asesorId=${sellers[1].id}`,
    )
      .buffer(true)
      .parse(binaryParser);
    expect(response.status).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.body);
    const content = JSON.stringify(workbook.worksheets.map((sheet) => sheet.getSheetValues()));
    expect(content).toContain(quotations[0].codigo);
    expect(content).toContain('OWN-SERVICE');
    expect(content).not.toContain(quotations[1].codigo);
    expect(content).not.toContain('PRIVATE-OTHER-SERVICE');
  });

  it('scopes workshop and shared fleet report histories too', async () => {
    const year = new Date().getUTCFullYear();
    for (const area of ['workshop', 'fleet']) {
      const response = await get(
        `/api/reports/${area}/excel?fechaDesde=${year}-01-01&fechaHasta=${year}-12-31`,
      )
        .buffer(true)
        .parse(binaryParser);
      expect(response.status).toBe(200);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(response.body);
      const content = JSON.stringify(workbook.worksheets.map((sheet) => sheet.getSheetValues()));
      expect(content).toContain(orders[0].codigo);
      expect(content).not.toContain(orders[1].codigo);
      expect(content).not.toContain(quotations[1].codigo);
    }
  });

  it('does not disclose or synchronize cross-owner legacy associations', async () => {
    await quotations[0].update({ asesorId: sellers[1].id });
    try {
      const orderResponse = await get(`/api/work-orders/${orders[0].id}`);
      expect(orderResponse.status).toBe(200);
      expect(orderResponse.body.workOrder.quotation).toBeNull();
      const quotationResponse = await get(`/api/quotations/${quotations[0].id}`, 1);
      expect(quotationResponse.status).toBe(200);
      expect(quotationResponse.body.quotation.workOrder).toBeUndefined();
      const response = await request(app)
        .patch(`/api/quotations/${quotations[0].id}`)
        .set('Cookie', cookies[1])
        .set('X-CSRF-Token', csrf(1))
        .send({ items: [{ descripcion: 'Forbidden sync', cantidad: 1, precioUnitario: 20000 }] });
      expect(response.status).toBe(404);
      expect(Number((await quotations[0].reload()).total)).toBe(10000);
    } finally {
      await quotations[0].update({ asesorId: sellers[0].id });
    }
  });
});
