import { randomUUID } from 'node:crypto';

import { dpConfigurationRecordSchema } from '@unithor/shared';
import { Op } from 'sequelize';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { sequelize } from '../../config/database.js';
import { up as migrate } from '../../database/migrations/064-dp-configuration.js';
import { app } from '../../main.js';
import {
  Client,
  DpConfiguration,
  DpConfigurationRevision,
  Quotation,
  QuotationItem,
  Role,
  User,
  Vehicle,
  WorkOrder,
  WorkOrderDpStage,
  WorkOrderItem,
} from '../../models/index.js';
import { hashPassword } from '../../utils/password.js';

import type { DpConfigurationRecord, DpQuoteInput } from '@unithor/shared';

interface Auth {
  cookies: string[];
  csrf: string;
  id: number;
}
type Actor = 'admin' | 'desarrollador' | 'jefe' | 'vendedor' | 'bodeguero';
const tag = randomUUID().slice(0, 8);
const password = 'DpConfiguration2026!';

describe('Configuración y catálogo paramétrico D&P (unithor_test)', () => {
  const actors = {} as Record<Actor, Auth>;
  let original: DpConfigurationRecord;
  let originalEditor: number | null;
  let client: Client;
  let vehicle: Vehicle;
  const mutate = (path: string, body: object, method: 'post' | 'patch' = 'post') => {
    const call = request(app);
    return call[method](path)
      .set('Cookie', actors.desarrollador.cookies)
      .set('X-CSRF-Token', actors.desarrollador.csrf)
      .send(body);
  };
  const work = () => ({
    tipoLinea: 'estandar',
    division: 'DP',
    subtipo: 'servicio_dp',
    descripcion: 'Parachoque delantero D&P',
    cantidad: 1,
    precioUnitario: 1,
    dpPricing: selection(),
  });
  const read = (path = '/api/settings/dp', actor: Actor = 'desarrollador') =>
    request(app).get(path).set('Cookie', actors[actor].cookies);
  const save = (
    configuration = original.configuration,
    expectedRevision = original.revision,
    actor: Actor = 'desarrollador',
  ) =>
    request(app)
      .put('/api/settings/dp')
      .set('Cookie', actors[actor].cookies)
      .set('X-CSRF-Token', actors[actor].csrf)
      .send({ expectedRevision, configuration });
  const selection = (): DpQuoteInput => ({
    configurationRevision: original.revision,
    bodyTypeId: 'hatchback',
    sizeId: 'S',
    pieceId: 'parachoque',
    positionId: 'F',
    damageLevelId: 'D2',
    scope: 'piece',
    operations: [
      { operationId: 'repair_plastic' },
      { operationId: 'painting_full' },
      { operationId: 'dismantling' },
    ],
  });
  const quote = (input = selection(), actor: Actor = 'vendedor') =>
    request(app)
      .post('/api/catalog/dp/quote')
      .set('Cookie', actors[actor].cookies)
      .set('X-CSRF-Token', actors[actor].csrf)
      .send(input);

  beforeAll(async () => {
    if (sequelize.getDatabaseName() !== 'unithor_test')
      throw new Error('Pruebas D&P requieren unithor_test');
    const hash = await hashPassword(password);
    for (const actor of ['admin', 'desarrollador', 'jefe', 'vendedor', 'bodeguero'] as const) {
      const role = await Role.findOne({ where: { nombre: actor } });
      if (!role) throw new Error(`Falta rol ${actor}`);
      const user = await User.create({
        nombre: `D&P ${actor}`,
        email: `dp-${actor}-${tag}@example.test`,
        passwordHash: hash,
        roleId: role.id,
        activo: true,
      });
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password });
      expect(login.status, JSON.stringify(login.body)).toBe(200);
      const raw: unknown = login.headers['set-cookie'];
      const cookies = (
        Array.isArray(raw) ? raw.filter((value): value is string => typeof value === 'string') : []
      ).map((value) => value.split(';')[0]);
      const csrf = cookies.find((value) => value.startsWith('csrf_token='))?.slice(11);
      if (!csrf) throw new Error('Falta CSRF');
      actors[actor] = { id: user.id, cookies, csrf };
    }
    const response = await read();
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    original = dpConfigurationRecordSchema.parse(response.body);
    originalEditor = (await DpConfiguration.findByPk(1))?.updatedBy ?? null;
    client = await Client.create({ tipo: 'cliente', nombre: `Cliente D&P ${tag}` });
    vehicle = await Vehicle.create({
      patente: `P${tag.slice(0, 5).toUpperCase()}`,
      clientId: client.id,
    });
  }, 30_000);

  afterEach(async () => {
    vi.restoreAllMocks();
    if (!original) return;
    await DpConfiguration.update(
      {
        configuration: original.configuration,
        revision: original.revision,
        updatedBy: originalEditor,
      },
      { where: { id: 1 } },
    );
    await DpConfigurationRevision.destroy({ where: { revision: { [Op.gt]: original.revision } } });
  });
  afterAll(async () => {
    await sequelize.close();
  });

  it('exige sesión y protege configuración y cálculo con CSRF', async () => {
    expect((await request(app).get('/api/settings/dp')).status).toBe(401);
    expect((await request(app).get('/api/catalog/dp')).status).toBe(401);
    expect(
      (
        await request(app)
          .put('/api/settings/dp')
          .set('Cookie', actors.desarrollador.cookies)
          .send({ expectedRevision: original.revision, configuration: original.configuration })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/catalog/dp/quote')
          .set('Cookie', actors.vendedor.cookies)
          .send(selection())
      ).status,
    ).toBe(403);
  });

  it('permite consultar el catálogo al taller y comercial, sin permitirles editar la configuración', async () => {
    for (const actor of ['jefe', 'vendedor', 'bodeguero'] as const) {
      expect((await read('/api/catalog/dp', actor)).status).toBe(200);
      expect((await read('/api/settings/dp', actor)).status).toBe(403);
      expect((await save(original.configuration, original.revision, actor)).status).toBe(403);
    }
    expect(
      dpConfigurationRecordSchema.safeParse((await read('/api/catalog/dp')).body).success,
    ).toBe(true);
  });

  it('calcula el ejemplo confirmado con D2 sumado al tamaño, neto e IVA', async () => {
    const response = await quote();
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.quote).toMatchObject({
      configurationRevision: original.revision,
      neto: 129850,
      precioUnitario: 129850,
      iva: 24672,
      total: 154522,
    });
    expect(response.body.quote.lines.map((line: { subtotal: number }) => line.subtotal)).toEqual([
      27000, 84150, 18700,
    ]);
    expect(response.body.quote.stages).toHaveLength(5);
  });

  it('mantiene tarifas aún desconocidas pendientes y rechaza ubicaciones inventadas', async () => {
    const unpriced = await quote({
      ...selection(),
      damageLevelId: undefined,
      operations: [{ operationId: 'polishing_piece' }],
    });
    expect(unpriced.status).toBe(422);
    expect(unpriced.body.error.message).toMatch(/tarifa|precio/i);
    expect((await quote({ ...selection(), positionId: 'INVENTADA' })).status).toBe(422);
  });

  it('guarda una revisión con autor y consulta su historial sin sobrescribir datos anteriores', async () => {
    const configuration = structuredClone(original.configuration);
    configuration.tables.find((table) => table.id === 'painting')!.basePrice = 100000;
    const updated = await save(configuration, original.revision, 'admin');
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    expect(updated.body).toMatchObject({
      revision: original.revision + 1,
      lastEditor: { id: actors.admin.id },
    });
    const previous = await DpConfigurationRevision.findByPk(original.revision);
    expect(previous?.configuration).toEqual(original.configuration);
    const history = await read('/api/settings/dp/history');
    expect(history.status).toBe(200);
    expect(history.body.items[0]).toMatchObject({
      revision: original.revision + 1,
      editor: { id: actors.admin.id },
    });
    const stale = await quote();
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('DP_CONFIGURATION_CHANGED');
  });

  it('rechaza escrituras concurrentes sobre la misma revisión', async () => {
    const a = structuredClone(original.configuration);
    const b = structuredClone(original.configuration);
    a.tables[0].basePrice = 100001;
    b.tables[0].basePrice = 100002;
    const responses = await Promise.all([save(a), save(b)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect((await DpConfiguration.findByPk(1))?.revision).toBe(original.revision + 1);
    expect(
      await DpConfigurationRevision.count({ where: { revision: { [Op.gt]: original.revision } } }),
    ).toBe(1);
  });

  it('revierte la configuración completa si falla su registro histórico', async () => {
    vi.spyOn(DpConfigurationRevision, 'create').mockRejectedValueOnce(
      new Error('Fallo simulado del historial'),
    );
    expect((await save()).status).toBe(500);
    const row = await DpConfiguration.findByPk(1);
    expect(row?.revision).toBe(original.revision);
    expect(row?.configuration).toEqual(original.configuration);
  });

  it('conserva exactamente cinco pasos, referencias válidas y campos estrictos', async () => {
    const configuration = structuredClone(original.configuration);
    configuration.stages.pop();
    expect((await save(configuration)).status).toBe(400);
    const invalid = structuredClone(original.configuration);
    invalid.rates[0].pieceId = 'no-existe';
    expect((await save(invalid)).status).toBe(400);
    const injected = { ...original.configuration, precioUnitario: 1 };
    expect((await save(injected)).status).toBe(400);
  });

  it('la migración se puede repetir sin restaurar bases por defecto ni perder revisiones', async () => {
    const configuration = structuredClone(original.configuration);
    configuration.tables[0].basePrice = 87654;
    expect((await save(configuration)).status).toBe(200);
    await migrate(sequelize.getQueryInterface());
    await migrate(sequelize.getQueryInterface());
    const current = dpConfigurationRecordSchema.parse((await read()).body);
    expect(current.configuration.tables[0].basePrice).toBe(87654);
    expect(current.revision).toBe(original.revision + 1);
  });

  it('calcula el precio en el servidor al crear una OT y guarda el mismo desglose en su COT espejo', async () => {
    const response = await mutate('/api/work-orders', {
      clientId: client.id,
      vehicleId: vehicle.id,
      items: [work()],
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const id = (response.body as { workOrder: { id: number } }).workOrder.id;
    const item = await WorkOrderItem.findOne({ where: { workOrderId: id } });
    const quotation = await Quotation.findOne({ where: { workOrderId: id } });
    const mirror = await QuotationItem.findOne({
      where: { quotationId: quotation!.id, workOrderItemId: item!.id },
    });
    expect(Number(item?.precioUnitario)).toBe(129850);
    expect(item?.dpPricingSnapshot).toMatchObject({
      configurationRevision: original.revision,
      neto: 129850,
    });
    expect(mirror?.dpPricingSnapshot).toEqual(item?.dpPricingSnapshot);
    const stages = await WorkOrderDpStage.findAll({
      where: { workOrderItemId: item!.id },
      order: [['stageIndex', 'ASC']],
    });
    expect(stages.map((stage) => stage.stageLabel)).toEqual(
      original.configuration.stages.map((stage) => stage.label),
    );
    expect(stages.map((stage) => stage.allowedSpecialties)).toEqual(
      original.configuration.stages.map((stage) => stage.specialties),
    );
  });

  it('conserva el importe y desglose históricos al convertir una COT tras actualizar las tarifas', async () => {
    const created = await mutate('/api/quotations', {
      clientId: client.id,
      vehicleId: vehicle.id,
      items: [work()],
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const quotationId = (created.body as { quotation: { id: number } }).quotation.id;
    const item = await QuotationItem.findOne({ where: { quotationId } });
    expect(Number(item?.precioUnitario)).toBe(129850);
    const snapshot = item?.dpPricingSnapshot;
    const config = structuredClone(original.configuration);
    config.tables.find((table) => table.id === 'painting')!.basePrice = 100000;
    config.stages[0].label = 'Nuevo nombre para futuras órdenes';
    expect((await save(config)).status).toBe(200);
    const converted = await mutate(`/api/quotations/${quotationId}/convert-to-ot`, {
      vehicleId: vehicle.id,
    });
    expect(converted.status, JSON.stringify(converted.body)).toBe(201);
    const quotation = await Quotation.findByPk(quotationId);
    const copied = await WorkOrderItem.findOne({ where: { workOrderId: quotation!.workOrderId! } });
    expect(Number(copied?.precioUnitario)).toBe(129850);
    expect(copied?.dpPricingSnapshot).toEqual(snapshot);
    const stage = await WorkOrderDpStage.findOne({
      where: { workOrderItemId: copied!.id, stageIndex: 1 },
    });
    expect(stage?.stageLabel).toBe(original.configuration.stages[0].label);
    const updated = await mutate(
      `/api/quotations/${quotationId}`,
      {
        items: [
          {
            id: item!.id,
            tipoLinea: 'estandar',
            division: 'DP',
            subtipo: 'servicio_dp',
            descripcion: item!.descripcion,
            cantidad: 1,
            precioUnitario: 129850,
          },
        ],
      },
      'patch',
    );
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    expect((await copied!.reload()).dpPricingSnapshot).toEqual(snapshot);
    expect((await item!.reload()).dpPricingSnapshot).toEqual(snapshot);
  });

  it('rechaza tarifas obsoletas o un cálculo D&P usado para un repuesto sin dejar OT/COT huérfanas', async () => {
    const before = { orders: await WorkOrder.count(), quotations: await Quotation.count() };
    expect(
      (
        await mutate('/api/work-orders', {
          clientId: client.id,
          vehicleId: vehicle.id,
          items: [
            {
              ...work(),
              dpPricing: { ...selection(), configurationRevision: original.revision + 100 },
            },
          ],
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await mutate('/api/quotations', {
          clientId: client.id,
          items: [{ ...work(), tipoLinea: 'parte', division: 'ACC', subtipo: 'en_stock' }],
        })
      ).status,
    ).toBe(400);
    expect(await WorkOrder.count()).toBe(before.orders);
    expect(await Quotation.count()).toBe(before.quotations);
  });

  it('el recálculo no permite al jefe eludir la aprobación de cambios de precio', async () => {
    const created = await mutate('/api/work-orders', { clientId: client.id, vehicleId: vehicle.id, items: [work()] });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const orderId = (created.body as { workOrder: { id: number } }).workOrder.id;
    const item = await WorkOrderItem.findOne({ where: { workOrderId: orderId } });
    const cot = await Quotation.findOne({ where: { workOrderId: orderId } });
    const line = await QuotationItem.findOne({ where: { quotationId: cot!.id } });
    const snapshot = item?.dpPricingSnapshot;
    const config = structuredClone(original.configuration);
    config.tables.find((table) => table.id === 'painting')!.basePrice = 100000;
    expect((await save(config)).status).toBe(200);
    const dpPricing = { ...selection(), configurationRevision: original.revision + 1 };
    for (const [path, id] of [[`/api/work-orders/${orderId}`, item!.id], [`/api/quotations/${cot!.id}`, line!.id]] as const) {
      const response = await request(app).patch(path).set('Cookie', actors.jefe.cookies).set('X-CSRF-Token', actors.jefe.csrf)
        .send({ items: [{ ...work(), id, dpPricing, precioUnitario: 129850 }] });
      expect(response.status, JSON.stringify(response.body)).toBe(403);
    }
    expect(Number((await item!.reload()).precioUnitario)).toBe(129850);
    expect(item!.dpPricingSnapshot).toEqual(snapshot);
    expect((await line!.reload()).dpPricingSnapshot).toEqual(snapshot);
  });

  it('aplica la nueva plantilla solo a trabajos nuevos, sin reordenar o renombrar etapas existentes', async () => {
    const plain = { ...work(), dpPricing: undefined, precioUnitario: 20000 };
    const first = await mutate('/api/work-orders', {
      clientId: client.id,
      vehicleId: vehicle.id,
      items: [plain],
    });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const firstId = (first.body as { workOrder: { id: number } }).workOrder.id;
    const before = await WorkOrderDpStage.findAll({
      where: { workOrderId: firstId },
      order: [['stageIndex', 'ASC']],
    });
    const config = structuredClone(original.configuration);
    config.stages[0].label =
      'Armador / desarme e inspección inicial de las piezas y sus fijaciones';
    config.stages[0].specialties = ['carrocero'];
    expect((await save(config)).status).toBe(200);
    const second = await mutate('/api/work-orders', {
      clientId: client.id,
      vehicleId: vehicle.id,
      items: [plain],
    });
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    const secondId = (second.body as { workOrder: { id: number } }).workOrder.id;
    const current = await WorkOrderDpStage.findOne({
      where: { workOrderId: secondId, stageIndex: 1 },
    });
    expect(current?.stageLabel).toBe(config.stages[0].label);
    expect(current?.allowedSpecialties).toEqual(['carrocero']);
    const preserved = await WorkOrderDpStage.findAll({
      where: { workOrderId: firstId },
      order: [['stageIndex', 'ASC']],
    });
    expect(preserved.map((stage) => stage.toJSON())).toEqual(before.map((stage) => stage.toJSON()));
  });
});
