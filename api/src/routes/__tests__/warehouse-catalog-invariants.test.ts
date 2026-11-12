import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { CatalogItem } from '../../models/CatalogItem.js';
import { StockBalance } from '../../models/StockBalance.js';
import { StockMovement } from '../../models/StockMovement.js';
import { User } from '../../models/User.js';
import { Warehouse } from '../../models/Warehouse.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { WorkOrderEvent } from '../../models/WorkOrderEvent.js';
import { WorkOrderItem } from '../../models/WorkOrderItem.js';
import { WorkOrderRequest } from '../../models/WorkOrderRequest.js';
import { createCatalogItem } from '../../services/catalog.service.js';
import * as permissions from '../../services/permission.service.js';
import {
  consumeForWorkOrder,
  deliverWorkOrderRequest,
  registerMovement,
  registerTransfer,
} from '../../services/warehouse.service.js';
import { signAccessToken } from '../../utils/jwt.js';

const prefix = 'PH5-LEDGER-';
const csrf = 'phase5-ledger-csrf';
let actor: User;
let cookie: string[];
let part: CatalogItem;
let otherPart: CatalogItem;
let origin: Warehouse;
let destination: Warehouse;
let order: WorkOrder;
let line: WorkOrderItem;
let approved: WorkOrderRequest;
const extraIds: number[] = [];

const movement = (
  tipo: 'ingreso' | 'salida' | 'ajuste',
  cantidad: number,
  warehouseId = origin.id,
) =>
  registerMovement(
    { catalogItemId: part.id, warehouseId, tipo, cantidad, motivo: 'Prueba de saldo' },
    actor.id,
  );
const transfer = (
  cantidad: number,
  originWarehouseId = origin.id,
  destinationWarehouseId = destination.id,
) =>
  registerTransfer(
    {
      catalogItemId: part.id,
      originWarehouseId,
      destinationWarehouseId,
      cantidad,
      motivo: 'Prueba de traslado',
    },
    actor.id,
  );
const patch = (body: object) =>
  request(app)
    .patch(`/api/catalog/${part.id}`)
    .set('Cookie', cookie)
    .set('X-CSRF-Token', csrf)
    .send(body);
const stockState = async () => ({
  stock: (await part.reload()).stock,
  balances: (
    await StockBalance.findAll({
      where: { catalogItemId: part.id },
      order: [['warehouseId', 'ASC']],
    })
  ).map((balance) => Number(balance.cantidad)),
  movements: await StockMovement.count({ where: { catalogItemId: part.id } }),
});

describe('Warehouse/catalog ledger regressions', () => {
  beforeAll(async () => {
    if (sequelize.getDatabaseName() !== 'unithor_test') throw new Error('Requires unithor_test');
    const user = await User.findOne({ where: { email: 'dev@unithor.local' } });
    if (!user) throw new Error('Missing seeded developer');
    actor = user;
    cookie = [
      `access_token=${signAccessToken({ sub: actor.id, role: 'desarrollador' })}`,
      `csrf_token=${csrf}`,
    ];
    origin = await Warehouse.create({ codigo: `${prefix}W1`, nombre: 'Phase5 origin' });
    destination = await Warehouse.create({ codigo: `${prefix}W2`, nombre: 'Phase5 destination' });
  });

  beforeEach(async () => {
    part = await CatalogItem.create({
      tipo: 'parte',
      codigo: `${prefix}PART`,
      nombre: `${prefix}Part`,
      stock: 10,
    });
    otherPart = await CatalogItem.create({
      tipo: 'parte',
      codigo: `${prefix}OTHER`,
      nombre: `${prefix}Other`,
    });
    await StockBalance.bulkCreate([
      { catalogItemId: part.id, warehouseId: origin.id, cantidad: 3 },
      { catalogItemId: part.id, warehouseId: destination.id, cantidad: 7 },
    ]);
    order = await WorkOrder.create({
      codigo: `${prefix}OT`,
      createdBy: actor.id,
      estado: 'en_progreso',
    });
    line = await WorkOrderItem.create({
      workOrderId: order.id,
      catalogItemId: part.id,
      tipoLinea: 'parte',
      descripcion: 'Approved part',
      cantidad: 2,
    });
    approved = await WorkOrderRequest.create({
      workOrderId: order.id,
      workOrderItemId: line.id,
      catalogItemId: part.id,
      tipo: 'repuesto',
      estado: 'aprobada',
      motivo: 'Approved request',
      cantidad: 2,
      requestedBy: actor.id,
      reviewedBy: actor.id,
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await WorkOrderEvent.destroy({ where: { workOrderId: order.id } });
    await WorkOrderRequest.destroy({ where: { workOrderId: order.id } });
    await WorkOrderItem.destroy({ where: { workOrderId: order.id } });
    await WorkOrder.destroy({ where: { id: order.id }, force: true });
    const ids = [part.id, otherPart.id, ...extraIds.splice(0)];
    await StockMovement.destroy({ where: { catalogItemId: ids } });
    await StockBalance.destroy({ where: { catalogItemId: ids } });
    await CatalogItem.destroy({ where: { id: ids }, force: true });
  });

  afterAll(async () => {
    await Warehouse.destroy({ where: { id: [origin.id, destination.id] } });
  });

  it('sets a warehouse final balance to zero through the API without wiping other warehouses', async () => {
    const response = await request(app)
      .post('/api/warehouses/movements')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send({
        catalogItemId: part.id,
        warehouseId: origin.id,
        tipo: 'ajuste',
        cantidad: 0,
        motivo: 'Conteo vacío',
      });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.movement).toMatchObject({
      tipo: 'ajuste',
      cantidad: 0,
      saldoResultante: 0,
    });
    expect(await stockState()).toEqual({ stock: 7, balances: [0, 7], movements: 1 });
  });

  it.each([
    ['ingreso', 0],
    ['salida', 0],
    ['ingreso', 1.5],
    ['salida', 1.5],
    ['ajuste', 1.5],
    ['ajuste', -1],
  ] as const)(
    'rejects %s quantity %s at the API and service without truncation',
    async (tipo, cantidad) => {
      const response = await request(app)
        .post('/api/warehouses/movements')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrf)
        .send({
          catalogItemId: part.id,
          warehouseId: origin.id,
          tipo,
          cantidad,
          motivo: 'Cantidad inválida',
        });
      expect(response.status).toBe(400);
      await expect(movement(tipo, cantidad)).rejects.toMatchObject({ statusCode: 400 });
      expect(await stockState()).toEqual({ stock: 10, balances: [3, 7], movements: 0 });
    },
  );

  it('uses warehouse availability rather than aggregate stock for consumption and transfers', async () => {
    await expect(transfer(4)).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      sequelize.transaction((transaction) =>
        consumeForWorkOrder(
          {
            catalogItemId: part.id,
            warehouseId: origin.id,
            cantidad: 4,
            referencia: order.codigo,
            motivo: 'Insufficient origin',
            userId: actor.id,
          },
          transaction,
        ),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(await stockState()).toEqual({ stock: 10, balances: [3, 7], movements: 0 });
  });

  it.each([0, -2, 1.5, Number.NaN])(
    'rejects invalid transfer quantity %s when called directly',
    async (cantidad) => {
      await expect(transfer(cantidad)).rejects.toMatchObject({ statusCode: 400 });
      expect(await stockState()).toEqual({ stock: 10, balances: [3, 7], movements: 0 });
    },
  );

  it('rejects a same-warehouse transfer in the service', async () => {
    await expect(transfer(1, origin.id, origin.id)).rejects.toMatchObject({ statusCode: 400 });
    expect(await stockState()).toEqual({ stock: 10, balances: [3, 7], movements: 0 });
  });

  it('rolls back both transfer legs if the second ledger entry fails', async () => {
    const create = StockMovement.create.bind(StockMovement);
    vi.spyOn(StockMovement, 'create')
      .mockImplementationOnce(create)
      .mockRejectedValueOnce(new Error('Second leg failed'));
    await expect(transfer(2)).rejects.toThrow('Second leg failed');
    expect(await stockState()).toEqual({ stock: 10, balances: [3, 7], movements: 0 });
  });

  it('rolls back movement balances when the global balance read fails', async () => {
    vi.spyOn(StockBalance, 'findAll').mockRejectedValueOnce(new Error('Balance read failed'));
    await expect(movement('ingreso', 2)).rejects.toThrow('Balance read failed');
    expect(await stockState()).toEqual({ stock: 10, balances: [3, 7], movements: 0 });
  });

  it('keeps aggregate stock correct with concurrent warehouse receipts and conserves opposite transfers', async () => {
    await Promise.all([movement('ingreso', 2), movement('ingreso', 3, destination.id)]);
    expect(await stockState()).toEqual({ stock: 15, balances: [5, 10], movements: 2 });
    await Promise.all([transfer(2), transfer(4, destination.id, origin.id)]);
    expect(await stockState()).toEqual({ stock: 15, balances: [7, 8], movements: 6 });
  });

  it('serializes concurrent withdrawals so only available stock can leave', async () => {
    const results = await Promise.allSettled([movement('salida', 2), movement('salida', 2)]);
    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(await stockState()).toEqual({ stock: 8, balances: [1, 7], movements: 1 });
  });

  it.each([
    'catalog',
    'type',
    'quantity',
    'zero',
    'fraction',
    'omitted',
    'completed',
    'finalizada',
    'entregada',
    'cancelada',
  ] as const)(
    'rejects stale or terminal delivery (%s) without stock or request changes',
    async (cause) => {
      if (cause === 'catalog') await line.update({ catalogItemId: otherPart.id });
      if (cause === 'type') await line.update({ tipoLinea: 'estandar' });
      if (cause === 'quantity') await line.update({ cantidad: 3 });
      if (cause === 'zero') await approved.update({ cantidad: 0 });
      if (cause === 'fraction') await approved.update({ cantidad: 1.5 });
      if (cause === 'omitted') await line.update({ estadoOperativo: 'omitido' });
      if (cause === 'completed') await line.update({ estadoOperativo: 'completado' });
      if (['finalizada', 'entregada', 'cancelada'].includes(cause))
        await order.update({ estado: cause as 'finalizada' | 'entregada' | 'cancelada' });
      await expect(
        deliverWorkOrderRequest(approved.id, { warehouseId: origin.id }, actor.id),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(await stockState()).toEqual({ stock: 10, balances: [3, 7], movements: 0 });
      expect(await approved.reload()).toMatchObject({ estado: 'aprobada', deliveredAt: null });
      expect((await line.reload()).stockConsumido).toBe(false);
    },
  );

  it('delivers once and rolls back delivery state together with stock if its event fails', async () => {
    vi.spyOn(WorkOrderEvent, 'create').mockRejectedValueOnce(new Error('Audit failed'));
    await expect(
      deliverWorkOrderRequest(approved.id, { warehouseId: origin.id }, actor.id),
    ).rejects.toThrow('Audit failed');
    expect(await stockState()).toEqual({ stock: 10, balances: [3, 7], movements: 0 });
    expect((await approved.reload()).estado).toBe('aprobada');
    expect((await line.reload()).stockConsumido).toBe(false);
    const delivered = await deliverWorkOrderRequest(
      approved.id,
      { warehouseId: origin.id },
      actor.id,
    );
    expect(delivered).toMatchObject({
      estado: 'entregada',
      cantidad: 2,
      deliveredWarehouse: { id: origin.id },
    });
    await expect(
      deliverWorkOrderRequest(approved.id, { warehouseId: destination.id }, actor.id),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(await stockState()).toEqual({ stock: 8, balances: [1, 7], movements: 1 });
  });

  it('rejects stale catalogue stock but saves metadata without altering the ledger', async () => {
    await movement('ingreso', 2);
    const stale = await patch({ nombre: 'Should not be saved', stock: 10 });
    expect(stale.status).toBe(400);
    expect((await part.reload()).nombre).toBe(`${prefix}Part`);
    const metadata = await patch({ nombre: 'Saved metadata', stockMinimo: 4 });
    expect(metadata.status).toBe(200);
    expect(metadata.body.item).toMatchObject({ stock: 12, stockMinimo: 4 });
    expect(await stockState()).toEqual({ stock: 12, balances: [5, 7], movements: 1 });
  });

  it('rejects conversion or soft deletion while global or warehouse stock remains', async () => {
    for (const global of [10, 0]) {
      await part.update({ stock: global });
      expect((await patch({ tipo: 'estandar', stock: 0 })).status).toBe(409);
      const deleted = await request(app)
        .delete(`/api/catalog/${part.id}`)
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrf);
      expect(deleted.status).toBe(409);
      expect(await part.reload()).toMatchObject({ tipo: 'parte', deletedAt: null });
    }
  });

  it('reserves deleted catalogue codes instead of creating a new active identity', async () => {
    await otherPart.destroy();
    const response = await request(app)
      .post('/api/catalog')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send({ tipo: 'parte', codigo: otherPart.codigo, nombre: 'Duplicate deleted' });
    expect(response.status).toBe(409);
    expect((await patch({ codigo: otherPart.codigo })).status).toBe(409);
    expect(await CatalogItem.findByPk(otherPart.id)).toBeNull();
  });

  it('records initial catalogue stock in the default warehouse and requires warehouse permissions', async () => {
    const data = {
      tipo: 'parte' as const,
      codigo: `${prefix}INITIAL`,
      nombre: 'Initial part',
      unidadMedida: 'unidad' as const,
      precio: 5,
      stock: 4,
      stockMinimo: 0,
    };
    const created = await createCatalogItem(data, actor.id);
    extraIds.push(created.id);
    expect(created.stock).toBe(4);
    expect(await StockBalance.sum('cantidad', { where: { catalogItemId: created.id } })).toBe(4);
    expect(await StockMovement.findOne({ where: { catalogItemId: created.id } })).toMatchObject({
      tipo: 'ingreso',
      cantidad: 4,
      createdBy: actor.id,
    });
    const actual = permissions.hasPermission;
    vi.spyOn(permissions, 'hasPermission').mockImplementation((userId, module, action) =>
      module === 'almacen' && action === 'create'
        ? Promise.resolve(false)
        : actual(userId, module, action),
    );
    const denied = await request(app)
      .post('/api/catalog')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send({ ...data, codigo: `${prefix}DENIED` });
    expect(denied.status).toBe(403);
    expect(await CatalogItem.findOne({ where: { codigo: `${prefix}DENIED` } })).toBeNull();
    const adjustment = await request(app)
      .post(`/api/catalog/${part.id}/stock`)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send({ delta: 2 });
    expect(adjustment.status).toBe(403);
    expect(await stockState()).toEqual({ stock: 10, balances: [3, 7], movements: 0 });
  });
});
