import { randomUUID } from 'node:crypto';

import { WORK_ORDER_DELIVERY_CHECKLIST } from '@unithor/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { Client } from '../../models/Client.js';
import { CustomerEmail } from '../../models/CustomerEmail.js';
import { Notification } from '../../models/Notification.js';
import { Payment } from '../../models/Payment.js';
import { Quotation } from '../../models/Quotation.js';
import { QuotationItem } from '../../models/QuotationItem.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { Vehicle } from '../../models/Vehicle.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { WorkOrderDelivery } from '../../models/WorkOrderDelivery.js';
import { WorkOrderEvent } from '../../models/WorkOrderEvent.js';
import { WorkOrderItem } from '../../models/WorkOrderItem.js';
import { WorkOrderItemAssignment } from '../../models/WorkOrderItemAssignment.js';
import { WorkOrderItemProgressEvent } from '../../models/WorkOrderItemProgressEvent.js';
import { WorkOrderItemSession } from '../../models/WorkOrderItemSession.js';
import { WorkOrderPriceSuggestion } from '../../models/WorkOrderPriceSuggestion.js';
import { WorkOrderQualityReview } from '../../models/WorkOrderQualityReview.js';
import { WorkOrderRequest } from '../../models/WorkOrderRequest.js';
import { signAccessToken } from '../../utils/jwt.js';

const runId = randomUUID();
const tag = runId.replaceAll('-', '').slice(0, 12);
const csrf = `acceptance-${runId}`;
const roles = { admin: 'admin', chief: 'jefe', mechanic: 'mecanico', outsider: 'mecanico' } as const;
type Actor = keyof typeof roles;
const plain = (rows: { toJSON(): object }[]) => rows.map((row) => row.toJSON());

describe('Integrated chief/mechanic workshop acceptance (unithor_test only)', () => {
  const actors = {} as Record<Actor, User>;
  const users: User[] = [];
  let client: Client | undefined;
  let vehicle: Vehicle | undefined;
  let orderId: number | undefined;
  let quotationId: number | undefined;
  const cookies = (who: Actor) => [
    `access_token=${signAccessToken({ sub: actors[who].id, role: roles[who] })}`, `csrf_token=${csrf}`,
  ];
  const mutate = (method: 'post' | 'patch', target: string, body: object = {}, who: Actor = 'chief') =>
    request(app)[method](target).set('Cookie', cookies(who)).set('X-CSRF-Token', csrf).send(body);
  const get = (target: string, who: Actor) => request(app).get(target).set('Cookie', cookies(who));
  const ok = (response: request.Response, status = 200) => expect(response.status, JSON.stringify(response.body)).toBe(status);

  // All DB work is deferred to the coordinated test runner, never module import.
  beforeAll(async () => {
    if (sequelize.getDatabaseName() !== 'unithor_test') throw new Error('Acceptance requires unithor_test');
    for (const who of Object.keys(roles) as Actor[]) {
      const role = await Role.findOne({ where: { nombre: roles[who] } });
      if (!role) throw new Error(`Missing test role: ${roles[who]}`);
      const user = await User.create({ nombre: `Acceptance ${who}`, username: `accept_${who}_${tag}`, email: `acceptance-${who}-${runId}@example.com`,
        passwordHash: 'unused-signed-token-fixture', roleId: role.id, activo: true });
      actors[who] = user; users.push(user);
    }
    // No recipient exists, so workflow-generated email jobs cannot send externally.
    client = await Client.create({ nombre: `Acceptance customer ${tag}`, tipo: 'cliente', email: null });
    vehicle = await Vehicle.create({ patente: `A${tag.slice(0, 7)}`.toUpperCase(), clientId: client.id, kilometraje: 100 });
  });

  afterAll(async () => {
    if (sequelize.getDatabaseName() !== 'unithor_test') return;
    if (orderId) {
      await Notification.destroy({ where: { workOrderId: orderId } });
      await CustomerEmail.destroy({ where: { kind: 'work_order', entityId: orderId } });
      await WorkOrderQualityReview.destroy({ where: { workOrderId: orderId } });
    }
    if (quotationId) {
      await Notification.destroy({ where: { quotationId } });
      await CustomerEmail.destroy({ where: { kind: 'quotation', entityId: quotationId } });
      await Quotation.destroy({ where: { id: quotationId }, force: true });
    }
    if (orderId) await WorkOrder.destroy({ where: { id: orderId }, force: true });
    if (vehicle) await vehicle.destroy({ force: true });
    if (client) await client.destroy({ force: true });
    if (users.length) {
      await Notification.destroy({ where: { userId: users.map((user) => user.id) } });
      await User.destroy({ where: { id: users.map((user) => user.id) }, force: true });
    }
  });

  it('retains one diagnostic service through assignment, timed rework, QA, audited pricing and signed unpaid delivery', async () => {
    // 1. Administration creates an unpriced diagnosis with retained percentage discounts.
    const created = await mutate('post', '/api/work-orders', {
      clientId: client!.id, vehicleId: vehicle!.id, kilometrajeIngreso: 100,
      descuentoTipo: 'porcentaje', descuentoValor: 10,
      items: [{ descripcion: `Acceptance diagnosis ${tag}`, tipoLinea: 'especifico', unidadMedida: 'servicio', cantidad: 1,
        precioUnitario: 0, descuentoTipo: 'porcentaje', descuentoValor: 10 }],
    }, 'admin');
    ok(created, 201); orderId = Number(created.body.workOrder.id);
    const order = await WorkOrder.findByPk(orderId);
    const quotation = await Quotation.findOne({ where: { workOrderId: orderId } });
    if (quotation) quotationId = quotation.id;
    const item = await WorkOrderItem.findOne({ where: { workOrderId: orderId } });
    if (!order || !quotation || !item) throw new Error('Missing created OT, COT or diagnostic item');
    const line = await QuotationItem.findOne({ where: { quotationId: quotation.id, workOrderItemId: item.id } });
    if (!line) throw new Error('Missing authoritative COT link');
    expect(order.priceApprovalRequired).toBe(true);
    expect(Number(item.precioUnitario)).toBe(0);
    const base = `/api/work-orders/${order.id}`;
    const service = `${base}/items/${item.id}`;
    const sessions = () => WorkOrderItemSession.findAll({ where: { workOrderId: order.id }, order: [['id', 'ASC']] });
    const laborEvents = () => WorkOrderItemProgressEvent.findAll({ where: { workOrderId: order.id }, order: [['id', 'ASC']] });
    const assignmentBody = { members: [{ userId: actors.mechanic.id, estimatedHours: 1.5 }], motivo: 'Asignar diagnóstico y estimación inicial' };
    const proposalBody = { workOrderItemId: item.id, precioSugerido: 20000, alcance: 'ot', motivo: 'Diagnóstico y corrección terminados' };
    const deliveryBody = { kilometrajeSalida: 150, receptorNombre: 'Receptor aceptación', receptorRut: '12.345.678-5', receptorTelefono: '+56912345678',
      checklist: [...WORK_ORDER_DELIVERY_CHECKLIST], conformidad: true, firmaRecepcion: 'Firma receptor aceptación' };

    // 2. Real role authorization and CSRF protect the chief's assignment write.
    expect((await request(app).get(`${base}/worksheet`)).status).toBe(401);
    const noCsrf = await request(app).post(`${service}/team`).set('Cookie', cookies('chief')).send(assignmentBody);
    expect(noCsrf.status).toBe(403); expect(noCsrf.body.error.code).toBe('CSRF_INVALID');
    ok(await mutate('post', `${service}/team`, assignmentBody));
    const assignment = await WorkOrderItemAssignment.findOne({ where: { workOrderItemId: item.id, userId: actors.mechanic.id, active: true } });
    if (!assignment) throw new Error('Missing assigned mechanic');
    expect(Number(assignment.estimatedHours)).toBe(1.5);
    expect(Number((await item.reload()).horasHombreEstimadas)).toBe(1.5);

    // 3. An unrelated mechanic cannot read the OT; the assigned worker sees their worksheet.
    expect((await get(`${base}/worksheet`, 'outsider')).status).toBe(404);
    expect((await get(`${base}/quality`, 'outsider')).status).toBe(404);
    ok(await get(`${base}/worksheet`, 'mechanic'));

    const elapsedSeconds = (rows: WorkOrderItemSession[]) => rows.reduce((total, row) =>
      total + (row.endedAt!.getTime() - row.startedAt.getTime()) / 1000, 0);
    const hoursFromSeconds = (seconds: number) => Math.round(seconds / 3600 * 100) / 100;
    const work = async (seconds: number, finish: 'pause' | 'complete') => {
      ok(await mutate('post', `${service}/start`, {}, 'mechanic'));
      const open = await WorkOrderItemSession.findOne({ where: { workOrderItemId: item.id, userId: actors.mechanic.id, status: 'abierta' } });
      if (!open) throw new Error('Missing server-created timer');
      await open.update({ startedAt: new Date(Math.floor(Date.now() / 1000) * 1000 - seconds * 1000) });
      ok(await mutate('post', `${service}/${finish}`, {}, 'mechanic'));
      await open.reload();
      expect(open.status).toBe('cerrada');
      expect(open.endedAt).not.toBeNull();
      const actualSeconds = elapsedSeconds([open]);
      expect(actualSeconds).toBeGreaterThanOrEqual(seconds);
      expect(actualSeconds).toBeLessThanOrEqual(seconds + 5);
    };

    // 4. Two sub-minute timers must accumulate, even if integer minute snapshots are zero.
    await work(44, 'pause'); await work(45, 'complete');
    expect((await item.reload()).estadoOperativo).toBe('completado');
    const firstClocks = await sessions();
    const firstSeconds = elapsedSeconds(firstClocks);
    expect(firstSeconds).toBeGreaterThanOrEqual(89);
    expect(firstSeconds).toBeLessThanOrEqual(99);
    const firstHours = hoursFromSeconds(firstSeconds);
    expect(firstHours).toBeGreaterThan(0);
    expect(Number(item.horasHombreReales)).toBe(firstHours);
    const firstSessions = plain(firstClocks);
    const firstEvents = plain(await laborEvents());
    expect(firstSessions).toHaveLength(2);

    // 5. Technical completion grants no mechanic authority over prices, QA or delivery.
    for (const [target, body] of [[`${base}/price-suggestions`, proposalBody], [`${service}/quality`, { decision: 'aprobar' }],
      [`${base}/quality/confirm`, {}], [`${base}/deliver`, deliveryBody]] as const) {
      expect((await mutate('post', target, body, 'mechanic')).status).toBe(403);
    }
    expect(item.qualityStatus).toBe('pendiente');
    expect((await mutate('post', `${base}/quality/confirm`, {})).status).toBe(400);

    // 6. Chief rejection reopens the same service and crew without erasing time or events.
    ok(await mutate('post', `${service}/quality`, { decision: 'rechazar', nota: 'Corregir fuga detectada durante revisión' }));
    expect((await item.reload()).toJSON()).toMatchObject({ estadoOperativo: 'pendiente', qualityStatus: 'rechazado' });
    expect(Number(item.horasHombreReales)).toBe(firstHours);
    expect((await assignment.reload()).completedAt).toBeNull();
    expect(plain(await sessions())).toEqual(firstSessions);
    expect(plain(await laborEvents())).toEqual(expect.arrayContaining(firstEvents));
    expect((await line.reload()).workOrderItemId).toBe(item.id);

    // 7. Rework retains the short sessions; round hours only after adding all elapsed seconds.
    await work(1800, 'complete');
    const finalSeconds = elapsedSeconds(await sessions());
    expect(finalSeconds).toBeGreaterThanOrEqual(firstSeconds + 1800);
    expect(finalSeconds).toBeLessThanOrEqual(firstSeconds + 1805);
    const finalHours = hoursFromSeconds(finalSeconds);
    expect(finalHours).toBeGreaterThan(0.5);
    expect(Number((await item.reload()).horasHombreReales)).toBe(finalHours);
    ok(await mutate('post', `${service}/quality`, { decision: 'aprobar', nota: 'Corrección revisada y conforme' }));
    ok(await mutate('post', `${base}/quality/confirm`, {}));
    const approvalAt = (await order.reload()).qualityApprovedAt!.getTime();
    expect(order.estado).toBe('finalizada');
    const unpriced = await mutate('post', `${base}/deliver`, deliveryBody);
    expect(unpriced.status).toBe(400); expect(unpriced.body.error.message).toMatch(/precio/i);
    expect(await WorkOrderDelivery.count({ where: { workOrderId: order.id } })).toBe(0);
    const retainedSessions = plain(await sessions());
    const retainedLaborEvents = plain(await laborEvents());

    // 8. Chief validation forwards the mechanic's increase to administration without changing prices.
    ok(await mutate('post', `${base}/requests`, { tipo: 'aumento_precio', workOrderItemId: item.id,
      precioSugerido: proposalBody.precioSugerido, motivo: proposalBody.motivo }, 'mechanic'), 201);
    const priceRequest = await WorkOrderRequest.findOne({ where: { workOrderId: order.id, workOrderItemId: item.id, tipo: 'aumento_precio', requestedBy: actors.mechanic.id } });
    if (!priceRequest) throw new Error('Missing mechanic price request');
    ok(await mutate('patch', `${base}/requests/${priceRequest.id}`, { decision: 'aprobar' }));
    const proposed = await WorkOrderPriceSuggestion.findOne({ where: { workOrderId: order.id, sourceRequestId: priceRequest.id } });
    if (!proposed) throw new Error('Missing chief-forwarded price proposal');
    expect(proposed.toJSON()).toMatchObject({ estado: 'pendiente', appliedDirectly: false, createdBy: actors.chief.id });
    const proposalId = proposed.id;
    const proposalPath = `${base}/price-suggestions/${proposalId}`;
    expect((await mutate('patch', proposalPath, { decision: 'aprobar' })).status).toBe(403);
    expect((await WorkOrderPriceSuggestion.findByPk(proposalId))!.estado).toBe('pendiente');
    expect(Number((await item.reload()).precioUnitario)).toBe(0);
    expect(Number((await line.reload()).precioUnitario)).toBe(0);

    // 9. Admin approval synchronizes OT/COT, discounts and IVA without collecting payment or invalidating QA.
    const approved = await mutate('patch', proposalPath, { decision: 'aprobar', comentario: 'Precio autorizado por administración' }, 'admin');
    ok(approved); expect(approved.body.suggestion.estado).toBe('aprobada');
    expect((await priceRequest.reload()).toJSON()).toMatchObject({ tipo: 'aumento_precio', estado: 'aprobada', workOrderItemId: item.id });
    expect(Number(priceRequest.precioAprobado)).toBe(20000);
    const worksheetAfterPrice = await get(`${base}/worksheet`, 'mechanic'); ok(worksheetAfterPrice);
    const serviceAfterPrice = worksheetAfterPrice.body.worksheet.items.find((row: { id: number }) => row.id === item.id);
    expect(serviceAfterPrice).toMatchObject({ tipoLinea: 'especifico', awaitingWarehouseDelivery: false, canWork: true });
    expect(worksheetAfterPrice.body.worksheet.requests.find((row: { id: number }) => row.id === priceRequest.id).pendingPriceApproval).toBe(false);
    expect(Number((await item.reload()).precioUnitario)).toBe(20000);
    expect(Number((await line.reload()).precioUnitario)).toBe(20000);
    expect([line.descuentoTipo, Number(line.descuentoValor), Number(line.subtotal)]).toEqual(['porcentaje', 10, 18000]);
    expect(Number((await quotation.reload()).total)).toBe(16200);
    expect([quotation.descuentoTipo, Number(quotation.descuentoValor)]).toEqual(['porcentaje', 10]);
    const priced = await get(base, 'chief'); ok(priced);
    expect(priced.body.workOrder.quotation).toMatchObject({ neto: 16200, iva: 3078, total: 19278, pagado: 0, estadoPago: 'por_pagar' });
    expect(await Payment.count({ where: { quotationId: quotation.id } })).toBe(0);
    expect((await order.reload()).qualityApprovedAt!.getTime()).toBe(approvalAt);
    expect(Number((await item.reload()).horasHombreReales)).toBe(finalHours);
    expect(plain(await sessions())).toEqual(retainedSessions);

    // 10. Final confirmation remains safe to retry; delivery requires a valid receiver signature.
    ok(await mutate('post', `${base}/quality/confirm`, {}));
    expect((await mutate('post', `${base}/deliver`, { ...deliveryBody, firmaRecepcion: '' })).status).toBe(400);
    const beforeDelivery = plain(await WorkOrderEvent.findAll({ where: { workOrderId: order.id }, order: [['id', 'ASC']] }));
    ok(await mutate('post', `${base}/deliver`, deliveryBody));
    expect((await order.reload()).estado).toBe('entregada');
    const delivery = await WorkOrderDelivery.findOne({ where: { workOrderId: order.id } });
    expect(delivery!.toJSON()).toMatchObject({ receptorNombre: deliveryBody.receptorNombre, firmaRecepcion: deliveryBody.firmaRecepcion,
      conformidad: true, kilometrajeSalida: 150, deliveredBy: actors.chief.id });

    // 11. Delivery retains all service identities, time, QA history and previous activity.
    expect(await WorkOrderItem.count({ where: { workOrderId: order.id } })).toBe(1);
    expect((await WorkOrderItem.findAll({ where: { workOrderId: order.id } })).map((row) => row.id)).toEqual([item.id]);
    expect(Number((await item.reload()).horasHombreReales)).toBe(finalHours);
    expect((await line.reload()).workOrderItemId).toBe(item.id);
    expect(await QuotationItem.count({ where: { quotationId: quotation.id } })).toBe(1);
    expect(plain(await sessions())).toEqual(retainedSessions);
    expect(plain(await laborEvents())).toEqual(retainedLaborEvents);
    expect(plain(await WorkOrderEvent.findAll({ where: { workOrderId: order.id }, order: [['id', 'ASC']] }))).toEqual(expect.arrayContaining(beforeDelivery));
    expect((await WorkOrderQualityReview.findAll({ where: { workOrderId: order.id }, order: [['id', 'ASC']] })).map((row) => row.decision)).toEqual(['rechazado', 'aprobado', 'aprobado']);
    expect(Number((await quotation.reload()).pagado)).toBe(0);
    expect(await Payment.count({ where: { quotationId: quotation.id } })).toBe(0);
    expect((await CustomerEmail.findAll({ where: { kind: 'work_order', entityId: order.id } })).every((row) => row.recipient === null)).toBe(true);

    // 12. The delivered OT is terminal: timers, QA changes, prices and status reopening are rejected.
    expect((await mutate('post', `${service}/start`, {}, 'mechanic')).status).toBe(400);
    expect((await mutate('post', `${service}/quality`, { decision: 'rechazar', nota: 'Intento después de entregar' })).status).toBe(400);
    expect((await mutate('post', `${base}/price-suggestions`, { ...proposalBody, precioSugerido: 25000 }, 'admin')).status).toBe(400);
    expect((await mutate('patch', `${base}/status`, { nuevoEstado: 'en_progreso' })).status).toBe(400);
    expect((await order.reload()).estado).toBe('entregada');
    expect(Number((await item.reload()).horasHombreReales)).toBe(finalHours);
    expect(plain(await sessions())).toEqual(retainedSessions);
    expect(await WorkOrderDelivery.count({ where: { workOrderId: order.id } })).toBe(1);
  }, 60000);
});
