import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { CashMovement } from '../../models/CashMovement.js';
import { CatalogItem } from '../../models/CatalogItem.js';
import { PurchaseItem } from '../../models/PurchaseItem.js';
import { Quotation } from '../../models/Quotation.js';
import { QuotationItem } from '../../models/QuotationItem.js';
import { Role } from '../../models/Role.js';
import { StockBalance } from '../../models/StockBalance.js';
import { StockMovement } from '../../models/StockMovement.js';
import { User } from '../../models/User.js';
import { Vehicle } from '../../models/Vehicle.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { WorkOrderEvent } from '../../models/WorkOrderEvent.js';
import { WorkOrderItem } from '../../models/WorkOrderItem.js';
import { returnExpressPurchaseToStock } from '../../services/purchase-express-reversal.js';
import * as workOrderService from '../../services/work-order.service.js';
import { hashPassword } from '../../utils/password.js';

import type { PurchasePublic } from '../../services/purchase.service.js';

describe('Selective returns of multi-product express purchases', () => {
  let cookies: string[];
  let csrf: string;
  let vehicle: Vehicle;
  let restrictedActor: User;

  beforeAll(async () => {
    await sequelize.authenticate();
    const actor = (await User.findOne({ where: { email: 'dev@unithor.local' } }))!;
    const passwordHash = await hashPassword('Desarrollador2026!');
    await actor.update({ passwordHash, activo: true });
    const login = await request(app).post('/api/auth/login')
      .send({ identifier: actor.email, password: 'Desarrollador2026!' });
    expect(login.status).toBe(200);
    cookies = (login.headers['set-cookie'] as unknown as string[]).map((value) => value.split(';')[0]);
    csrf = cookies.find((value) => value.startsWith('csrf_token='))!.slice('csrf_token='.length);
    vehicle = (await Vehicle.findOne())!;
    await vehicle.update({ dpBodyTypeId: 'sedan', dpSizeId: 'M' });
    const role = (await Role.findOne({ where: { nombre: 'vendedor' } }))!;
    restrictedActor = await User.create({
      nombre: 'Acceso limitado de devoluciones', username: `stock_${randomUUID().slice(0, 8)}`,
      email: `stock-${randomUUID()}@test.local`, roleId: role.id, passwordHash, activo: true,
    });
  });

  afterAll(async () => {
    await restrictedActor?.destroy();
    await sequelize.close();
  });

  const post = (path: string) => request(app).post(path).set('Cookie', cookies).set('X-CSRF-Token', csrf);
  const newOrder = async () => {
    const response = await post('/api/work-orders').send({ clientId: vehicle.clientId, vehicleId: vehicle.id, items: [] });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body.workOrder.id as number;
  };
  const buy = async (orderIds: number[]) => {
    const response = await post('/api/purchases/express').field('payload', JSON.stringify({
      operationKey: randomUUID(), workOrderId: orderIds[0], metodoPago: 'efectivo',
      items: orderIds.map((workOrderId, index) => ({
        workOrderId, descripcion: `Accesorio selectivo ${index + 1}`, cantidad: 1, costoUnitario: 11900, ventaUnitario: 14875,
      })),
    }));
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body.purchase as PurchasePublic;
  };
  const sendToStock = (id: number, itemIds?: number[]) => post(`/api/purchases/${id}/return-to-stock`)
    .send({ motivo: 'Productos sin utilizar', ...(itemIds === undefined ? {} : { itemIds }) });
  const stockCount = (purchase: PurchasePublic, lineId: number) => StockMovement.count({
    where: { referencia: `EXP-STOCK-${purchase.id}-${lineId}` },
  });

  it('returns an unused selected line while another completed line keeps its charge, price floor and expense', async () => {
    const orderId = await newOrder();
    const purchase = await buy([orderId, orderId]);
    const [unused, used] = purchase.items;
    const completed = (await WorkOrderItem.findByPk(used.workOrderItemId!))!;
    await completed.update({ estadoOperativo: 'completado', stockConsumido: true, horasHombreReales: 3, notasOperativas: 'Historial conservado' });
    const previousFloor = Number(completed.minimumSalePrice);
    const expense = (await CashMovement.findByPk(purchase.cashMovementId!))!.toJSON();

    const response = await sendToStock(purchase.id, [unused.id]);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.purchase.estado).toBe('registrada');
    expect((await PurchaseItem.findByPk(unused.id))!.stockReturnedAt).not.toBeNull();
    expect((await PurchaseItem.findByPk(used.id))!.stockReturnedAt).toBeNull();
    expect(await stockCount(purchase, unused.id)).toBe(1);
    expect(await stockCount(purchase, used.id)).toBe(0);
    await completed.reload();
    expect(completed.estadoOperativo).toBe('completado');
    expect(Number(completed.precioUnitario)).toBe(12500);
    expect(Number(completed.minimumSalePrice)).toBe(previousFloor);
    expect(Number(completed.horasHombreReales)).toBe(3);
    expect(completed.notasOperativas).toBe('Historial conservado');
    expect(Number((await Quotation.findOne({ where: { workOrderId: orderId } }))!.total)).toBe(12500);
    expect(Number((await QuotationItem.findOne({ where: { workOrderItemId: unused.workOrderItemId! } }))!.precioUnitario)).toBe(0);
    expect((await CashMovement.findByPk(purchase.cashMovementId!))!.toJSON()).toEqual(expense);
    const returned = (await PurchaseItem.findByPk(unused.id))!;
    const catalog = (await CatalogItem.findByPk(returned.catalogItemId!))!;
    expect(catalog.division).toBe('ACC');
    expect(catalog.codigo).toBe(`EXP-${purchase.id}-${unused.id}`);
  });

  it('syncs each affected OT exactly once and records only its returned products', async () => {
    const firstOrder = await newOrder();
    const secondOrder = await newOrder();
    const purchase = await buy([firstOrder, secondOrder, firstOrder]);
    const sync = vi.spyOn(workOrderService, 'syncMirrorQuotationFromWorkOrder');
    try {
      const response = await sendToStock(purchase.id, purchase.items.map((line) => line.id).reverse());
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(sync.mock.calls.map(([orderId]) => orderId)).toEqual([firstOrder, secondOrder].sort((a, b) => a - b));
      for (const orderId of [firstOrder, secondOrder]) {
        expect(Number((await Quotation.findOne({ where: { workOrderId: orderId } }))!.total)).toBe(0);
        const history = (await WorkOrderEvent.findAll({ where: { workOrderId: orderId } }))
          .filter((event) => event.metadata?.purchaseId === purchase.id && event.metadata?.expensePreserved === true);
        expect(history).toHaveLength(1);
        expect(history[0].metadata?.itemIds).toEqual(purchase.items.filter((line) => line.workOrderId === orderId).map((line) => line.id));
      }
      for (const line of purchase.items) expect(await stockCount(purchase, line.id)).toBe(1);
    } finally { sync.mockRestore(); }
  });

  it.each(['closed', 'paid'] as const)('ignores an unselected %s header OT and guards it when selected', async (guard) => {
    const headerOrder = await newOrder();
    const otherOrder = await newOrder();
    const purchase = await buy([headerOrder, otherOrder]);
    if (guard === 'closed') await WorkOrder.update({ estado: 'entregada' }, { where: { id: headerOrder } });
    else await Quotation.update({ estadoPago: 'total' }, { where: { workOrderId: headerOrder } });
    expect((await sendToStock(purchase.id, [purchase.items[0].id])).status).toBe(409);
    const response = await sendToStock(purchase.id, [purchase.items[1].id]);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(await stockCount(purchase, purchase.items[0].id)).toBe(0);
    expect(await stockCount(purchase, purchase.items[1].id)).toBe(1);
  });

  it('rejects a foreign line ID and empty selections before making stock changes', async () => {
    const orderId = await newOrder();
    const purchase = await buy([orderId, orderId]);
    const other = await buy([orderId]);
    const before = await StockMovement.count();
    const foreign = await sendToStock(purchase.id, [purchase.items[0].id, other.items[0].id]);
    expect(foreign.status, JSON.stringify(foreign.body)).toBe(400);
    expect((await sendToStock(purchase.id, [])).status).toBe(400);
    expect(await StockMovement.count()).toBe(before);
    expect((await PurchaseItem.findByPk(purchase.items[0].id))!.stockReturnedAt).toBeNull();
  });

  // Exercise service access as well as the endpoint's jefe/admin/developer role gate.
  it('checks access to every target OT before returning any selected line', async () => {
    const allowedOrder = await newOrder();
    const forbiddenOrder = await newOrder();
    await WorkOrder.update({ createdBy: restrictedActor.id }, { where: { id: allowedOrder } });
    const purchase = await buy([allowedOrder, forbiddenOrder]);
    const before = await StockMovement.count();
    await expect(returnExpressPurchaseToStock(purchase.id, 'Productos sin utilizar', restrictedActor.id, purchase.items.map((line) => line.id)))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(await StockMovement.count()).toBe(before);
    for (const line of purchase.items) expect((await PurchaseItem.findByPk(line.id))!.stockReturnedAt).toBeNull();
  });

  it.each([false, true])('checks access on an already-returned no-op (explicit selection: %s)', async (explicit) => {
    const allowedOrder = await newOrder();
    const forbiddenOrder = await newOrder();
    await WorkOrder.update({ createdBy: restrictedActor.id }, { where: { id: allowedOrder } });
    const purchase = await buy([allowedOrder, forbiddenOrder]);
    expect((await sendToStock(purchase.id)).status).toBe(200);
    const before = await StockMovement.count();
    await expect(returnExpressPurchaseToStock(purchase.id, 'Reintento sin acceso', restrictedActor.id,
      explicit ? purchase.items.map((line) => line.id) : undefined)).rejects.toMatchObject({ statusCode: 404 });
    expect(await StockMovement.count()).toBe(before);
  });

  it('uses the legacy header OT for null line links and returns all remaining lines without IDs', async () => {
    const orderId = await newOrder();
    const purchase = await buy([orderId, orderId]);
    await PurchaseItem.update({ workOrderId: null }, { where: { purchaseId: purchase.id } });
    expect((await sendToStock(purchase.id, [purchase.items[0].id])).status).toBe(200);
    const response = await sendToStock(purchase.id);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.purchase.items.every((line: { stockReturnedAt: string | null }) => line.stockReturnedAt)).toBe(true);
    for (const line of purchase.items) expect(await stockCount(purchase, line.id)).toBe(1);
  });

  it('returns overlapping selections concurrently exactly once per product', async () => {
    const firstOrder = await newOrder();
    const secondOrder = await newOrder();
    const purchase = await buy([firstOrder, secondOrder]);
    const responses = await Promise.all([
      sendToStock(purchase.id, purchase.items.map((line) => line.id).reverse()),
      sendToStock(purchase.id, [purchase.items[0].id]),
    ]);
    expect(responses.map((response) => response.status), JSON.stringify(responses.map((response) => response.body))).toEqual([200, 200]);
    for (const line of purchase.items) {
      expect(await stockCount(purchase, line.id)).toBe(1);
      const returned = (await PurchaseItem.findByPk(line.id))!;
      expect(Number((await StockBalance.findOne({ where: { catalogItemId: returned.catalogItemId!, warehouseId: returned.warehouseId! } }))!.cantidad)).toBe(1);
    }
    expect((await CashMovement.findByPk(purchase.cashMovementId!))!.voidedAt).toBeNull();
  });
});
