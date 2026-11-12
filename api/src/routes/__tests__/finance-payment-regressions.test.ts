import { PAYMENT_METHODS } from '@unithor/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { CashClosure } from '../../models/CashClosure.js';
import { CashMovement } from '../../models/CashMovement.js';
import { Client } from '../../models/Client.js';
import { Payment } from '../../models/Payment.js';
import { Quotation } from '../../models/Quotation.js';
import { QuotationItem } from '../../models/QuotationItem.js';
import { User } from '../../models/User.js';
import { signAccessToken } from '../../utils/jwt.js';

const CSRF = 'phase6-finance-regressions';
const DAY = '2001-06-15';
let client: Client;
let userId: number;
let cookies: string[];
let sequence = 0;
const mutate = (method: 'post' | 'patch' | 'delete', url: string, body: object = {}) =>
  request(app)[method](url).set('Cookie', cookies).set('X-CSRF-Token', CSRF).send(body);
const get = (url: string, query: object = {}) =>
  request(app).get(url).set('Cookie', cookies).query(query);
const quotation = (total = 100, extra: object = {}) => Quotation.create({
  codigo: `COT-PHASE6-${++sequence}`, clientId: client.id, asesorId: userId,
  subtotal: total, total, pagado: 0, estadoPago: 'por_pagar', ...extra,
});
const pay = (id: number, monto: number, transfer = false, fecha = `${DAY}T12:00:00.000Z`) =>
  mutate('post', '/api/payments', {
    quotationId: id, monto, metodo: transfer ? 'transferencia' : 'efectivo', fecha,
    ...(transfer ? {
      bancoOrigen: 'BCI', numeroTransaccion: `PHASE6-${++sequence}`,
      comprobantePago: 'external-reference.pdf',
    } : {}),
  });
const movement = (monto: number, tipo = 'ingreso', metodo = 'efectivo') =>
  mutate('post', '/api/finance/movements', {
    tipo, metodo, monto, categoria: 'ajuste', descripcion: 'Regresión financiera fase 6',
    fecha: `${DAY}T12:00:00.000Z`,
  });
const verify = (id: number, decision = 'aprobar') =>
  mutate('patch', `/api/payments/${id}/verify`, { decision, comentario: 'Revisión fase 6' });
const close = () => mutate('post', '/api/finance/cash-closures', { fecha: DAY, efectivoDeclarado: 0 });

beforeAll(async () => {
  if (sequelize.getDatabaseName() !== 'unithor_test') throw new Error('Only unithor_test is allowed');
  const user = await User.findOne({ where: { email: 'dev@unithor.local', activo: true } });
  if (!user) throw new Error('Missing test developer');
  userId = user.id;
  cookies = [`access_token=${signAccessToken({ sub: userId, role: 'desarrollador' })}`, `csrf_token=${CSRF}`];
  client = await Client.create({ nombre: 'Finanzas fase 6', tipo: 'cliente' });
});

afterEach(async () => {
  vi.useRealTimers();
  await CashClosure.destroy({ where: {} });
  await CashMovement.destroy({ where: {} });
  if (client) await Quotation.destroy({ where: { clientId: client.id }, force: true });
});
afterAll(async () => { if (client) await client.destroy({ force: true }); });

describe('Finance and payments corrective regressions', () => {
  it.each(['payment', 'movement'])('rejects a %s that rounds to zero without creating records', async (kind) => {
    const q = await quotation();
    const response = kind === 'payment' ? await pay(q.id, 0.001) : await movement(0.001);
    expect(response.status).toBe(400);
    expect(await Payment.count()).toBe(0);
    expect(await CashMovement.count()).toBe(0);
    expect((await q.reload()).estadoPago).toBe('por_pagar');
  });

  it('charges the discounted net plus rounded IVA and releases rejected reservations', async () => {
    const q = await quotation(14.99, { subtotal: 25, descuentoTipo: 'fijo', descuentoValor: 10.01 });
    const cash = await pay(q.id, 7.99);
    expect(cash.status).toBe(201);
    const pending = await pay(q.id, 10, true);
    expect(pending.status).toBe(201);
    expect(pending.body.quotation).toMatchObject({ total: 17.99, pagado: 7.99, saldoPendiente: 10, estadoPago: 'por_verificar' });
    expect((await pay(q.id, 0.01)).status).toBe(400);
    const rejected = await verify(pending.body.payment.id, 'rechazar');
    expect(rejected.status).toBe(200);
    expect(rejected.body.quotation).toMatchObject({ pagado: 7.99, saldoPendiente: 10, estadoPago: 'parcial' });
    const final = await pay(q.id, 10);
    expect(final.status).toBe(201);
    expect(final.body.quotation).toMatchObject({ total: 17.99, pagado: 17.99, saldoPendiente: 0, estadoPago: 'total' });
    const removed = await mutate('delete', `/api/payments/${pending.body.payment.id}`);
    expect(removed.status).toBe(200);
    expect(removed.body.quotation.estadoPago).toBe('total');
    expect(Number((await q.reload()).total)).toBe(14.99);
    const day = await get('/api/finance/day', { fecha: DAY });
    expect(day.body.totals).toMatchObject({ confirmedTotal: 17.99, expectedCash: 17.99, pendingTransferCount: 0 });
  });

  it('serializes concurrent partial payments without losing paid amounts', async () => {
    const q = await quotation();
    const responses = await Promise.all([pay(q.id, 59), pay(q.id, 60)]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(Number((await q.reload()).pagado)).toBe(119);
    expect(q.estadoPago).toBe('total');
    expect(await Payment.sum('monto', { where: { quotationId: q.id } })).toBe(119);
  });

  it.each([false, true])('prevents concurrent overbooking with transfer=%s', async (transfer) => {
    const q = await quotation();
    const responses = await Promise.all([pay(q.id, 80, transfer), pay(q.id, 80, transfer)]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await Payment.count({ where: { quotationId: q.id } })).toBe(1);
    expect(Number((await q.reload()).pagado)).toBe(transfer ? 0 : 80);
  });

  it('approves separate concurrent transfers without leaving a phantom pending status', async () => {
    const q = await quotation();
    const first = await pay(q.id, 59, true);
    const second = await pay(q.id, 60, true);
    const responses = await Promise.all([verify(first.body.payment.id), verify(second.body.payment.id)]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(Number((await q.reload()).pagado)).toBe(119);
    expect(q.estadoPago).toBe('total');
    expect(await Payment.count({ where: { quotationId: q.id, estado: 'por_verificar' } })).toBe(0);
  });

  it('annuls separate concurrent pending transfers without retaining a reservation', async () => {
    const q = await quotation();
    const first = await pay(q.id, 59, true);
    const second = await pay(q.id, 60, true);
    const responses = await Promise.all([
      mutate('delete', `/api/payments/${first.body.payment.id}`),
      mutate('delete', `/api/payments/${second.body.payment.id}`),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect((await q.reload()).estadoPago).toBe('por_pagar');
    expect(Number(q.pagado)).toBe(0);
    expect(await Payment.count({ where: { quotationId: q.id } })).toBe(0);
  });

  it('allows only one concurrent decision on the same transfer', async () => {
    const q = await quotation();
    const pending = await pay(q.id, 119, true);
    const responses = await Promise.all([verify(pending.body.payment.id), verify(pending.body.payment.id, 'rechazar')]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
    const payment = await Payment.findByPk(pending.body.payment.id);
    expect(payment?.reviewedBy).toBe(userId);
    expect(Number((await q.reload()).pagado)).toBe(payment?.estado === 'confirmado' ? 119 : 0);
    expect(q.estadoPago).toBe(payment?.estado === 'confirmado' ? 'total' : 'por_pagar');
  });

  it('does not resurrect a transfer when approval and annulment compete', async () => {
    const q = await quotation();
    const pending = await pay(q.id, 119, true);
    const responses = await Promise.all([verify(pending.body.payment.id), mutate('delete', `/api/payments/${pending.body.payment.id}`)]);
    expect(responses[1].status).toBe(200);
    expect([200, 404]).toContain(responses[0].status);
    expect(Number((await q.reload()).pagado)).toBe(0);
    expect(q.estadoPago).toBe('por_pagar');
    expect(await Payment.count({ where: { quotationId: q.id } })).toBe(0);
  });

  it('returns a business error for competing cash expenses and preserves available cash', async () => {
    expect((await movement(100)).status).toBe(201);
    const responses = await Promise.all([movement(80, 'egreso'), movement(80, 'egreso')]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 400]);
    const day = await get('/api/finance/day', { fecha: DAY });
    expect(day.body.totals).toMatchObject({ manualIncomeTotal: 100, expenseTotal: 80, expectedCash: 20 });
  });

  it('returns a conflict for concurrent closures and creates a single snapshot', async () => {
    expect((await movement(100)).status).toBe(201);
    const responses = await Promise.all([close(), close()]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await CashClosure.count({ where: { fecha: DAY } })).toBe(1);
  });

  it('keeps the closure consistent when a cash payment races it', async () => {
    const q = await quotation();
    const [payment, closure] = await Promise.all([pay(q.id, 119), close()]);
    expect(closure.status).toBe(201);
    expect([201, 400]).toContain(payment.status);
    const day = await get('/api/finance/day', { fecha: DAY });
    expect(day.body.closure.totalConfirmado).toBe(day.body.totals.confirmedTotal);
    expect(day.body.closure.efectivoEsperado).toBe(day.body.totals.expectedCash);
  });

  it('never closes over a transfer inserted concurrently without verifying it', async () => {
    const q = await quotation();
    const [payment, closure] = await Promise.all([pay(q.id, 119, true), close()]);
    expect([201, 400]).toContain(payment.status);
    expect([201, 400]).toContain(closure.status);
    expect([payment.status, closure.status].sort()).toEqual([201, 400]);
    if (closure.status === 201) {
      expect(await Payment.count({ where: { quotationId: q.id } })).toBe(0);
    } else {
      expect(closure.body.error.message).toContain('pendientes de verificación');
    }
  });

  it('keeps closure totals stable when confirming a transfer concurrently', async () => {
    const q = await quotation();
    const pending = await pay(q.id, 119, true);
    const [review, closure] = await Promise.all([verify(pending.body.payment.id), close()]);
    expect(review.status).toBe(200);
    expect([201, 400]).toContain(closure.status);
    const day = await get('/api/finance/day', { fecha: DAY });
    expect(day.body.totals).toMatchObject({ confirmedTotal: 119, pendingTransferCount: 0 });
    if (closure.status === 201) {
      expect(day.body.closure.totalConfirmado).toBe(119);
    } else {
      expect(closure.body.error.message).toContain('pendientes de verificación');
    }
  });

  it('keeps closure totals stable when annulling a confirmed payment concurrently', async () => {
    const q = await quotation();
    const payment = await pay(q.id, 119);
    const [annulment, closure] = await Promise.all([
      mutate('delete', `/api/payments/${payment.body.payment.id}`), close(),
    ]);
    expect([200, 400]).toContain(annulment.status);
    expect(closure.status).toBe(201);
    const day = await get('/api/finance/day', { fecha: DAY });
    expect(day.body.closure.totalConfirmado).toBe(day.body.totals.confirmedTotal);
    expect(day.body.totals.confirmedTotal).toBe(annulment.status === 200 ? 0 : 119);
  });

  it('keeps closure totals stable when annulling a manual movement concurrently', async () => {
    const income = await movement(100);
    const [annulment, closure] = await Promise.all([
      mutate('patch', `/api/finance/movements/${income.body.movement.id}/void`, { motivo: 'Anulación concurrente' }), close(),
    ]);
    expect([200, 400]).toContain(annulment.status);
    expect(closure.status).toBe(201);
    const day = await get('/api/finance/day', { fecha: DAY });
    expect(day.body.closure.totalIngresosManuales).toBe(day.body.totals.manualIncomeTotal);
    expect(day.body.totals.manualIncomeTotal).toBe(annulment.status === 200 ? 0 : 100);
  });

  it('reconciles all payment methods while excluding rejected, pending and voided amounts', async () => {
    const q = await quotation(1000);
    await Payment.bulkCreate([
      ...PAYMENT_METHODS.map((metodo) => ({
        quotationId: q.id, monto: 7.99, metodo, estado: 'confirmado' as const,
        fecha: new Date(`${DAY}T12:00:00.000Z`), createdBy: userId,
      })),
      { quotationId: q.id, monto: 10, metodo: 'transferencia', estado: 'rechazado', fecha: new Date(`${DAY}T12:00:00.000Z`), createdBy: userId },
    ]);
    const opening = await movement(0.10);
    const expense = await movement(0.03, 'egreso');
    const voided = await movement(500, 'ingreso', 'tarjeta_debito');
    expect(opening.status).toBe(201);
    expect(expense.status).toBe(201);
    expect((await mutate('patch', `/api/finance/movements/${voided.body.movement.id}/void`, { motivo: 'Movimiento duplicado' })).status).toBe(200);
    const pending = await pay(q.id, 20, true);
    expect(pending.status).toBe(201);
    const day = await get('/api/finance/day', { fecha: DAY });
    expect(day.body.totals).toMatchObject({
      confirmedTotal: 47.94, manualIncomeTotal: 0.1, expenseTotal: 0.03,
      expectedCash: 8.06, netTotal: 48.01, pendingTransferCount: 1, pendingTransferAmount: 20,
      byMethod: Object.fromEntries(PAYMENT_METHODS.map((method) => [method, 7.99])),
    });
    expect((await close()).status).toBe(400);
    expect((await verify(pending.body.payment.id, 'rechazar')).status).toBe(200);
    const closure = await close();
    expect(closure.status).toBe(201);
    expect(closure.body.closure).toMatchObject({
      totalConfirmado: 47.94, totalIngresosManuales: 0.1, totalEgresos: 0.03,
      efectivoEsperado: 8.06, totalNeto: 48.01,
    });
  });

  it('blocks verification, rejection, annulment and manual mutations on closed days', async () => {
    const q = await quotation();
    const confirmed = await pay(q.id, 10);
    const pending = await pay(q.id, 10, true);
    const income = await movement(100);
    // A legacy pending row in a closed day must remain unchanged by either decision.
    await Payment.update({ estado: 'rechazado' }, { where: { id: pending.body.payment.id } });
    expect((await close()).status).toBe(201);
    await Payment.update({ estado: 'por_verificar' }, { where: { id: pending.body.payment.id } });
    for (const operation of [
      () => verify(pending.body.payment.id), () => verify(pending.body.payment.id, 'rechazar'),
      () => mutate('delete', `/api/payments/${confirmed.body.payment.id}`),
      () => mutate('delete', `/api/payments/${pending.body.payment.id}`),
      () => movement(10),
      () => mutate('patch', `/api/finance/movements/${income.body.movement.id}/void`, { motivo: 'Cierre inmutable' }),
    ]) {
      const response = await operation();
      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('ya está cerrada');
    }
    expect(Number((await q.reload()).pagado)).toBe(10);
    expect((await Payment.findByPk(pending.body.payment.id))?.estado).toBe('por_verificar');
  });

  it('bounds summary revenues and expenses to the same UTC day and month as cash', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-12T12:00:00.000Z'));
    const q = await quotation(1000);
    for (const [fecha, monto] of [
      ['2026-10-31T23:59:59.000Z', 1], ['2026-11-01T00:00:00.000Z', 2],
      ['2026-11-11T23:59:59.000Z', 4], ['2026-11-12T00:00:00.000Z', 8],
      ['2026-11-12T23:59:59.000Z', 16], ['2026-11-13T00:00:00.000Z', 32],
      ['2026-12-01T00:00:00.000Z', 64],
    ] as const) {
      await Payment.create({ quotationId: q.id, monto, metodo: 'efectivo', estado: 'confirmado', fecha: new Date(fecha), createdBy: userId });
      await CashMovement.create({ tipo: 'egreso', categoria: 'otro', metodo: 'tarjeta_debito', monto, descripcion: 'Límite UTC', fecha: new Date(fecha), createdBy: userId });
    }
    const summary = await get('/api/finance/summary');
    expect(summary.status).toBe(200);
    expect(summary.body.metrics).toMatchObject({ revenueToday: 24, revenueMonth: 62, expensesToday: 24, expensesMonth: 62 });
    const day = await get('/api/finance/day', { fecha: '2026-11-12' });
    expect(day.body.totals.confirmedTotal).toBe(summary.body.metrics.revenueToday);
    const analytics = await get('/api/finance/analytics', { fechaDesde: '2026-11-12', fechaHasta: '2026-11-12', comparar: 'false' });
    expect(analytics.body.kpis).toMatchObject({ collected: 24, expenses: 24 });
  });

  it('keeps decimal receivables and discounted gross sales consistent across finance and analytics', async () => {
    const q = await quotation(14.99, { subtotal: 25, descuentoTipo: 'fijo', descuentoValor: 10.01 });
    await pay(q.id, 7.98);
    const summary = await get('/api/finance/summary');
    expect(summary.status).toBe(200);
    expect(summary.body.metrics.receivableTotal).toBe(10.01);
    expect(summary.body.pendingQuotations[0]).toMatchObject({ total: 17.99, pagado: 7.98, saldoPendiente: 10.01 });
    const today = new Date().toISOString().slice(0, 10);
    const analytics = await get('/api/finance/analytics', { fechaDesde: today, fechaHasta: today, comparar: 'false', clientId: client.id });
    expect(analytics.status).toBe(200);
    expect(analytics.body.kpis).toMatchObject({ grossSales: 17.99, receivable: 10.01, averageTicket: 17.99 });
    expect(analytics.body.topClients[0]).toMatchObject({ grossSales: 17.99, receivable: 10.01 });
  });

  it('excludes deleted quotations from item rankings as well as sales KPIs', async () => {
    const q = await quotation();
    await QuotationItem.create({ quotationId: q.id, catalogItemId: null, descripcion: 'Ítem eliminado', cantidad: 1, precioUnitario: 100, subtotal: 100, notasOperativas: null });
    await q.destroy();
    const today = new Date().toISOString().slice(0, 10);
    const analytics = await get('/api/finance/analytics', { fechaDesde: today, fechaHasta: today, comparar: 'false', clientId: client.id });
    expect(analytics.status).toBe(200);
    expect(analytics.body.kpis).toMatchObject({ quotationCount: 0, grossSales: 0 });
    expect(analytics.body.topItems).toEqual([]);
  });
});
