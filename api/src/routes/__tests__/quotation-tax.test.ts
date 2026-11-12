import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { Client } from '../../models/Client.js';
import { Payment } from '../../models/Payment.js';
import { Quotation } from '../../models/Quotation.js';
import { User } from '../../models/User.js';
import { Vehicle } from '../../models/Vehicle.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { generateCommercialReportExcel } from '../../services/commercial-report.service.js';
import { buildOperationsExport } from '../../services/exports/operations-export.service.js';
import { getFinancialReportData } from '../../services/financial-analytics.service.js';
import {
  generateDetailedCommercialReportExcel,
  generateWorkshopReportExcel,
} from '../../services/operational-report.service.js';
import { signAccessToken } from '../../utils/jwt.js';

const TODAY = new Date().toISOString().slice(0, 10);
const CSRF = 'quotation-tax-regression';
let userId: number;
let cookies: string[];
let client: Client;
let vehicle: Vehicle;
const mutate = (method: 'post' | 'patch' | 'delete', path: string, body: object = {}) =>
  request(app)[method](path).set('Cookie', cookies).set('X-CSRF-Token', CSRF).send(body);
const get = (path: string) => request(app).get(path).set('Cookie', cookies);
const line = (precioUnitario: number, extra: object = {}) => ({
  descripcion: 'Servicio IVA',
  tipoLinea: 'estandar',
  unidadMedida: 'servicio',
  cantidad: 1,
  precioUnitario,
  ...extra,
});
const createQuotation = async (net: number) => {
  const response = await mutate('post', '/api/quotations', {
    clientId: client.id,
    vehicleId: vehicle.id,
    items: [line(net)],
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body.quotation as {
    id: number;
    codigo: string;
    total: number;
    items: { id: number }[];
  };
};
const createOrder = async (extra: object = {}) => {
  const response = await mutate('post', '/api/work-orders', {
    clientId: client.id,
    vehicleId: vehicle.id,
    items: [line(10000)],
    ...extra,
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body.workOrder as {
    id: number;
    codigo: string;
    quotation: { id: number; total: number };
    items: { id: number }[];
  };
};
const pay = (quotationId: number, monto: number, transfer = false) =>
  mutate('post', '/api/payments', {
    quotationId,
    monto,
    metodo: transfer ? 'transferencia' : 'efectivo',
    ...(transfer
      ? {
          bancoOrigen: 'BCI',
          numeroTransaccion: 'IVA-TEST',
          comprobantePago: 'tax-test-receipt.pdf',
        }
      : {}),
  });
const loadWorkbook = async (bytes: Buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  return workbook;
};
const findRow = (workbook: ExcelJS.Workbook, code: string): ExcelJS.Row => {
  for (const worksheet of workbook.worksheets) {
    for (let index = 1; index <= worksheet.rowCount; index += 1) {
      const row = worksheet.getRow(index);
      if (row.getCell(1).value === code) return row;
    }
  }
  throw new Error(`Missing report row ${code}`);
};

beforeAll(async () => {
  if (sequelize.getDatabaseName() !== 'unithor_test')
    throw new Error('Only unithor_test is allowed');
  const developer = await User.findOne({ where: { email: 'dev@unithor.local', activo: true } });
  if (!developer) throw new Error('Missing test developer');
  userId = developer.id;
  cookies = [
    `access_token=${signAccessToken({ sub: userId, role: 'desarrollador' })}`,
    `csrf_token=${CSRF}`,
  ];
  client = await Client.create({ nombre: 'IVA regression client', tipo: 'cliente' });
  vehicle = await Vehicle.create({ patente: 'IVA901', clientId: client.id });
});

afterEach(async () => {
  if (sequelize.getDatabaseName() !== 'unithor_test')
    throw new Error('Only unithor_test is allowed');
  if (!client) return;
  await Quotation.destroy({ where: { clientId: client.id }, force: true });
  await WorkOrder.destroy({ where: { clientId: client.id }, force: true });
});

afterAll(async () => {
  if (vehicle) await vehicle.destroy({ force: true });
  if (client) await client.destroy({ force: true });
});

describe('Quotation IVA remains net in storage and gross in payable summaries', () => {
  it('settles decimal net amounts without leaving a phantom balance or partial status', async () => {
    const quotation = await createQuotation(14.99);
    const payment = await pay(quotation.id, 17.99);
    expect(payment.status).toBe(201);
    expect(payment.body.quotation).toMatchObject({
      total: 17.99,
      pagado: 17.99,
      saldoPendiente: 0,
      estadoPago: 'total',
    });
    expect((await get(`/api/quotations/${quotation.id}/payments`)).body).toMatchObject({
      total: 17.99,
      saldoPendiente: 0,
      estadoPago: 'total',
    });
    expect((await pay(quotation.id, 0.01)).status).toBe(400);
    expect(Number((await Quotation.findByPk(quotation.id))!.total)).toBe(14.99);
  });

  it('keeps the DTO net through partial/full payment and annulment without charging IVA twice', async () => {
    const quotation = await createQuotation(100000);
    expect(quotation.total).toBe(100000);
    const partial = await pay(quotation.id, 100000);
    expect(partial.status).toBe(201);
    expect(partial.body.quotation).toMatchObject({
      total: 119000,
      pagado: 100000,
      saldoPendiente: 19000,
      estadoPago: 'parcial',
    });
    const rejected = await pay(quotation.id, 19001);
    expect(rejected.status).toBe(400);
    expect(await Payment.count({ where: { quotationId: quotation.id } })).toBe(1);
    const final = await pay(quotation.id, 19000);
    expect(final.status).toBe(201);
    expect(final.body.quotation).toMatchObject({
      total: 119000,
      pagado: 119000,
      saldoPendiente: 0,
      estadoPago: 'total',
    });
    expect((await get(`/api/quotations/${quotation.id}`)).body.quotation.total).toBe(100000);
    const annulled = await mutate('delete', `/api/payments/${final.body.payment.id}`);
    expect(annulled.status).toBe(200);
    expect(annulled.body.quotation).toMatchObject({
      total: 119000,
      pagado: 100000,
      saldoPendiente: 19000,
      estadoPago: 'parcial',
    });
    const empty = await mutate('delete', `/api/payments/${partial.body.payment.id}`);
    expect(empty.body.quotation).toMatchObject({
      total: 119000,
      pagado: 0,
      saldoPendiente: 119000,
      estadoPago: 'por_pagar',
    });
    expect(Number((await Quotation.findByPk(quotation.id))!.total)).toBe(100000);
  });

  it('reserves, verifies and rejects transfers against gross while preserving confirmed payment state', async () => {
    const quotation = await createQuotation(10000);
    const pending = await pay(quotation.id, 10000, true);
    expect(pending.status).toBe(201);
    expect(pending.body.quotation).toMatchObject({
      total: 11900,
      pagado: 0,
      saldoPendiente: 11900,
      estadoPago: 'por_verificar',
    });
    expect((await pay(quotation.id, 1901)).status).toBe(400);
    const cash = await pay(quotation.id, 1900);
    expect(cash.status).toBe(201);
    const approved = await mutate('patch', `/api/payments/${pending.body.payment.id}/verify`, {
      decision: 'aprobar',
    });
    expect(approved.status).toBe(200);
    expect(approved.body.quotation).toMatchObject({
      total: 11900,
      pagado: 11900,
      saldoPendiente: 0,
      estadoPago: 'total',
    });
    expect(
      (await get(`/api/payments?quotationId=${quotation.id}`)).body.items[0].quotation.total,
    ).toBe(11900);
    await mutate('delete', `/api/payments/${pending.body.payment.id}`);
    const retry = await pay(quotation.id, 10000, true);
    expect(retry.status).toBe(201);
    const rejected = await mutate('patch', `/api/payments/${retry.body.payment.id}/verify`, {
      decision: 'rechazar',
    });
    expect(rejected.status).toBe(200);
    expect(rejected.body.quotation).toMatchObject({
      total: 11900,
      pagado: 1900,
      saldoPendiente: 10000,
      estadoPago: 'parcial',
    });
    expect(Number((await Quotation.findByPk(quotation.id))!.total)).toBe(10000);
  });

  it('compares quotation edits to paid gross and rolls back a reduction below confirmed payments', async () => {
    const quotation = await createQuotation(100000);
    expect((await pay(quotation.id, 100000)).status).toBe(201);
    const reduced = await mutate('patch', `/api/quotations/${quotation.id}`, {
      descuentoTipo: 'fijo',
      descuentoValor: 10000,
    });
    expect(reduced.status).toBe(200);
    expect(reduced.body.quotation).toMatchObject({
      total: 90000,
      pagado: 100000,
      estadoPago: 'parcial',
    });
    const rejected = await mutate('patch', `/api/quotations/${quotation.id}`, {
      descuentoValor: 20000,
      notas: 'Must roll back',
    });
    expect(rejected.status).toBe(400);
    const saved = (await get(`/api/quotations/${quotation.id}`)).body.quotation;
    expect(saved).toMatchObject({ total: 90000, descuentoValor: 10000, pagado: 100000 });
    expect(saved.notas).not.toBe('Must roll back');
  });

  it('exports a linked OT using its discounted gross COT rather than undiscounted operational lines', async () => {
    const order = await createOrder({
      descuentoTipo: 'fijo',
      descuentoValor: 3000,
      items: [line(10000, { descuentoTipo: 'porcentaje', descuentoValor: 10 })],
    });
    const dto = (await get(`/api/work-orders/${order.id}`)).body.workOrder;
    expect(dto.quotation).toMatchObject({
      neto: 6000,
      iva: 1140,
      total: 7140,
      saldoPendiente: 7140,
    });
    expect(Number((await Quotation.findByPk(order.quotation.id))!.total)).toBe(6000);
    const dataset = await buildOperationsExport(
      'work-orders',
      { search: order.codigo },
      { id: userId, role: 'desarrollador' },
    );
    expect(dataset!.tables[0].rows).toHaveLength(1);
    expect(dataset!.tables[0].rows[0]).toMatchObject({ total: 7140, pagado: 0, saldo: 7140 });
    const workshop = await loadWorkbook(
      await generateWorkshopReportExcel({
        fechaDesde: TODAY,
        fechaHasta: TODAY,
        clientId: client.id,
      }),
    );
    const row = findRow(workshop, order.codigo);
    expect(row.getCell(11).value).toBe(7140);
    expect(row.getCell(12).value).toBe(0);
    expect(row.getCell(13).value).toBe(7140);
  });

  it('keeps pending verification after OT financial synchronization and subsequent quotation edits', async () => {
    const order = await createOrder();
    expect((await pay(order.quotation.id, 3000, true)).status).toBe(201);
    const bypass = await mutate('patch', `/api/quotations/${order.quotation.id}`, {
      estadoPago: 'por_pagar',
    });
    expect(bypass.status).toBe(400);
    const updated = await mutate('patch', `/api/work-orders/${order.id}`, {
      descuentoTipo: 'fijo',
      descuentoValor: 1000,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.workOrder.quotation).toMatchObject({
      neto: 9000,
      total: 10710,
      pagado: 0,
      estadoPago: 'por_verificar',
    });
    const quoteUpdate = await mutate('patch', `/api/quotations/${order.quotation.id}`, {
      descuentoValor: 500,
    });
    expect(quoteUpdate.status).toBe(200);
    expect(quoteUpdate.body.quotation).toMatchObject({ total: 9500, estadoPago: 'por_verificar' });
    const pending = await Payment.findOne({ where: { quotationId: order.quotation.id } });
    const approval = await mutate('patch', `/api/payments/${pending!.id}/verify`, {
      decision: 'aprobar',
    });
    expect(approval.status).toBe(200);
    expect(approval.body.quotation).toMatchObject({
      total: 11305,
      pagado: 3000,
      saldoPendiente: 8305,
      estadoPago: 'parcial',
    });
  });

  it('sums IVA rounded per COT in finance, dashboard, analytics and commercial reports', async () => {
    const quotations = [await createQuotation(3), await createQuotation(3)];
    // Each COT is 3 + round(0.57) = 4; taxing aggregate net 6 would incorrectly yield 7.
    const summary = await get('/api/finance/summary');
    expect(summary.status).toBe(200);
    expect(summary.body.metrics.receivableTotal).toBe(8);
    expect(summary.body.pendingQuotations.map((item: { total: number }) => item.total)).toEqual([
      4, 4,
    ]);
    const dashboard = await get('/api/dashboard/summary');
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.metrics.pendingBalance).toBe(8);
    expect(dashboard.body.unlinkedQuotations.map((item: { total: number }) => item.total)).toEqual([
      4, 4,
    ]);
    const report = await getFinancialReportData({
      fechaDesde: TODAY,
      fechaHasta: TODAY,
      agruparPor: 'dia',
      comparar: false,
      clientId: client.id,
    });
    expect(report.analytics.kpis).toMatchObject({ grossSales: 8, receivable: 8, averageTicket: 4 });
    expect(report.analytics.topClients[0]).toMatchObject({ grossSales: 8, receivable: 8 });
    expect(report.analytics.topSellers[0].grossSales).toBe(8);
    expect(report.analytics.quotationStatuses[0].amount).toBe(8);
    expect(report.analytics.trend[0].grossSales).toBe(8);
    expect(report.quotations.map(({ total }) => total)).toEqual([4, 4]);
    const filters = { fechaDesde: TODAY, fechaHasta: TODAY };
    const commercial = await loadWorkbook(await generateCommercialReportExcel(filters));
    const detailed = await loadWorkbook(await generateDetailedCommercialReportExcel(filters));
    for (const quotation of quotations) {
      expect(findRow(commercial, quotation.codigo).getCell(9).value).toBe(4);
      expect(findRow(detailed, quotation.codigo).getCell(9).value).toBe(4);
    }
    const dataset = await buildOperationsExport(
      'quotations',
      {},
      { id: userId, role: 'desarrollador' },
    );
    expect(dataset!.tables[0].rows.map(({ total }) => total)).toEqual([4, 4]);
    expect((await Quotation.findAll()).map(({ total }) => Number(total))).toEqual([3, 3]);
  });
});
