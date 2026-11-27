import { randomUUID } from 'node:crypto';

import { calculateDpWorkQuote, dpConfigurationRecordSchema, DP_STAGE_KEYS } from '@unithor/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { sequelize } from '../../config/database.js';
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
  WorkOrderEvent,
  WorkOrderItem,
  WorkOrderItemAssignment,
  WorkOrderItemProgressEvent,
  WorkOrderItemSession,
  WorkOrderQualityReview,
  WorkshopTimeRequest,
} from '../../models/index.js';
import * as permissionService from '../../services/permission.service.js';
import { hashPassword } from '../../utils/password.js';

import type { WorkOrderPublic } from '../../services/work-order.service.js';
import type { DpConfigurationRecord, DpQuoteInput } from '@unithor/shared';

type Source = 'OT' | 'COT';
type Actor = 'desarrollador' | 'jefe' | 'mecanico' | 'bodeguero';
interface Auth {
  user: User;
  cookies: string[];
  csrf: string;
}
interface Fixture {
  order: WorkOrder;
  quotation: Quotation;
  dp: WorkOrderItem;
  other: WorkOrderItem;
  dpLine: QuotationItem;
  otherLine: QuotationItem;
  stages: WorkOrderDpStage[];
}

const tag = randomUUID().slice(0, 8);
const password = 'DpIntegrity2026!';

describe('OT/COT D&P technical identity and completion integrity (unithor_test only)', () => {
  const actors = {} as Record<Actor, Auth>;
  let client: Client;
  let vehicle: Vehicle;
  let original: DpConfigurationRecord;
  let originalEditor: number | null;
  let changedConfiguration = false;

  const mutate = (
    method: 'post' | 'patch' | 'put',
    path: string,
    body: object,
    actor: Actor = 'desarrollador',
  ) => {
    const call = request(app);
    return call[method](path)
      .set('Cookie', actors[actor].cookies)
      .set('X-CSRF-Token', actors[actor].csrf)
      .send(body);
  };
  const path = (f: Fixture, source: Source) =>
    source === 'OT' ? `/api/work-orders/${f.order.id}` : `/api/quotations/${f.quotation.id}`;
  const ccfPath = (f: Fixture) => `/api/work-orders/${f.order.id}/items/${f.dp.id}/dp-ccf`;
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
  const work = () => ({
    tipoLinea: 'estandar' as const,
    division: 'DP' as const,
    subtipo: 'servicio_dp' as const,
    descripcion: 'Trabajo D&P con identidad estable',
    cantidad: 1,
    unidadMedida: 'unidad' as const,
    precioUnitario: 1,
    horasHombreEstimadas: 6.5,
    estadoOperativo: 'pendiente' as const,
    notasOperativas: 'Conservar observaciones originales',
    dpPricing: selection(),
  });
  const input = (item: WorkOrderItem | QuotationItem) => ({
    id: item.id,
    catalogItemId: item.catalogItemId,
    tipoLinea: item.tipoLinea,
    division: item.division,
    subtipo: item.subtipo,
    descripcion: item.descripcion,
    cantidad: Number(item.cantidad),
    unidadMedida: item.unidadMedida,
    precioUnitario: Number(item.precioUnitario),
    estadoOperativo: item.estadoOperativo,
    notasOperativas: item.notasOperativas,
  });
  // Put a separately edited row first so rejection must also undo any earlier writes.
  const items = (f: Fixture, source: Source, dpPatch: object = {}, otherPatch: object = {}) => [
    { ...input(source === 'OT' ? f.other : f.otherLine), ...otherPatch },
    { ...input(source === 'OT' ? f.dp : f.dpLine), ...dpPatch },
  ];
  const precedingEdit = { precioUnitario: 12345, notasOperativas: 'Este cambio debe revertirse' };

  beforeAll(async () => {
    if (sequelize.getDatabaseName() !== 'unithor_test') {
      throw new Error('D&P integrity route tests require unithor_test');
    }
    await sequelize.authenticate();
    const passwordHash = await hashPassword(password);
    for (const actor of ['desarrollador', 'jefe', 'mecanico', 'bodeguero'] as const) {
      const role = await Role.findOne({ where: { nombre: actor } });
      if (!role) throw new Error(`Falta rol ${actor}`);
      const user = await User.create({
        nombre: `DP integrity ${actor}`,
        email: `dp-integrity-${actor}-${tag}@example.test`,
        passwordHash,
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
      if (!csrf) throw new Error('Falta cookie CSRF');
      actors[actor] = { user, cookies, csrf };
    }
    const catalog = await request(app)
      .get('/api/catalog/dp')
      .set('Cookie', actors.desarrollador.cookies);
    expect(catalog.status, JSON.stringify(catalog.body)).toBe(200);
    original = dpConfigurationRecordSchema.parse(catalog.body);
    originalEditor = (await DpConfiguration.findByPk(1))?.updatedBy ?? null;
    client = await Client.create({ tipo: 'cliente', nombre: `Cliente DP integrity ${tag}` });
    vehicle = await Vehicle.create({
      patente: `I${tag.slice(0, 5).toUpperCase()}`,
      clientId: client.id,
    });
  }, 30_000);

  afterEach(async () => {
    if (!changedConfiguration) return;
    await DpConfiguration.update(
      {
        configuration: original.configuration,
        revision: original.revision,
        updatedBy: originalEditor,
      },
      { where: { id: 1 } },
    );
    await DpConfigurationRevision.destroy({ where: { revision: original.revision + 1 } });
    changedConfiguration = false;
  });
  afterAll(async () => {
    await sequelize.close();
  });

  const fixture = async (): Promise<Fixture> => {
    const response = await mutate('post', '/api/work-orders', {
      clientId: client.id,
      vehicleId: vehicle.id,
      descripcion: 'Orden para regresión de identidad D&P',
      items: [
        work(),
        {
          tipoLinea: 'estandar',
          division: 'MEC',
          subtipo: 'estandar',
          descripcion: 'Servicio mecánico independiente',
          cantidad: 1,
          unidadMedida: 'unidad',
          precioUnitario: 9000,
          horasHombreEstimadas: 2,
          notasOperativas: 'Observación del otro servicio',
        },
      ],
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const { id } = (response.body as { workOrder: WorkOrderPublic }).workOrder;
    const order = await WorkOrder.findByPk(id);
    const quotation = await Quotation.findOne({ where: { workOrderId: id } });
    const rows = await WorkOrderItem.findAll({ where: { workOrderId: id } });
    const dp = rows.find((item) => item.division === 'DP');
    const other = rows.find((item) => item.division === 'MEC');
    if (!order || !quotation || !dp || !other) throw new Error('Falta OT, COT o sus trabajos');
    const dpLine = await QuotationItem.findOne({
      where: { quotationId: quotation.id, workOrderItemId: dp.id },
    });
    const otherLine = await QuotationItem.findOne({
      where: { quotationId: quotation.id, workOrderItemId: other.id },
    });
    if (!dpLine || !otherLine) throw new Error('Faltan vínculos OT/COT');
    await quotation.update({ notas: 'Condiciones comerciales originales' });
    const stages = await WorkOrderDpStage.findAll({
      where: { workOrderItemId: dp.id },
      order: [['stageIndex', 'ASC']],
    });
    expect(stages.map((stage) => stage.stageKey)).toEqual([...DP_STAGE_KEYS]);
    expect(dp.dpPricingSnapshot?.selection).toMatchObject(selection());
    return { order, quotation, dp, other, dpLine, otherLine, stages };
  };

  const state = async (f: Fixture) => {
    const where = { workOrderId: f.order.id };
    const [
      order,
      quotation,
      workItems,
      quotationItems,
      stages,
      reviews,
      sessions,
      requests,
      assignments,
      progress,
      events,
    ] = await Promise.all([
      WorkOrder.findByPk(f.order.id),
      Quotation.findByPk(f.quotation.id),
      WorkOrderItem.findAll({ where, order: [['id', 'ASC']] }),
      QuotationItem.findAll({ where: { quotationId: f.quotation.id }, order: [['id', 'ASC']] }),
      WorkOrderDpStage.findAll({ where, order: [['id', 'ASC']] }),
      WorkOrderQualityReview.findAll({ where, order: [['id', 'ASC']] }),
      WorkOrderItemSession.findAll({ where, order: [['id', 'ASC']] }),
      WorkshopTimeRequest.findAll({ where, order: [['id', 'ASC']] }),
      WorkOrderItemAssignment.findAll({ where, order: [['id', 'ASC']] }),
      WorkOrderItemProgressEvent.findAll({ where, order: [['id', 'ASC']] }),
      WorkOrderEvent.findAll({ where, order: [['id', 'ASC']] }),
    ]);
    if (!order || !quotation) throw new Error('Desapareció la OT o la COT');
    return {
      order: order.toJSON(),
      quotation: quotation.toJSON(),
      workItems: workItems.map((row) => row.toJSON()),
      quotationItems: quotationItems.map((row) => row.toJSON()),
      stages: stages.map((row) => row.toJSON()),
      reviews: reviews.map((row) => row.toJSON()),
      sessions: sessions.map((row) => row.toJSON()),
      requests: requests.map((row) => row.toJSON()),
      assignments: assignments.map((row) => row.toJSON()),
      progress: progress.map((row) => row.toJSON()),
      events: events.map((row) => row.toJSON()),
    };
  };
  type StoredState = Awaited<ReturnType<typeof state>>;
  type PricingFields = Pick<
    QuotationItem,
    'precioUnitario' | 'subtotal' | 'dpPricingSnapshot' | 'updatedAt'
  >;
  const withoutPrice = <T extends PricingFields>(row: T) => {
    const {
      precioUnitario: _price,
      subtotal: _subtotal,
      dpPricingSnapshot: _pricing,
      updatedAt: _updatedAt,
      ...rest
    } = row;
    return rest;
  };
  const execution = (saved: StoredState) => ({
    workItems: saved.workItems.map(withoutPrice),
    quotationItems: saved.quotationItems.map(withoutPrice),
    stages: saved.stages,
    reviews: saved.reviews,
    sessions: saved.sessions,
    requests: saved.requests,
    assignments: saved.assignments,
    progress: saved.progress,
    order: {
      estado: saved.order.estado,
      qualityApprovedAt: saved.order.qualityApprovedAt,
      qualityApprovedBy: saved.order.qualityApprovedBy,
      qualityApprovalNote: saved.order.qualityApprovalNote,
    },
    notas: saved.quotation.notas,
  });
  const expectRejected = async (f: Fixture, source: Source, body: object) => {
    const before = await state(f);
    const response = await mutate('patch', path(f, source), body);
    expect(response.status, JSON.stringify(response.body)).toBe(400);
    expect(await state(f)).toEqual(before);
  };

  const session = (f: Fixture, durationMinutes = 45) =>
    WorkOrderItemSession.create({
      workOrderId: f.order.id,
      workOrderItemId: f.dp.id,
      dpStageId: f.stages[0].id,
      userId: actors.mecanico.user.id,
      userName: actors.mecanico.user.nombre,
      kind: 'manual',
      status: 'cerrada',
      startedAt: new Date(Date.now() - durationMinutes * 60_000),
      endedAt: new Date(),
      durationMinutes,
      closeReason: 'completado',
      note: 'Horas históricas originales',
      createdBy: actors.mecanico.user.id,
    });
  const timeRequest = (f: Fixture) =>
    WorkshopTimeRequest.create({
      clientRequestId: randomUUID(),
      kind: 'manual',
      status: 'pendiente',
      workOrderId: f.order.id,
      workOrderItemId: f.dp.id,
      dpStageId: f.stages[0].id,
      userId: actors.mecanico.user.id,
      userName: actors.mecanico.user.nombre,
      sourceSessionId: null,
      replacementSessionId: null,
      activityStatus: 'en_proceso',
      startedAt: new Date(Date.now() - 45 * 60_000),
      endedAt: new Date(),
      durationMinutes: 45,
      note: 'Actividad registrada antes de reabrir',
      createdBy: actors.mecanico.user.id,
    });
  const review = (f: Fixture, itemId: number | null = f.dp.id) =>
    WorkOrderQualityReview.create({
      workOrderId: f.order.id,
      workOrderItemId: itemId,
      decision: 'aprobado',
      reviewedBy: actors.jefe.user.id,
      reviewerName: actors.jefe.user.nombre,
      note: 'Aprobación original conservada',
    });
  const approveDp = async (f: Fixture) => {
    // Seed execution/approval directly: these regressions exercise editing, not the stage UI.
    const now = new Date();
    for (const [index, stage] of f.stages.entries()) {
      await stage.update({
        status: 'completado',
        assignedUserId: actors.mecanico.user.id,
        assignedUserName: actors.mecanico.user.nombre,
        startedAt: new Date(now.getTime() - 60_000),
        completedAt: now,
        note: `Nota histórica de etapa ${index + 1}`,
      });
    }
    await session(f, 435);
    const activity = await timeRequest(f);
    await activity.update({
      status: 'aprobada',
      reviewedBy: actors.jefe.user.id,
      reviewedAt: now,
      reviewNote: 'Horas revisadas',
    });
    await f.dp.update({
      estadoOperativo: 'completado',
      horasHombreReales: 7.25,
      qualityStatus: 'aprobado',
      qualityReviewedBy: actors.jefe.user.id,
      qualityReviewedAt: now,
      qualityNote: 'Calidad original',
      ccfStatus: 'aprobado',
      ccfReviewedBy: actors.jefe.user.id,
      ccfReviewedAt: now,
      ccfNotes: 'Terminación original',
      laborValidatedBy: actors.jefe.user.id,
      laborValidatedAt: now,
      laborValidationNote: 'Horas originales validadas',
    });
    await f.dpLine.update({ estadoOperativo: 'completado' });
    await review(f);
  };
  const approvedFixture = async () => {
    const f = await fixture();
    await approveDp(f);
    const now = new Date();
    await f.other.update({
      estadoOperativo: 'completado',
      qualityStatus: 'aprobado',
      qualityReviewedBy: actors.jefe.user.id,
      qualityReviewedAt: now,
      qualityNote: 'Calidad mecánica original',
    });
    await f.otherLine.update({ estadoOperativo: 'completado' });
    await review(f, f.other.id);
    await review(f, null);
    await f.order.update({
      qualityApprovedAt: now,
      qualityApprovedBy: actors.jefe.user.id,
      qualityApprovalNote: 'Confirmación final original',
    });
    return f;
  };

  describe.each<Source>(['OT', 'COT'])('PATCH through %s', (source) => {
    it.each(['piece', 'operations'] as const)(
      'rejects a different %s on approved/completed D&P with the same description and status, atomically',
      async (change) => {
        const f = await approvedFixture();
        const dpPricing =
          change === 'piece'
            ? { ...selection(), pieceId: 'puerta', positionId: 'FL' }
            : {
                ...selection(),
                operations: [{ operationId: 'repair_plastic' }, { operationId: 'painting_full' }],
              };
        await expectRejected(f, source, { items: items(f, source, { dpPricing }, precedingEdit) });
      },
      20_000,
    );

    it.each([
      'assignment',
      'stage note',
      'stage timestamps',
      'session',
      'time request',
      'assignment history',
      'progress history',
      'quality history',
    ] as const)(
      'rejects a technical selection change with %s even while all stages are pending',
      async (history) => {
        const f = await fixture();
        const worker = actors.mecanico.user;
        switch (history) {
          case 'assignment':
            await f.stages[0].update({
              assignedUserId: worker.id,
              assignedUserName: worker.nombre,
            });
            break;
          case 'stage note':
            await f.stages[0].update({ note: 'Trabajo reabierto; conservar la nota' });
            break;
          case 'stage timestamps':
            await f.stages[0].update({
              startedAt: new Date(Date.now() - 60_000),
              completedAt: new Date(),
            });
            break;
          case 'session':
            await session(f);
            break;
          case 'time request':
            await timeRequest(f);
            break;
          case 'assignment history':
            await WorkOrderItemAssignment.create({
              workOrderId: f.order.id,
              workOrderItemId: f.dp.id,
              userId: worker.id,
              userName: worker.nombre,
              active: false,
              estimatedHours: 2,
              originalEstimatedHours: 2,
              createdBy: actors.jefe.user.id,
            });
            break;
          case 'progress history':
            await WorkOrderItemProgressEvent.create({
              workOrderId: f.order.id,
              workOrderItemId: f.dp.id,
              itemDescripcion: f.dp.descripcion,
              fromStatus: 'en_proceso',
              toStatus: 'pendiente',
              performedByUserId: actors.jefe.user.id,
              assignedUserId: worker.id,
              horasDelta: 0,
              fechaEfectiva: new Date().toISOString().slice(0, 10),
              source: 'reverso',
              note: 'Reapertura del trabajo original',
            });
            break;
          case 'quality history':
            await review(f);
            break;
        }
        expect((await f.dp.reload()).estadoOperativo).toBe('pendiente');
        expect(
          await WorkOrderDpStage.count({
            where: { workOrderItemId: f.dp.id, status: 'pendiente' },
          }),
        ).toBe(5);
        await expectRejected(f, source, {
          items: items(
            f,
            source,
            {
              dpPricing: {
                ...selection(),
                operations: [{ operationId: 'repair_plastic' }, { operationId: 'painting_full' }],
              },
            },
            precedingEdit,
          ),
        });
      },
      20_000,
    );

    it('allows a pristine technical change but requires fresh stages and quality validation', async () => {
      const f = await fixture();
      // Legacy final-approval metadata must not survive a new technical selection.
      await f.order.update({
        qualityApprovedAt: new Date(),
        qualityApprovedBy: actors.jefe.user.id,
        qualityApprovalNote: 'Confirmación anterior',
      });
      const before = await state(f);
      const dpPricing = {
        ...selection(),
        pieceId: 'puerta',
        positionId: 'FL',
        operations: [{ operationId: 'repair_dent' }, { operationId: 'painting_full' }],
      };
      const expected = calculateDpWorkQuote(original.configuration, dpPricing, original.revision);
      const response = await mutate('patch', path(f, source), {
        items: items(f, source, { dpPricing }),
      });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      const after = await state(f);
      expect(after.workItems.map((row) => row.id)).toEqual(before.workItems.map((row) => row.id));
      expect(after.quotationItems.map((row) => row.id)).toEqual(
        before.quotationItems.map((row) => row.id),
      );
      await f.dp.reload();
      await f.dpLine.reload();
      expect(f.dp.dpPricingSnapshot).toEqual(expected);
      expect(f.dpLine.dpPricingSnapshot).toEqual(expected);
      expect(Number(f.dp.precioUnitario)).toBe(expected.precioUnitario);
      expect(Number(f.dpLine.precioUnitario)).toBe(expected.precioUnitario);
      expect(f.dp.toJSON()).toMatchObject({
        estadoOperativo: 'pendiente',
        qualityStatus: 'pendiente',
        qualityReviewedAt: null,
        qualityReviewedBy: null,
        ccfStatus: 'pendiente',
        ccfReviewedAt: null,
        ccfReviewedBy: null,
      });
      expect(after.order).toMatchObject({
        qualityApprovedAt: null,
        qualityApprovedBy: null,
        qualityApprovalNote: null,
      });
      expect(after.stages).toHaveLength(5);
      expect(
        after.stages.every(
          (stage) =>
            stage.status === 'pendiente' &&
            stage.assignedUserId === null &&
            stage.startedAt === null &&
            stage.completedAt === null,
        ),
      ).toBe(true);
      expect(after.reviews).toHaveLength(0);
      const ccf = await mutate('patch', ccfPath(f), { status: 'aprobado' }, 'jefe');
      expect(ccf.status, JSON.stringify(ccf.body)).toBe(400);
      expect(await state(f)).toEqual(after);
    }, 20_000);

    it('allows a price-only edit without a new calculation and preserves hours, stages, notes and approvals', async () => {
      const f = await approvedFixture();
      const before = await state(f);
      const precioUnitario = Number(f.dp.precioUnitario) + 1000;
      const response = await mutate('patch', path(f, source), {
        items: items(f, source, { precioUnitario }),
      });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      const after = await state(f);
      expect(execution(after)).toEqual(execution(before));
      await f.dp.reload();
      await f.dpLine.reload();
      expect(Number(f.dp.precioUnitario)).toBe(precioUnitario);
      expect(Number(f.dpLine.precioUnitario)).toBe(precioUnitario);
      expect(f.dp.dpPricingSnapshot).toEqual(
        before.workItems.find((row) => row.id === f.dp.id)?.dpPricingSnapshot,
      );
      expect(f.dpLine.dpPricingSnapshot).toEqual(f.dp.dpPricingSnapshot);
      expect(Number(after.quotation.total)).toBe(Number(before.quotation.total) + 1000);
    }, 20_000);

    it('treats operation order and operation discounts as pricing changes, preserving approved execution', async () => {
      const f = await approvedFixture();
      const before = await state(f);
      const dpPricing: DpQuoteInput = {
        ...selection(),
        operations: selection()
          .operations.reverse()
          .map((operation) => ({
            ...operation,
            descuentoTipo: 'porcentaje',
            descuentoValor: 10,
          })),
      };
      const expected = calculateDpWorkQuote(original.configuration, dpPricing, original.revision);
      const response = await mutate('patch', path(f, source), {
        items: items(f, source, { dpPricing }),
      });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      const after = await state(f);
      expect(execution(after)).toEqual(execution(before));
      expect(expected.precioUnitario).not.toBe(Number(f.dp.precioUnitario));
      expect((await f.dp.reload()).dpPricingSnapshot).toEqual(expected);
      expect((await f.dpLine.reload()).dpPricingSnapshot).toEqual(expected);
      expect(Number(f.dp.precioUnitario)).toBe(expected.precioUnitario);
      expect(Number(f.dpLine.precioUnitario)).toBe(expected.precioUnitario);
    }, 20_000);

    it('accepts the same technical selection after a revision and price-factor change without rewriting existing stages', async () => {
      const f = await approvedFixture();
      const before = await state(f);
      const configuration = structuredClone(original.configuration);
      const rate = configuration.rates.find(
        (entry) =>
          entry.bodyTypeId === 'hatchback' &&
          entry.pieceId === 'parachoque' &&
          entry.positionId === 'F',
      );
      if (!rate) throw new Error('Falta tarifa del parachoque');
      rate.paintingFactor += 0.2;
      configuration.stages[0].label = 'Plantilla para futuros trabajos';
      configuration.stages[0].specialties = ['carrocero'];
      changedConfiguration = true;
      const saved = await mutate('put', '/api/settings/dp', {
        expectedRevision: original.revision,
        configuration,
      });
      expect(saved.status, JSON.stringify(saved.body)).toBe(200);
      const revision = dpConfigurationRecordSchema.parse(saved.body).revision;
      const dpPricing = { ...selection(), configurationRevision: revision };
      const expected = calculateDpWorkQuote(configuration, dpPricing, revision);
      expect(expected.precioUnitario).not.toBe(Number(f.dp.precioUnitario));
      const response = await mutate('patch', path(f, source), {
        items: items(f, source, { dpPricing }),
      });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      const after = await state(f);
      expect(execution(after)).toEqual(execution(before));
      expect((await f.dp.reload()).dpPricingSnapshot).toEqual(expected);
      expect((await f.dpLine.reload()).dpPricingSnapshot).toEqual(expected);
      expect(Number(f.dp.precioUnitario)).toBe(expected.precioUnitario);
      expect(Number(f.dpLine.precioUnitario)).toBe(expected.precioUnitario);
    }, 20_000);

    it('rejects direct completion of an existing D&P line whose five stages are pending', async () => {
      const f = await fixture();
      await expectRejected(f, source, {
        items: items(f, source, { estadoOperativo: 'completado' }, precedingEdit),
      });
    }, 20_000);

    it('rejects converting a pristine non-D&P line into completed D&P without changing either document', async () => {
      const f = await fixture();
      await approveDp(f);
      expect(await WorkOrderDpStage.count({ where: { workOrderItemId: f.other.id } })).toBe(0);
      await expectRejected(f, source, {
        items: items(
          f,
          source,
          { precioUnitario: Number(f.dp.precioUnitario) + 1000 },
          {
            division: 'DP',
            subtipo: 'servicio_dp',
            dpPricing: selection(),
            estadoOperativo: 'completado',
          },
        ),
      });
    }, 20_000);

    it('allows pending D&P additions and pristine conversions, initializing five pending stages for each', async () => {
      const f = await fixture();
      const before = await state(f);
      const response = await mutate('patch', path(f, source), {
        items: [
          ...items(
            f,
            source,
            {},
            {
              division: 'DP',
              subtipo: 'servicio_dp',
              dpPricing: selection(),
              estadoOperativo: 'pendiente',
            },
          ),
          { ...work(), descripcion: 'Trabajo D&P nuevo pendiente' },
        ],
      });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      const after = await state(f);
      expect(after.workItems).toHaveLength(3);
      expect(after.quotationItems).toHaveLength(3);
      expect(after.stages.filter((stage) => stage.workOrderItemId === f.dp.id)).toEqual(
        before.stages,
      );
      for (const item of after.workItems) {
        const stages = after.stages.filter((stage) => stage.workOrderItemId === item.id);
        expect(item.estadoOperativo).toBe('pendiente');
        expect(item.qualityStatus).toBe('pendiente');
        expect(item.ccfStatus).not.toBe('aprobado');
        expect(stages.map((stage) => stage.stageKey)).toEqual([...DP_STAGE_KEYS]);
        expect(
          stages.every(
            (stage) =>
              stage.status === 'pendiente' &&
              stage.assignedUserId === null &&
              stage.startedAt === null &&
              stage.completedAt === null,
          ),
        ).toBe(true);
        expect(after.quotationItems.find((line) => line.workOrderItemId === item.id)).toMatchObject(
          {
            division: 'DP',
            estadoOperativo: 'pendiente',
            dpPricingSnapshot: item.dpPricingSnapshot,
          },
        );
      }
    }, 20_000);

    it('retains session, permission and CSRF enforcement on the affected edit route', async () => {
      const f = await approvedFixture();
      const before = await state(f);
      const body = {
        items: items(f, source, { precioUnitario: Number(f.dp.precioUnitario) + 1000 }),
      };
      const endpoint = path(f, source);
      expect(
        (
          await request(app)
            .patch(endpoint)
            .set('Cookie', 'csrf_token=dp-integrity-anonymous')
            .set('X-CSRF-Token', 'dp-integrity-anonymous')
            .send(body)
        ).status,
      ).toBe(401);
      expect(
        (await request(app).patch(endpoint).set('Cookie', actors.desarrollador.cookies).send(body))
          .status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .patch(endpoint)
            .set('Cookie', actors.desarrollador.cookies)
            .set('X-CSRF-Token', 'invalid-dp-integrity')
            .send(body)
        ).status,
      ).toBe(403);
      // Warehouse users may legitimately inherit update access. Deny only this
      // fixture user's requested permission, leaving the shared role matrix intact.
      const checkPermission = permissionService.hasPermission;
      const module = source === 'OT' ? 'taller' : 'comercial';
      const deniedPermission = vi
        .spyOn(permissionService, 'hasPermission')
        .mockImplementation((userId, modulo, accion) =>
          userId === actors.bodeguero.user.id && modulo === module && accion === 'update'
            ? Promise.resolve(false)
            : checkPermission(userId, modulo, accion),
        );
      try {
        expect((await mutate('patch', endpoint, body, 'bodeguero')).status).toBe(403);
        expect(deniedPermission).toHaveBeenCalledWith(actors.bodeguero.user.id, module, 'update');
        expect(await state(f)).toEqual(before);
      } finally {
        deniedPermission.mockRestore();
      }
    }, 20_000);
  });

  it('rejects adding a completed D&P line through OT PATCH and rolls back prior prices, notes and approvals', async () => {
    const f = await approvedFixture();
    await expectRejected(f, 'OT', {
      descripcion: 'Esta cabecera tampoco debe guardarse',
      items: [
        ...items(f, 'OT', {}, precedingEdit),
        {
          ...work(),
          descripcion: 'D&P nuevo indebidamente completado',
          estadoOperativo: 'completado',
        },
      ],
    });
  }, 20_000);
});
