import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { CashMovement } from '../../models/CashMovement.js';
import { CatalogItem } from '../../models/CatalogItem.js';
import { Purchase } from '../../models/Purchase.js';
import { Quotation } from '../../models/Quotation.js';
import { QuotationItem } from '../../models/QuotationItem.js';
import { StockMovement } from '../../models/StockMovement.js';
import { User } from '../../models/User.js';
import { Vehicle } from '../../models/Vehicle.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { WorkOrderItem } from '../../models/WorkOrderItem.js';
import { WorkOrderRequest } from '../../models/WorkOrderRequest.js';
import { voidCashMovement } from '../../services/cash-movement.service.js';
import { hashPassword } from '../../utils/password.js';

describe('Compras express integration', () => {
  let cookies: string[];
  let csrf: string;
  let vehicle: Vehicle;
  let user: User;
  let catalog: CatalogItem;
  beforeAll(async () => {
    await sequelize.authenticate();
    user = (await User.findOne({ where: { email: 'dev@unithor.local' } }))!;
    await user.update({ passwordHash: await hashPassword('Desarrollador2026!'), activo: true });
    const response = await request(app)
      .post('/api/auth/login')
      .send({ identifier: user.email, password: 'Desarrollador2026!' });
    expect(response.status).toBe(200);
    cookies = (response.headers['set-cookie'] as unknown as string[]).map(
      (value) => value.split(';')[0],
    );
    csrf = cookies.find((value) => value.startsWith('csrf_token='))!.slice('csrf_token='.length);
    vehicle = (await Vehicle.findOne())!;
    await vehicle.update({ dpBodyTypeId: 'sedan', dpSizeId: 'M' });
    catalog = await CatalogItem.create({
      tipo: 'parte',
      division: 'ACC',
      subtipo: 'a_pedido',
      codigo: `EXP-${Date.now()}`,
      nombre: 'Accesorio express de prueba',
      descripcion: null,
      precio: 5000,
      stock: 0,
    });
  });
  afterAll(async () => {
    await catalog?.destroy();
    await sequelize.close();
  });
  const post = (path: string) =>
    request(app).post(path).set('Cookie', cookies).set('X-CSRF-Token', csrf);
  const newOrder = async (withRequest = false) => {
    const response = await post('/api/work-orders').send({
      clientId: vehicle.clientId,
      vehicleId: vehicle.id,
      items: withRequest
        ? [
            {
              catalogItemId: catalog.id,
              descripcion: catalog.nombre,
              cantidad: 2,
              precioUnitario: 5000,
              tipoLinea: 'parte',
              unidadMedida: 'unidad',
              estadoOperativo: 'pendiente',
              division: 'ACC',
              subtipo: 'a_pedido',
            },
          ]
        : [],
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body.workOrder.id as number;
  };
  const payload = (workOrderId: number) => ({
    operationKey: randomUUID(),
    workOrderId,
    descripcion: 'Filtro express',
    cantidad: 2,
    costoUnitario: 11900,
    ventaUnitario: 14875,
    metodoPago: 'efectivo',
  });
  const buy = (data: object) =>
    post('/api/purchases/express').field('payload', JSON.stringify(data));

  it('requires authentication', async () => {
    expect((await request(app).get('/api/purchases/express/requests')).status).toBe(401);
  });
  it('registers manual purchase, expense and exactly one linked ACC/quotation line', async () => {
    const orderId = await newOrder();
    const response = await buy(payload(orderId));
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const purchase = response.body.purchase;
    expect(purchase).toMatchObject({
      express: true,
      total: 23800,
      neto: 20000,
      iva: 3800,
      workOrderId: orderId,
      formaPago: 'contado',
      comprobanteSizeBytes: 0,
    });
    expect(purchase.cashMovement.monto).toBe(23800);
    const items = await WorkOrderItem.findAll({ where: { workOrderId: orderId } });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      division: 'ACC',
      entregadoBodega: false,
      recibidoTaller: false,
    });
    expect(Number(items[0].precioUnitario)).toBe(12500);
    const quote = (await Quotation.findOne({ where: { workOrderId: orderId } }))!;
    const lines = await QuotationItem.findAll({ where: { quotationId: quote.id } });
    expect(lines).toHaveLength(1);
    expect(lines[0].workOrderItemId).toBe(items[0].id);
    expect(Number(quote.total)).toBe(25000);
    expect(Number(quote.pagado)).toBe(0);
  });
  it('replays concurrent identical confirmations without duplicate expenses', async () => {
    const orderId = await newOrder();
    const data = payload(orderId);
    const [first, second] = await Promise.all([buy(data), buy(data)]);
    expect([first.status, second.status], JSON.stringify([first.body, second.body])).toEqual([
      201, 201,
    ]);
    expect(first.body.purchase.id).toBe(second.body.purchase.id);
    expect(await Purchase.count({ where: { expressKey: data.operationKey } })).toBe(1);
    expect(await CashMovement.count({ where: { referencia: first.body.purchase.codigo } })).toBe(1);
    const changed = await buy({ ...data, costoUnitario: 12000, ventaUnitario: 16000 });
    expect(changed.status).toBe(409);
  });
  it('updates the requested accessory instead of charging it twice and removes it from the inbox', async () => {
    const orderId = await newOrder(true);
    const source = (await WorkOrderRequest.findOne({
      where: { workOrderId: orderId, tipo: 'repuesto' },
    }))!;
    expect(source.estado).toBe('aprobada');
    const initialInbox = await request(app)
      .get('/api/purchases/express/requests')
      .query({ search: (await WorkOrder.findByPk(orderId))!.codigo })
      .set('Cookie', cookies);
    expect(initialInbox.status, JSON.stringify(initialInbox.body)).toBe(200);
    expect(initialInbox.body.items.some((item: { id: number }) => item.id === source.id)).toBe(
      true,
    );
    const originalItemId = source.workOrderItemId;
    const response = await buy({ ...payload(orderId), requestId: source.id });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(await WorkOrderItem.count({ where: { workOrderId: orderId } })).toBe(1);
    expect(response.body.purchase.items[0].workOrderItemId).toBe(originalItemId);
    const inbox = await request(app).get('/api/purchases/express/requests').set('Cookie', cookies);
    expect(inbox.status, JSON.stringify(inbox.body)).toBe(200);
    expect(inbox.body.items.some((item: { id: number }) => item.id === source.id)).toBe(false);
    expect((await buy({ ...payload(orderId), requestId: source.id })).status).toBe(409);
  });
  it('rejects a below-minimum selling price without creating any expense', async () => {
    const orderId = await newOrder();
    const count = await CashMovement.count();
    const response = await buy({ ...payload(orderId), ventaUnitario: 14000 });
    expect(response.status).toBe(400);
    expect(await CashMovement.count()).toBe(count);
    expect(await WorkOrderItem.count({ where: { workOrderId: orderId } })).toBe(0);
  });
  it.each(['discount', 'price', 'quantity'] as const)(
    'protects purchased lines from later quotation %s edits',
    async (mode) => {
      const orderId = await newOrder();
      expect((await buy(payload(orderId))).status).toBe(201);
      const quote = (await Quotation.findOne({ where: { workOrderId: orderId } }))!;
      const line = (await QuotationItem.findOne({ where: { quotationId: quote.id } }))!;
      const body =
        mode === 'discount'
          ? { descuentoTipo: 'porcentaje', descuentoValor: 1 }
          : {
              items: [
                {
                  id: line.id,
                  descripcion: line.descripcion,
                  cantidad: mode === 'quantity' ? 3 : 2,
                  precioUnitario: mode === 'price' ? 1000 : 12500,
                  tipoLinea: 'parte',
                  unidadMedida: 'unidad',
                  estadoOperativo: 'pendiente',
                  division: 'ACC',
                  subtipo: 'a_pedido',
                },
              ],
            };
      const response = await request(app)
        .patch(`/api/quotations/${quote.id}`)
        .set('Cookie', cookies)
        .set('X-CSRF-Token', csrf)
        .send(body);
      expect(response.status, JSON.stringify(response.body)).toBe(400);
      expect(Number((await Quotation.findByPk(quote.id))!.total)).toBe(25000);
      expect(
        Number((await WorkOrderItem.findOne({ where: { workOrderId: orderId } }))!.precioUnitario),
      ).toBe(12500);
    },
  );
  it.each(['closed', 'paid', 'discount'] as const)(
    'rolls back the entire purchase when the order is %s',
    async (mode) => {
      const orderId = await newOrder();
      if (mode === 'closed')
        await WorkOrder.update({ estado: 'cancelada' }, { where: { id: orderId } });
      if (mode === 'paid')
        await Quotation.update({ estadoPago: 'total' }, { where: { workOrderId: orderId } });
      if (mode === 'discount')
        await Quotation.update(
          { descuentoTipo: 'porcentaje', descuentoValor: 10 },
          { where: { workOrderId: orderId } },
        );
      const count = await CashMovement.count();
      const response = await buy(payload(orderId));
      expect(response.status, JSON.stringify(response.body)).toBe(400);
      expect(await Purchase.count({ where: { workOrderId: orderId } })).toBe(0);
      expect(await WorkOrderItem.count({ where: { workOrderId: orderId } })).toBe(0);
      expect(await CashMovement.count()).toBe(count);
    },
  );
  it('searches by normalized plate or OT code with the same minimal response', async () => {
    const id = await newOrder();
    const order = (await WorkOrder.findByPk(id))!;
    for (const term of [order.codigo, vehicle.patente.replace(/[^a-z0-9]/gi, '')]) {
      const response = await request(app)
        .get('/api/purchases/express/orders')
        .query({ search: term })
        .set('Cookie', cookies);
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body.items.some((item: { id: number }) => item.id === id)).toBe(true);
    }
  });
  it('keeps the paid expense and directs an unused accessory to stock instead of voiding it', async () => {
    const orderId = await newOrder();
    const purchase = (await buy(payload(orderId))).body.purchase;
    await expect(
      voidCashMovement(purchase.cashMovementId, 'No se puede aislar', user.id),
    ).rejects.toMatchObject({ statusCode: 409 });
    const response = await request(app)
      .patch(`/api/purchases/${purchase.id}/void`)
      .set('Cookie', cookies)
      .set('X-CSRF-Token', csrf)
      .send({ motivo: 'Compra duplicada por error' });
    expect(response.status, JSON.stringify(response.body)).toBe(400);
    expect((await Purchase.findByPk(purchase.id))!.estado).toBe('registrada');
    expect((await CashMovement.findByPk(purchase.cashMovementId))!.voidedAt).toBeNull();
    expect(await WorkOrderItem.count({ where: { workOrderId: orderId } })).toBe(1);
    expect(Number((await Quotation.findOne({ where: { workOrderId: orderId } }))!.total)).toBe(25000);
  });
  it('does not restore a provisional customer price by voiding a paid requested accessory', async () => {
    const orderId = await newOrder(true);
    const source = (await WorkOrderRequest.findOne({ where: { workOrderId: orderId } }))!;
    const purchase = (await buy({ ...payload(orderId), requestId: source.id })).body.purchase;
    const response = await request(app)
      .patch(`/api/purchases/${purchase.id}/void`)
      .set('Cookie', cookies)
      .set('X-CSRF-Token', csrf)
      .send({ motivo: 'Cambio de proveedor' });
    expect(response.status, JSON.stringify(response.body)).toBe(400);
    const item = (await WorkOrderItem.findByPk(source.workOrderItemId!))!;
    expect(Number(item.precioUnitario)).toBe(12500);
    expect(item.minimumSalePrice).not.toBeNull();
    expect(await WorkOrderItem.count({ where: { workOrderId: orderId } })).toBe(1);
    expect(Number((await Quotation.findOne({ where: { workOrderId: orderId } }))!.total)).toBe(
      25000,
    );
  });
  it('refuses to annul a physically delivered accessory and keeps its expense valid', async () => {
    const orderId = await newOrder();
    const purchase = (await buy(payload(orderId))).body.purchase;
    await WorkOrderItem.update({ entregadoBodega: true }, { where: { workOrderId: orderId } });
    const response = await request(app)
      .patch(`/api/purchases/${purchase.id}/void`)
      .set('Cookie', cookies)
      .set('X-CSRF-Token', csrf)
      .send({ motivo: 'Intento con custodia' });
    expect(response.status).toBe(400);
    expect((await CashMovement.findByPk(purchase.cashMovementId))!.voidedAt).toBeNull();
    expect((await Purchase.findByPk(purchase.id))!.estado).toBe('registrada');
  });
  it('allows physical delivery of an externally purchased request without consuming nonexistent stock', async () => {
    const orderId = await newOrder(true);
    const source = (await WorkOrderRequest.findOne({ where: { workOrderId: orderId } }))!;
    expect((await buy({ ...payload(orderId), requestId: source.id })).status).toBe(201);
    const before = await StockMovement.count({ where: { catalogItemId: catalog.id } });
    const response = await post(`/api/warehouses/requests/${source.id}/deliver`).send({});
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const item = (await WorkOrderItem.findByPk(source.workOrderItemId!))!;
    expect(item.entregadoBodega).toBe(true);
    expect(item.recibidoTaller).toBe(false);
    expect(item.stockConsumido).toBe(false);
    expect(await StockMovement.count({ where: { catalogItemId: catalog.id } })).toBe(before);
  });
});
