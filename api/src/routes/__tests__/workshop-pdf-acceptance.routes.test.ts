import { randomUUID } from 'node:crypto';

import { DEFAULT_WORKSHOP_WEEKLY } from '@unithor/shared';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { Client, Payment, Quotation, Role, Specialty, SpecialtyRate, User, Vehicle, WorkerSpecialty, WorkOrderItem, WorkOrderItemSession } from '../../models/index.js';
import { WorkshopCommercialReview } from '../../models/WorkshopCommercialReview.js';
import { WorkshopSchedule } from '../../models/WorkshopSchedule.js';
import { signAccessToken } from '../../utils/jwt.js';

import type { Response as AgentResponse } from 'superagent';

const binary = (res: AgentResponse, callback: (error: Error | null, body: unknown) => void) => {
  const chunks: Buffer[] = [];
  const stream = res as unknown as NodeJS.ReadableStream;
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  stream.on('end', () => callback(null, Buffer.concat(chunks)));
  stream.on('error', (error: Error) => callback(error, Buffer.alloc(0)));
};

describe('Supervisor PDF acceptance: productivity, recovery, quality and immutable audit', () => {
  const tag = randomUUID().slice(0, 8);
  const csrf = `pdf-close-${tag}`;
  const actors = {} as Record<'admin' | 'jefe' | 'mecanico' | 'finanzas' | 'vendedor', User>;
  let orderId: number; let item: WorkOrderItem; let quotation: Quotation; let vehicle: Vehicle;
  let specialty: Specialty; let manualId: number;
  const path = '/api/reports/workshop-costs';
  const headers = (who: keyof typeof actors) => [`access_token=${signAccessToken({ sub: actors[who].id, role: who })}`, `csrf_token=${csrf}`];
  const post = (url: string, body: object, who: keyof typeof actors = 'jefe') => request(app).post(url).set('Cookie', headers(who)).set('X-CSRF-Token', csrf).send(body);
  const get = (url: string, who: keyof typeof actors = 'jefe') => request(app).get(url).set('Cookie', headers(who));
  const preview = () => get(`${path}/analysis?fechaDesde=2026-11-16&fechaHasta=2026-11-16&workOrderId=${orderId}&userId=${actors.mecanico.id}`);
  const ok = (response: request.Response, status = 200) => expect(response.status, JSON.stringify(response.body)).toBe(status);
  beforeAll(async () => {
    if (sequelize.getDatabaseName() !== 'unithor_test') throw new Error('Solo unithor_test');
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
    for (const name of ['admin', 'jefe', 'mecanico', 'finanzas', 'vendedor'] as const) {
      const role = await Role.findOne({ where: { nombre: name } });
      if (!role) throw new Error(`Falta rol ${name}`);
      actors[name] = await User.create({ nombre: `Cierre PDF ${name}`, username: `pdf_${name}_${tag}`, email: `pdf_${name}_${tag}@example.test`, passwordHash: 'signed-fixture', roleId: role.id, activo: true });
    }
    const client = await Client.create({ nombre: `Cierre PDF ${tag}`, tipo: 'cliente', email: null });
    vehicle = await Vehicle.create({ patente: `P${tag}`.toUpperCase(), clientId: client.id });
    await WorkshopSchedule.upsert({ id: 1, timezone: 'America/Santiago', weekly: DEFAULT_WORKSHOP_WEEKLY, updatedBy: actors.admin.id });
    specialty = await Specialty.create({ name: `Mecánica PDF ${tag}`, active: true });
    await SpecialtyRate.create({ specialtyId: specialty.id, validityFrom: '2020-01-01', costHourly: 4000, saleHourly: 10000, createdBy: actors.admin.id });
    await WorkerSpecialty.create({ userId: actors.mecanico.id, specialtyId: specialty.id, isPrincipal: true, updatedBy: actors.admin.id });
    const created = await post('/api/work-orders', { clientId: client.id, vehicleId: vehicle.id, fechaIngreso: '2026-11-16T12:00:00Z',
      items: [{ descripcion: `Diagnóstico PDF ${tag}`, tipoLinea: 'especifico', cantidad: 1, precioUnitario: 30000 }] }, 'admin');
    ok(created, 201); orderId = Number(created.body.workOrder.id);
    item = (await WorkOrderItem.findOne({ where: { workOrderId: orderId } }))!;
    quotation = (await Quotation.findOne({ where: { workOrderId: orderId } }))!;
    ok(await post(`/api/work-orders/${orderId}/items/${item.id}/team`, { members: [{ userId: actors.mecanico.id, specialtyId: specialty.id, estimatedHours: 1 }], motivo: 'Estimación original del diagnóstico' }));
  }, 60000);
  afterAll(async () => { vi.useRealTimers(); await sequelize.close(); });

  it('enforces read roles and CSRF on the audit action', async () => {
    expect((await request(app).get(`${path}/analysis`)).status).toBe(401);
    for (const who of ['mecanico', 'vendedor'] as const) expect((await get(`${path}/analysis`, who)).status).toBe(403);
    const payload = { workOrderItemId: item.id, reason: 'otro', note: 'Revisión de diferencias' };
    expect((await post(`${path}/commercial-reviews`, payload, 'finanzas')).status).toBe(403);
    expect((await request(app).post(`${path}/commercial-reviews`).set('Cookie', headers('jefe')).send(payload)).status).toBe(403);
    expect((await get(`${path}/analysis?fechaDesde=2026-11-17&fechaHasta=2026-11-16`)).status).toBe(400);
  });

  it('rejects manual hours before creation and legacy orders without a real vehicle', async () => {
    const payload = { workOrderId: orderId, itemId: item.id, startedAt: '2026-11-16T11:00:00Z', endedAt: '2026-11-16T11:30:00Z', note: 'Intervalo anterior a la recepción' };
    const early = await post('/api/workshop-time/requests', payload, 'mecanico');
    ok(early, 400);
    expect(early.body.error.message).toMatch(/antes de/i);
    const order = await import('../../models/WorkOrder.js').then((module) => module.WorkOrder.findByPk(orderId));
    if (!order) throw new Error('Falta OT de prueba');
    try {
      vi.setSystemTime(new Date('2026-11-16T15:00:00Z'));
      await order.update({ vehicleId: null });
      const invalid = await post('/api/workshop-time/requests', { ...payload, startedAt: '2026-11-16T12:00:00Z', endedAt: '2026-11-16T12:30:00Z' }, 'mecanico');
      ok(invalid, 400);
      expect(invalid.body.error.message).toMatch(/vehículo/i);
      expect(await WorkOrderItemSession.count({ where: { workOrderItemId: item.id } })).toBe(0);
    } finally {
      await order.update({ vehicleId: vehicle.id });
      vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
    }
  });

  it('measures three automatic hours against a one-hour estimate without losing the clock', async () => {
    ok(await post(`/api/work-orders/${orderId}/items/${item.id}/start`, {}, 'mecanico'));
    vi.setSystemTime(new Date('2026-11-16T15:00:00Z'));
    expect((await post(`/api/work-orders/${orderId}/items/${item.id}/pause`, { note: ' ' }, 'mecanico')).status).toBe(400);
    ok(await post(`/api/work-orders/${orderId}/items/${item.id}/pause`, { note: 'Registrar diagnóstico parcial' }, 'mecanico'));
    expect((await WorkOrderItemSession.findOne({ where: { workOrderItemId: item.id } }))?.note).toBe('Registrar diagnóstico parcial');
    const response = await preview(); ok(response);
    expect(response.body.analysis.efficiency).toMatchObject({ actualHours: 3, estimatedHours: 1, percent: 33.33, deviationHours: 2 });
    expect(response.body.analysis.utilization).toMatchObject({ registeredHours: 3, scheduledHours: 8, unregisteredHours: 5 });
  });

  it('adds two accepted manual hours to three automatic hours and prevents duplicate coverage', async () => {
    vi.setSystemTime(new Date('2026-11-16T19:00:00Z'));
    const data = { workOrderId: orderId, itemId: item.id, startedAt: '2026-11-16T17:00:00Z', endedAt: '2026-11-16T19:00:00Z',
      activityStatus: 'en_proceso', note: 'Dos horas de diagnóstico sin cronómetro' };
    const submitted = await post('/api/workshop-time/requests', data, 'mecanico'); ok(submitted, 201); manualId = submitted.body.request.id;
    expect(submitted.body.request.status).toBe('pendiente');
    expect((await preview()).body.analysis.utilization.registeredHours).toBe(3);
    const reviewed = await request(app).patch(`/api/workshop-time/requests/${manualId}/review`).set('Cookie', headers('jefe')).set('X-CSRF-Token', csrf).send({ approve: true, note: 'Horas contrastadas con el equipo' });
    ok(reviewed);
    expect((await post('/api/workshop-time/requests', data, 'mecanico')).status).toBe(409);
    const result = await preview(); ok(result);
    expect(result.body.analysis.utilization).toMatchObject({ registeredHours: 5, scheduledHours: 8, unregisteredHours: 3, registeredPercent: 62.5 });
    expect(result.body.analysis.commercial.services[0]).toMatchObject({ actualHours: 5, theoreticalNet: 50000, quotedNet: 30000, equivalentQuotedHours: 3, equivalentReceivedHours: 0, hoursDifference: -2 });
    expect(Number((await item.reload()).horasHombreReales)).toBe(5);
  });

  it('separates receipt of money from hours and financial recovery without counting IVA as labor', async () => {
    ok(await post('/api/payments', { quotationId: quotation.id, monto: 35700, metodo: 'efectivo' }, 'admin'), 201);
    const result = await preview(); ok(result);
    expect(result.body.analysis.commercial.services[0]).toMatchObject({ receivedNet: 30000, equivalentReceivedHours: 3, actualHours: 5 });
    expect(await Payment.count({ where: { quotationId: quotation.id } })).toBe(1);
    expect(Number((await item.reload()).horasHombreReales)).toBe(5);
  });

  it('keeps 100% technical completion pending QA, then reports rejected rework without erasing the first five hours', async () => {
    ok(await post(`/api/work-orders/${orderId}/items/${item.id}/complete`, {}, 'mecanico'));
    expect((await preview()).body.analysis.quality.pendingServices).toBe(1);
    expect((await post(`/api/work-orders/${orderId}/quality/confirm`, {})).status).toBe(400);
    ok(await post(`/api/work-orders/${orderId}/items/${item.id}/quality`, { decision: 'rechazar', nota: 'Corregir fuga antes de entregar' }));
    ok(await post(`/api/work-orders/${orderId}/items/${item.id}/start`, {}, 'mecanico'));
    vi.setSystemTime(new Date('2026-11-16T19:30:00Z'));
    ok(await post(`/api/work-orders/${orderId}/items/${item.id}/complete`, {}, 'mecanico'));
    ok(await post(`/api/work-orders/${orderId}/items/${item.id}/quality`, { decision: 'aprobar', nota: 'Corrección revisada' }));
    ok(await post(`/api/work-orders/${orderId}/quality/confirm`, {}));
    const response = await preview(); ok(response);
    expect(response.body.analysis.quality).toMatchObject({ rejections: 1, reworkHours: 0.5, firstPassPercent: 0, firstPassApproved: 0, pendingServices: 0 });
    expect(response.body.analysis.utilization.registeredHours).toBe(5.5);
    expect(Number((await item.reload()).horasHombreReales)).toBe(5.5);
    expect(await WorkOrderItemSession.count({ where: { workOrderItemId: item.id } })).toBe(3);
  });

  it('records immutable reasons and reference snapshots while keeping COT, payments and historical rates untouched', async () => {
    const before = (await quotation.reload()).toJSON();
    const saved = await post(`${path}/commercial-reviews`, { workOrderItemId: item.id, reason: 'retrabajo', note: 'Mayor dedicación por corrección interna', referenceHourlyRate: 10000 }); ok(saved, 201);
    expect(saved.body.review.snapshot).toMatchObject({ actualHours: 5.5, equivalentQuotedHours: 3, hoursDifference: -2.5, referenceSource: 'manual' });
    const audit = (await WorkshopCommercialReview.findByPk(saved.body.review.id))!;
    await expect(audit.update({ note: 'Reescritura' })).rejects.toThrow(/históricas/);
    expect((await quotation.reload()).toJSON()).toEqual(before);
    await SpecialtyRate.create({ specialtyId: specialty.id, validityFrom: '2026-11-17', costHourly: 8000, saleHourly: 25000, createdBy: actors.admin.id });
    const result = await preview(); ok(result);
    expect(result.body.analysis.commercial.services[0]).toMatchObject({ theoreticalNet: 55000, referenceHourlyRate: 10000 });
    expect(result.body.analysis.commercial.reviews).toHaveLength(1);
    expect((await get(`${path}/analysis?fechaDesde=2026-11-16&fechaHasta=2026-11-16&vehicleId=${vehicle.id + 99999}`)).body.rows).toHaveLength(0);
  });

  it('exports the same filtered figures and complete audit to PDF and Excel', async () => {
    const query = `fechaDesde=2026-11-16&fechaHasta=2026-11-16&workOrderId=${orderId}`;
    const pdf = await get(`${path}/analysis/pdf?${query}`).buffer(true).parse(binary); ok(pdf);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(Buffer.isBuffer(pdf.body)).toBe(true);
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
    const excel = await get(`${path}/analysis/excel?${query}`).buffer(true).parse(binary); ok(excel);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(excel.body as ExcelJS.Buffer);
    const values: unknown[] = [];
    for (const sheet of book.worksheets) sheet.eachRow((row) => row.eachCell((cell) => values.push(cell.value)));
    expect(values).toContain('Mayor dedicación por corrección interna');
    expect(values).toContain(-2.5);
  });
});
