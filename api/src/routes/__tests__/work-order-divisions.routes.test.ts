import { randomUUID } from 'node:crypto';

import { calculateQuotationPricing, DP_STAGE_KEYS } from '@unithor/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { sequelize } from '../../config/database.js';
import { up as ensureDivisions } from '../../database/migrations/062-catalog-divisions-and-dp-workflow.js';
import { app } from '../../main.js';
import { CatalogItem, Client, Quotation, QuotationItem, Role, Specialty, StockBalance, StockMovement, User, Vehicle, Warehouse, WorkerSpecialty, WorkOrder, WorkOrderDpStage, WorkOrderEvent, WorkOrderItem, WorkOrderItemSession, WorkOrderQualityReview, WorkshopTimeRequest } from '../../models/index.js';
import { hashPassword } from '../../utils/password.js';

import type { WorkOrderPublic } from '../../services/work-order.service.js';
import type { Role as RoleName } from '@unithor/shared';

const password = 'DivisionsAcceptance2026!';
const tag = randomUUID().slice(0, 8);
const day = '2026-11-23';
const dailyPath = '/api/workshop-time/daily-entries';
type Actor = 'developer' | 'chief' | 'armador' | 'preparer' | 'painter' | 'detailer' | 'outsider' | 'warehouse' | 'sales';
const roles: Record<Actor, RoleName> = { developer: 'desarrollador', chief: 'jefe', armador: 'mecanico', preparer: 'mecanico', painter: 'mecanico', detailer: 'mecanico', outsider: 'mecanico', warehouse: 'bodeguero', sales: 'vendedor' };
const stageActors: Actor[] = ['armador', 'preparer', 'painter', 'armador', 'detailer'];
interface Auth { user: User; cookies: string[]; csrf: string }
interface Fixture { order: WorkOrder; quotation: Quotation; dp: WorkOrderItem; acc: WorkOrderItem; stages: WorkOrderDpStage[] }

describe('Division workflow security, physical custody, daily stages and mirror (unithor_test only)', () => {
  const actors = {} as Record<Actor, Auth>;
  let client: Client;
  let vehicle: Vehicle;
  let warehouse: Warehouse;
  let inactive: User;
  const mutate = (method: 'patch' | 'post', path: string, body: object, who: Actor = 'developer') => request(app)[method](path).set('Cookie', actors[who].cookies).set('X-CSRF-Token', actors[who].csrf).send(body);
  const stagePath = (f: Fixture, index: number) => `/api/work-orders/${f.order.id}/dp-stages/${f.stages[index].id}`;
  const custodyPath = (f: Fixture) => `/api/work-orders/${f.order.id}/items/${f.acc.id}/acc-custody`;
  const ccfPath = (f: Fixture) => `/api/work-orders/${f.order.id}/items/${f.dp.id}/dp-ccf`;
  const mirror = (f: Fixture, itemId = f.dp.id) => QuotationItem.findOne({ where: { quotationId: f.quotation.id, workOrderItemId: itemId } });
  const complete = async (f: Fixture, index: number) => {
    const response = await mutate('patch', stagePath(f, index), { status: 'completado', note: `Etapa ${index + 1} terminada` }, stageActors[index]);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
  };
  const daily = (f: Fixture, index: number, hours = 3) => ({ clientRequestId: randomUUID(), workOrderId: f.order.id, itemId: f.dp.id, dpStageId: f.stages[index].id, fecha: day, horasUtilizadas: hours, activityStatus: 'completado', note: `Actividad de la etapa ${index + 1}` });

  beforeAll(async () => {
    if (sequelize.getDatabaseName() !== 'unithor_test') throw new Error('Division tests require unithor_test');
    await sequelize.authenticate();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${day}T21:00:00.000Z`));
    const passwordHash = await hashPassword(password);
    for (const who of Object.keys(roles) as Actor[]) {
      const role = await Role.findOne({ where: { nombre: roles[who] } });
      if (!role) throw new Error(`Falta rol ${roles[who]}`);
      const user = await User.create({ nombre: `Division ${who}`, email: `division-${who}-${tag}@example.test`, passwordHash, roleId: role.id, activo: true });
      const login = await request(app).post('/api/auth/login').send({ email: user.email, password });
      expect(login.status, JSON.stringify(login.body)).toBe(200);
      const raw: unknown = login.headers['set-cookie'];
      const cookies = (Array.isArray(raw) ? raw.filter((value): value is string => typeof value === 'string') : []).map((value) => value.split(';')[0]);
      const csrf = cookies.find((value) => value.startsWith('csrf_token='))?.slice(11);
      if (!csrf) throw new Error('Falta cookie CSRF');
      actors[who] = { user, cookies, csrf };
    }
    for (const [who, name] of [['armador', 'Armador'], ['preparer', 'Desabollador Preparador'], ['painter', 'Pintor'], ['detailer', 'Detailer'], ['outsider', 'Armador']] as const) {
      const specialty = await Specialty.create({ name: `${name} ${tag} ${who}`, active: true });
      await WorkerSpecialty.create({ userId: actors[who].user.id, specialtyId: specialty.id, isPrincipal: true, updatedBy: actors.developer.user.id });
    }
    inactive = await User.create({ nombre: 'Técnico inactivo', email: `division-inactive-${tag}@example.test`, passwordHash, roleId: actors.armador.user.roleId, activo: false });
    client = await Client.create({ tipo: 'cliente', nombre: `Cliente divisiones ${tag}` });
    vehicle = await Vehicle.create({ patente: `D${tag.slice(0, 5).toUpperCase()}`, clientId: client.id });
    warehouse = await Warehouse.create({ codigo: `DIV-${tag}`, nombre: 'Bodega custodia', activo: true });
  }, 30_000);
  afterAll(async () => { vi.useRealTimers(); await sequelize.close(); });

  const fixture = async (assigned = true): Promise<Fixture> => {
    const created = await mutate('post', '/api/work-orders', { clientId: client.id, vehicleId: vehicle.id, items: [
      { tipoLinea: 'estandar', division: 'DP', subtipo: 'servicio_dp', descripcion: 'Puerta delantera L', cantidad: 1, precioUnitario: 90000, horasHombreEstimadas: 6.5 },
      { tipoLinea: 'parte', division: 'ACC', subtipo: 'en_stock', descripcion: 'Parachoques delantero', cantidad: 1, precioUnitario: 85000 },
    ] });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const data = (created.body as { workOrder: WorkOrderPublic }).workOrder;
    expect(data.items?.find((item) => item.division === 'DP')?.dpStages).toHaveLength(5);
    const order = await WorkOrder.findByPk(data.id);
    const quotation = await Quotation.findOne({ where: { workOrderId: data.id } });
    const items = await WorkOrderItem.findAll({ where: { workOrderId: data.id } });
    const dp = items.find((item) => item.division === 'DP');
    const acc = items.find((item) => item.division === 'ACC');
    if (!order || !quotation || !dp || !acc) throw new Error('Falta OT, espejo o líneas');
    const stages = await WorkOrderDpStage.findAll({ where: { workOrderItemId: dp.id }, order: [['stageIndex', 'ASC']] });
    expect(stages.map((stage) => stage.stageIndex)).toEqual([1, 2, 3, 4, 5]);
    expect(stages.map((stage) => stage.stageKey)).toEqual([...DP_STAGE_KEYS]);
    if (assigned) for (const [index, stage] of stages.entries()) await stage.update({ assignedUserId: actors[stageActors[index]].user.id, assignedUserName: actors[stageActors[index]].user.nombre });
    return { order, quotation, dp, acc, stages };
  };

  it('initializes five unassigned pending stages and mirrors DP/ACC classification', async () => {
    const f = await fixture(false);
    expect(f.stages.every((stage) => stage.status === 'pendiente' && stage.assignedUserId === null)).toBe(true);
    expect((await mirror(f))?.toJSON()).toMatchObject({ division: 'DP', subtipo: 'servicio_dp', estadoOperativo: 'pendiente' });
    expect((await mirror(f, f.acc.id))?.toJSON()).toMatchObject({ division: 'ACC', subtipo: 'en_stock' });
  }, 20_000);

  it('requires authentication and active CSRF on every new mutation', async () => {
    const f = await fixture();
    for (const [method, path, body] of [['patch', stagePath(f, 0), { status: 'en_proceso' }], ['patch', ccfPath(f), { status: 'aprobado' }], ['patch', custodyPath(f), { entregado: true }], ['post', `/api/work-orders/${f.order.id}/items`, { descripcion: 'Trabajo nuevo' }]] as const) {
      expect((await request(app)[method](path).set('Cookie', 'csrf_token=anonymous-divisions').set('X-CSRF-Token', 'anonymous-divisions').send(body)).status).toBe(401);
      expect((await request(app)[method](path).set('Cookie', actors.developer.cookies).send(body)).status).toBe(403);
    }
  }, 20_000);

  it('assigns only active mechanics with the matching specialty; mechanics cannot self-assign', async () => {
    const f = await fixture(false);
    for (const user of [actors.developer.user, actors.painter.user, inactive]) {
      expect((await mutate('patch', stagePath(f, 0), { assignedUserId: user.id }, 'chief')).status).toBe(400);
      expect((await f.stages[0].reload()).assignedUserId).toBeNull();
    }
    expect((await mutate('patch', stagePath(f, 0), { assignedUserId: actors.armador.user.id }, 'chief')).status).toBe(200);
    expect((await mutate('patch', stagePath(f, 0), { assignedUserId: actors.armador.user.id }, 'armador')).status).toBe(403);
    expect((await f.stages[0].reload()).assignedUserId).toBe(actors.armador.user.id);
  }, 20_000);

  it('enforces sequence, rejects CCF after two stages, and requires chief quality approval after five', async () => {
    const f = await fixture();
    expect((await mutate('patch', stagePath(f, 1), { status: 'en_proceso' }, 'preparer')).status).toBe(400);
    expect((await f.stages[1].reload()).status).toBe('pendiente');
    await complete(f, 0); await complete(f, 1);
    expect((await mirror(f))?.estadoOperativo).toBe('en_proceso');
    expect((await mutate('patch', ccfPath(f), { status: 'aprobado' }, 'chief')).status).toBe(400);
    expect(await WorkOrderQualityReview.count({ where: { workOrderItemId: f.dp.id } })).toBe(0);
    expect((await mutate('patch', ccfPath(f), { note: 'Revisar ajuste al terminar pintura' }, 'chief')).status).toBe(200);
    expect((await f.dp.reload()).qualityStatus).toBe('pendiente');
    expect(f.dp.ccfStatus).not.toBe('aprobado');
    for (let index = 2; index < 5; index++) await complete(f, index);
    expect((await mirror(f))?.estadoOperativo).toBe('completado');
    expect((await mutate('patch', ccfPath(f), { status: 'aprobado' }, 'detailer')).status).toBe(403);
    const approved = await mutate('patch', ccfPath(f), { status: 'aprobado', note: 'Terminación revisada' }, 'chief');
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect((await f.dp.reload()).toJSON()).toMatchObject({ qualityStatus: 'aprobado', ccfStatus: 'aprobado', qualityReviewedBy: actors.chief.user.id, ccfReviewedBy: actors.chief.user.id });
    expect(await WorkOrderQualityReview.count({ where: { workOrderItemId: f.dp.id, decision: 'aprobado' } })).toBe(1);
    expect((await f.order.reload()).qualityApprovedAt).toBeNull();
  }, 20_000);

  it('preserves hours and notes while reopening later stages and invalidating quality', async () => {
    const f = await fixture();
    for (let index = 0; index < 5; index++) await complete(f, index);
    expect((await mutate('patch', ccfPath(f), { status: 'aprobado' }, 'chief')).status).toBe(200);
    await f.dp.update({ horasHombreReales: 7.5 });
    expect((await mutate('patch', stagePath(f, 1), { status: 'pendiente' }, 'chief')).status).toBe(200);
    const stages = await WorkOrderDpStage.findAll({ where: { workOrderItemId: f.dp.id }, order: [['stageIndex', 'ASC']] });
    expect(stages[0].status).toBe('completado');
    expect(stages.slice(1).every((stage) => stage.status === 'pendiente')).toBe(true);
    expect(stages[4].note).toBe('Etapa 5 terminada');
    expect((await f.dp.reload()).qualityStatus).toBe('pendiente');
    expect(Number(f.dp.horasHombreReales)).toBe(7.5);
    expect((await mirror(f))?.estadoOperativo).toBe('en_proceso');
  }, 20_000);

  it('separates physical delivery by warehouse from reception by the assigned armador', async () => {
    const f = await fixture();
    expect((await mutate('patch', custodyPath(f), { recibido: true }, 'armador')).status).toBe(400);
    expect((await mutate('patch', custodyPath(f), { entregado: true }, 'chief')).status).toBe(403);
    expect((await mutate('patch', custodyPath(f), { entregado: true }, 'armador')).status).toBe(403);
    expect((await mutate('patch', custodyPath(f), { entregado: true, recibido: true })).status).toBe(400);
    const delivered = await mutate('patch', custodyPath(f), { entregado: true }, 'warehouse');
    expect(delivered.status, JSON.stringify(delivered.body)).toBe(200);
    const deliveredAt = (await f.acc.reload()).entregadoBodegaAt;
    expect(deliveredAt).toBeInstanceOf(Date);
    expect(f.acc.bodegueroUserId).toBe(actors.warehouse.user.id);
    expect(f.acc.recibidoTaller).toBe(false);
    expect((await mutate('patch', custodyPath(f), { recibido: true }, 'warehouse')).status).toBe(403);
    expect((await mutate('patch', custodyPath(f), { recibido: true }, 'painter')).status).toBe(403);
    expect([403, 404]).toContain((await mutate('patch', custodyPath(f), { recibido: true }, 'outsider')).status);
    expect((await f.acc.reload()).recibidoTaller).toBe(false);
    const received = await mutate('patch', custodyPath(f), { recibido: true, notaEntrega: 'Recibido sin daños' }, 'armador');
    expect(received.status, JSON.stringify(received.body)).toBe(200);
    expect((await f.acc.reload()).toJSON()).toMatchObject({ entregadoBodega: true, recibidoTaller: true, bodegueroUserId: actors.warehouse.user.id, armadorUserId: actors.armador.user.id, notaEntrega: 'Recibido sin daños' });
    expect(f.acc.recibidoTallerAt).toBeInstanceOf(Date);
    expect(f.acc.entregadoBodegaAt).toEqual(deliveredAt);
  }, 20_000);

  it('rejects signer impersonation, price injections and custody on a non-ACC job', async () => {
    const f = await fixture();
    const before = (await mirror(f, f.acc.id))?.toJSON();
    for (const input of [{ entregado: true, bodegueroUserId: actors.developer.user.id }, { recibido: true, armadorUserId: actors.developer.user.id }, { entregado: true, precioUnitario: 1 }]) expect((await mutate('patch', custodyPath(f), input, 'warehouse')).status).toBe(400);
    expect((await f.acc.reload()).entregadoBodega).toBe(false);
    expect(f.acc.bodegueroUserId).toBeNull();
    expect(Number(f.acc.precioUnitario)).toBe(85000);
    expect((await mirror(f, f.acc.id))?.toJSON()).toEqual(before);
    expect((await mutate('patch', `/api/work-orders/${f.order.id}/items/${f.dp.id}/acc-custody`, { entregado: true }, 'warehouse')).status).toBe(400);
  }, 20_000);

  it('does not commit changes before rejecting foreign mechanics and sales users', async () => {
    const f = await fixture();
    const events = await WorkOrderEvent.count({ where: { workOrderId: f.order.id } });
    for (const who of ['outsider', 'sales'] as const) {
      expect([403, 404]).toContain((await mutate('patch', stagePath(f, 0), { note: 'No autorizado', status: 'completado' }, who)).status);
      expect([403, 404]).toContain((await mutate('patch', custodyPath(f), { entregado: true }, who)).status);
      expect([403, 404]).toContain((await mutate('post', `/api/work-orders/${f.order.id}/items`, { descripcion: 'No autorizado', tipoLinea: 'especifico', precioUnitario: 1 }, who)).status);
    }
    expect((await f.stages[0].reload()).status).toBe('pendiente');
    expect(f.stages[0].note).toBeNull();
    expect((await f.acc.reload()).entregadoBodega).toBe(false);
    expect(await WorkOrderItem.count({ where: { workOrderId: f.order.id } })).toBe(2);
    expect(await WorkOrderEvent.count({ where: { workOrderId: f.order.id } })).toBe(events);
  }, 20_000);

  it('does not let daily registration bypass earlier stages or confuse the two armador assignments', async () => {
    const f = await fixture();
    expect((await mutate('post', dailyPath, daily(f, 2), 'painter')).status).toBe(400);
    expect(await WorkshopTimeRequest.count({ where: { workOrderId: f.order.id } })).toBe(0);
    const { dpStageId: _id, ...ambiguous } = daily(f, 0);
    expect((await mutate('post', dailyPath, ambiguous, 'armador')).status).toBe(403);
    const saved = await mutate('post', dailyPath, daily(f, 0), 'armador');
    expect(saved.status, JSON.stringify(saved.body)).toBe(201);
    expect((await f.stages[0].reload()).status).toBe('completado');
    expect((await f.stages[3].reload()).status).toBe('pendiente');
    expect((await mutate('post', dailyPath, daily(f, 3), 'armador')).status).toBe(400);
    expect(await WorkshopTimeRequest.count({ where: { workOrderId: f.order.id } })).toBe(1);
    expect((await mirror(f))?.estadoOperativo).toBe('en_proceso');
  }, 20_000);

  it('accepts freely declared hours with stage identity, idempotent retries and separate chief review', async () => {
    const f = await fixture();
    const payload = daily(f, 0, 30);
    const saved = await mutate('post', dailyPath, payload, 'armador');
    expect(saved.status, JSON.stringify(saved.body)).toBe(201);
    const record = (saved.body as { request: { id: number; dpStageId: number; durationMinutes: number; status: string } }).request;
    expect(record).toMatchObject({ dpStageId: f.stages[0].id, durationMinutes: 1800, status: 'pendiente' });
    expect((await mutate('post', dailyPath, payload, 'armador')).status).toBe(201);
    expect(await WorkshopTimeRequest.count({ where: { workOrderId: f.order.id } })).toBe(1);
    expect(await WorkOrderItemSession.count({ where: { workOrderItemId: f.dp.id } })).toBe(0);
    expect((await f.dp.reload()).qualityStatus).toBe('pendiente');
    expect((await mirror(f))?.estadoOperativo).toBe('en_proceso');
    const reviewed = await mutate('patch', `/api/workshop-time/requests/${record.id}/review`, { approve: true, note: 'Horas contrastadas por jefatura' }, 'chief');
    expect(reviewed.status, JSON.stringify(reviewed.body)).toBe(200);
    expect(Number((await f.dp.reload()).horasHombreReales)).toBe(30);
    expect(f.dp.qualityStatus).toBe('pendiente');
  }, 20_000);

  it('allows new jobs only for supervisors and mirrors division, stages, discounts and totals', async () => {
    const f = await fixture();
    const input = { descripcion: 'Pintura parachoques', tipoLinea: 'estandar', division: 'DP', subtipo: 'servicio_dp', cantidad: 1, precioUnitario: 120000, descuentoTipo: 'porcentaje', descuentoValor: 10 };
    expect((await mutate('post', `/api/work-orders/${f.order.id}/items`, input, 'armador')).status).toBe(403);
    const added = await mutate('post', `/api/work-orders/${f.order.id}/items`, input, 'chief');
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    const item = await WorkOrderItem.findOne({ where: { workOrderId: f.order.id, descripcion: input.descripcion } });
    if (!item) throw new Error('Falta trabajo agregado');
    expect(await WorkOrderDpStage.count({ where: { workOrderItemId: item.id, status: 'pendiente' } })).toBe(5);
    const line = await mirror(f, item.id);
    expect(line?.division).toBe('DP'); expect(line?.subtipo).toBe('servicio_dp');
    expect(line?.descuentoTipo).toBe('porcentaje'); expect(Number(line?.descuentoValor)).toBe(10);
    expect(Number(line?.subtotal)).toBe(108000);
    const lines = await QuotationItem.findAll({ where: { quotationId: f.quotation.id } });
    expect(Number((await f.quotation.reload()).total)).toBe(calculateQuotationPricing(lines).total);
  }, 20_000);

  it('keeps consumed stock and custody signatures on COT price edits and blocks changing a delivered quantity', async () => {
    const f = await fixture();
    const part = await CatalogItem.create({ tipo: 'parte', division: 'ACC', subtipo: 'en_stock', nombre: `Repuesto ${tag}`, precio: 85000, stock: 5 });
    await StockBalance.create({ warehouseId: warehouse.id, catalogItemId: part.id, cantidad: 5 });
    await f.acc.update({ catalogItemId: part.id });
    const acc = await mirror(f, f.acc.id);
    if (!acc) throw new Error('Falta repuesto espejo');
    await acc.update({ catalogItemId: part.id });
    const delivered = await mutate('patch', custodyPath(f), { entregado: true, warehouseId: warehouse.id }, 'warehouse');
    expect(delivered.status, JSON.stringify(delivered.body)).toBe(200);
    const deliveredAt = (await f.acc.reload()).entregadoBodegaAt;
    const movements = await StockMovement.count({ where: { catalogItemId: part.id } });
    const lines = await QuotationItem.findAll({ where: { quotationId: f.quotation.id }, order: [['id', 'ASC']] });
    const inputs = lines.map((line) => ({ id: line.id, catalogItemId: line.catalogItemId, tipoLinea: line.tipoLinea, division: line.division, subtipo: line.subtipo ?? undefined, descripcion: line.descripcion, cantidad: Number(line.cantidad), precioUnitario: Number(line.precioUnitario), estadoOperativo: line.estadoOperativo }));
    const edited = await mutate('patch', `/api/quotations/${f.quotation.id}`, { items: inputs.map((line) => line.id === acc.id ? { ...line, precioUnitario: 90000 } : line) });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect(Number((await StockBalance.findOne({ where: { warehouseId: warehouse.id, catalogItemId: part.id } }))?.cantidad)).toBe(4);
    expect(await StockMovement.count({ where: { catalogItemId: part.id } })).toBe(movements);
    expect((await f.acc.reload()).toJSON()).toMatchObject({ stockConsumido: true, stockConsumidoWarehouseId: warehouse.id, entregadoBodega: true, bodegueroUserId: actors.warehouse.user.id });
    expect(f.acc.entregadoBodegaAt).toEqual(deliveredAt);
    const beforeTotal = Number((await f.quotation.reload()).total);
    expect((await mutate('patch', `/api/quotations/${f.quotation.id}`, { items: inputs.map((line) => line.id === acc.id ? { ...line, cantidad: 2 } : line) })).status).toBe(400);
    expect(Number((await f.acc.reload()).cantidad)).toBe(1);
    expect(Number((await f.quotation.reload()).total)).toBe(beforeTotal);
    expect(Number((await StockBalance.findOne({ where: { warehouseId: warehouse.id, catalogItemId: part.id } }))?.cantidad)).toBe(4);
    expect(await StockMovement.count({ where: { catalogItemId: part.id } })).toBe(movements);
  }, 20_000);

  it('preserves valid D&P and a-pedido classifications, prices and stages across repeated startup migrations', async () => {
    const f = await fixture();
    const dpCatalog = await CatalogItem.create({ tipo: 'estandar', division: 'DP', subtipo: 'servicio_dp', nombre: `Pieza ${tag}`, precio: 120000, horasHombreEstandar: 4 });
    const partCatalog = await CatalogItem.create({ tipo: 'parte', division: 'ACC', subtipo: 'a_pedido', nombre: `Encargo ${tag}`, precio: 85000, stock: 0 });
    await complete(f, 0);
    const stageBefore = (await f.stages[0].reload()).toJSON();
    for (let repeat = 0; repeat < 2; repeat++) await ensureDivisions(sequelize.getQueryInterface());
    expect((await dpCatalog.reload()).toJSON()).toMatchObject({ division: 'DP', subtipo: 'servicio_dp' });
    expect(Number(dpCatalog.precio)).toBe(120000);
    expect(Number(dpCatalog.horasHombreEstandar)).toBe(4);
    expect((await partCatalog.reload()).toJSON()).toMatchObject({ division: 'ACC', subtipo: 'a_pedido' });
    expect((await f.dp.reload()).division).toBe('DP');
    expect((await mirror(f))?.division).toBe('DP');
    expect((await f.stages[0].reload()).toJSON()).toEqual(stageBefore);
    expect(await WorkOrderDpStage.count({ where: { workOrderItemId: f.dp.id } })).toBe(5);
  }, 20_000);
});
