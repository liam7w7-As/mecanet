import { randomUUID } from 'node:crypto';

import { getQuotationGrossTotal } from '@unithor/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { CashMovement } from '../../models/CashMovement.js';
import { CatalogItem } from '../../models/CatalogItem.js';
import { CustomerEmail } from '../../models/CustomerEmail.js';
import { Notification } from '../../models/Notification.js';
import { Purchase } from '../../models/Purchase.js';
import { PurchaseItem } from '../../models/PurchaseItem.js';
import { Quotation } from '../../models/Quotation.js';
import { QuotationItem } from '../../models/QuotationItem.js';
import { StockMovement } from '../../models/StockMovement.js';
import { User } from '../../models/User.js';
import { Vehicle } from '../../models/Vehicle.js';
import { WorkOrderEvent } from '../../models/WorkOrderEvent.js';
import { WorkOrderItem } from '../../models/WorkOrderItem.js';
import { WorkOrderPriceSuggestion } from '../../models/WorkOrderPriceSuggestion.js';
import { WorkOrderRequest } from '../../models/WorkOrderRequest.js';
import { hashPassword } from '../../utils/password.js';

describe('Compras express backend guards', () => {
  let cookies: string[];
  let csrf: string;
  let vehicle: Vehicle;
  let catalog: CatalogItem;

  // Same seeded user, vehicle and requested ACC fixture as purchase-express.routes.test.ts.
  beforeAll(async () => {
    await sequelize.authenticate();
    const user = (await User.findOne({ where: { email: 'dev@unithor.local' } }))!;
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
      codigo: `EXP-GUARD-${randomUUID().slice(0, 8)}`,
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
  const patch = (path: string) =>
    request(app).patch(path).set('Cookie', cookies).set('X-CSRF-Token', csrf);
  const newOrder = async (options: { service?: boolean; accessoryPrice?: number } = {}) => {
    const response = await post('/api/work-orders').send({
      clientId: vehicle.clientId,
      vehicleId: vehicle.id,
      ...(options.service ? { descuentoTipo: 'fijo', descuentoValor: 10000 } : {}),
      items: [
        ...(options.service
          ? [
              {
                descripcion: 'Servicio complementario',
                cantidad: 1,
                precioUnitario: 100000,
                tipoLinea: 'especifico',
                unidadMedida: 'servicio',
                division: 'MEC',
              },
            ]
          : []),
        {
          catalogItemId: catalog.id,
          descripcion: catalog.nombre,
          cantidad: 2,
          precioUnitario: options.accessoryPrice ?? 5000,
          tipoLinea: 'parte',
          unidadMedida: 'unidad',
          estadoOperativo: 'pendiente',
          division: 'ACC',
          subtipo: 'a_pedido',
        },
      ],
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const orderId = response.body.workOrder.id as number;
    const source = (await WorkOrderRequest.findOne({
      where: { workOrderId: orderId, tipo: 'repuesto' },
    }))!;
    expect(source.estado).toBe('aprobada');
    const item = (await WorkOrderItem.findByPk(source.workOrderItemId!))!;
    return { orderId, source, item };
  };
  const payload = (workOrderId: number, requestId: number) => ({
    operationKey: randomUUID(),
    workOrderId,
    requestId,
    descripcion: 'Filtro express',
    cantidad: 2,
    costoUnitario: 11900,
    ventaUnitario: 14875,
    metodoPago: 'efectivo',
  });
  const buy = (data: object) =>
    post('/api/purchases/express').field('payload', JSON.stringify(data));
  const snapshot = async (workOrderId: number) => {
    const quote = (await Quotation.findOne({ where: { workOrderId } }))!;
    const [
      items,
      lines,
      requests,
      purchases,
      suggestions,
      expenses,
      events,
      emails,
      notices,
      stock,
    ] = await Promise.all([
      WorkOrderItem.findAll({ where: { workOrderId }, order: [['id', 'ASC']] }),
      QuotationItem.findAll({ where: { quotationId: quote.id }, order: [['id', 'ASC']] }),
      WorkOrderRequest.findAll({ where: { workOrderId }, order: [['id', 'ASC']] }),
      Purchase.findAll({ where: { workOrderId }, order: [['id', 'ASC']] }),
      WorkOrderPriceSuggestion.findAll({ where: { workOrderId }, order: [['id', 'ASC']] }),
      CashMovement.count(),
      WorkOrderEvent.count({ where: { workOrderId } }),
      CustomerEmail.count({ where: { kind: 'work_order', entityId: workOrderId } }),
      Notification.count({ where: { workOrderId } }),
      StockMovement.count({ where: { catalogItemId: catalog.id } }),
    ]);
    return {
      quote: quote.toJSON(),
      items: items.map((row) => row.toJSON()),
      lines: lines.map((row) => row.toJSON()),
      requests: requests.map((row) => row.toJSON()),
      purchases: purchases.map((row) => row.toJSON()),
      suggestions: suggestions.map((row) => row.toJSON()),
      expenses,
      events,
      emails,
      notices,
      stock,
    };
  };

  it.each([1, 3])(
    'rejects payload quantity %i against a complete request for 2',
    async (cantidad) => {
      const { orderId, source } = await newOrder();
      const before = await snapshot(orderId);
      const response = await buy({ ...payload(orderId, source.id), cantidad });
      expect(response.status, JSON.stringify(response.body)).toBe(400);
      expect(response.body.error.message).toContain('cantidad completa');
      expect(response.body.error.message).toContain(`compra ${cantidad}`);
      expect(response.body.error.message).toMatch(/actualiza.*solicitud.*OT/i);
      expect(await snapshot(orderId)).toEqual(before);
      expect(await PurchaseItem.count({ where: { sourceRequestId: source.id } })).toBe(0);
    },
  );

  it.each([
    { requested: 2, current: 3, captured: 2 },
    { requested: 2, current: 1, captured: 2 },
    { requested: 3, current: 2, captured: 2 },
    { requested: 2, current: 3, captured: 3 },
  ])(
    'rejects stale request $requested / OT $current / payload $captured',
    async ({ requested, current, captured }) => {
      const { orderId, source, item } = await newOrder();
      // Simulate a request and OT that became inconsistent before the locked purchase starts.
      await source.update({ cantidad: requested });
      await item.update({ cantidad: current, subtotal: current * Number(item.precioUnitario) });
      const before = await snapshot(orderId);
      const response = await buy({ ...payload(orderId, source.id), cantidad: captured });
      expect(response.status, JSON.stringify(response.body)).toBe(400);
      expect(response.body.error.message).toContain(`solicitud aprobada ${requested}`);
      expect(response.body.error.message).toContain(`accesorio en la OT ${current}`);
      expect(response.body.error.message).toMatch(/ninguna compra ni egreso/i);
      expect(await snapshot(orderId)).toEqual(before);
      expect(await PurchaseItem.count({ where: { sourceRequestId: source.id } })).toBe(0);
    },
  );

  it('replaces the provisional price 1 for the complete quantity, preserving prices and IVA', async () => {
    const { orderId, source, item } = await newOrder({ accessoryPrice: 1 });
    expect(Number(item.precioUnitario)).toBe(1);
    expect(item.minimumSalePrice).toBeNull();
    const response = await buy(payload(orderId, source.id));
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.purchase).toMatchObject({
      total: 23800,
      neto: 20000,
      iva: 3800,
      conIva: true,
    });
    expect(response.body.purchase.cashMovement.monto).toBe(23800);
    expect(response.body.purchase.items).toHaveLength(1);
    expect(response.body.purchase.items[0]).toMatchObject({
      workOrderItemId: item.id,
      cantidad: 2,
    });
    await item.reload();
    expect(Number(item.cantidad)).toBe(2);
    expect(Number(item.precioUnitario)).toBe(12500);
    expect(Number(item.minimumSalePrice)).toBe(12500);
    expect(Number(item.subtotal)).toBe(25000);
    expect(await WorkOrderItem.count({ where: { workOrderId: orderId } })).toBe(1);
    const quote = (await Quotation.findOne({ where: { workOrderId: orderId } }))!;
    expect(Number(quote.total)).toBe(25000);
    expect(getQuotationGrossTotal(Number(quote.total))).toBe(29750);
  });

  it.each(['same key', 'different keys'])(
    'serializes competing purchases for one request with %s',
    async (mode) => {
      const { orderId, source, item } = await newOrder();
      const data = payload(orderId, source.id);
      const expenses = await CashMovement.count();
      const second = mode === 'same key' ? data : { ...data, operationKey: randomUUID() };
      const responses = await Promise.all([buy(data), buy(second)]);
      expect(
        responses.map((entry) => entry.status).sort(),
        JSON.stringify(responses.map((entry) => entry.body)),
      ).toEqual(mode === 'same key' ? [201, 201] : [201, 409]);
      const purchase = responses.find((entry) => entry.status === 201)!.body.purchase;
      if (mode === 'same key')
        expect(responses[0].body.purchase.id).toBe(responses[1].body.purchase.id);
      expect(await Purchase.count({ where: { workOrderId: orderId } })).toBe(1);
      expect(await PurchaseItem.count({ where: { sourceRequestId: source.id } })).toBe(1);
      expect(await CashMovement.count()).toBe(expenses + 1);
      expect(await CashMovement.count({ where: { referencia: purchase.codigo } })).toBe(1);
      expect(await WorkOrderItem.count({ where: { workOrderId: orderId } })).toBe(1);
      expect(Number((await item.reload()).cantidad)).toBe(2);
    },
  );

  it('enforces the 25% after the final fixed discount when replacing a provisional price', async () => {
    const { orderId, source } = await newOrder({ service: true, accessoryPrice: 1 });
    const data = payload(orderId, source.id);
    const before = await snapshot(orderId);
    const rejected = await buy(data);
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(400);
    expect(rejected.body.error.message).toMatch(/25%.*descuentos/);
    expect(await snapshot(orderId)).toEqual(before);
    const accepted = await buy({ ...data, ventaUnitario: 16500 });
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(201);
    expect(accepted.body.purchase).toMatchObject({ total: 23800, neto: 20000, iva: 3800 });
  });

  const commercialFixture = async (direct: boolean) => {
    const fixture = await newOrder({ service: true });
    const response = await buy({
      ...payload(fixture.orderId, fixture.source.id),
      ventaUnitario: 16500,
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    if (direct) {
      const policy = await patch(`/api/work-orders/${fixture.orderId}/price-policy`).send({
        approvalRequired: false,
      });
      expect(policy.status, JSON.stringify(policy.body)).toBe(200);
    }
    const service = (await WorkOrderItem.findOne({
      where: { workOrderId: fixture.orderId, tipoLinea: 'especifico' },
    }))!;
    return { ...fixture, service };
  };
  const propose = (orderId: number, itemId: number, price: number) =>
    post(`/api/work-orders/${orderId}/price-suggestions`).send({
      workOrderItemId: itemId,
      precioSugerido: price,
      alcance: 'ot',
      motivo: 'Ajuste del servicio complementario',
    });

  it.each([true, false])(
    'rolls back another service price that breaches ACC margin with a fixed discount (direct=%s)',
    async (direct) => {
      const { orderId, item, service } = await commercialFixture(direct);
      await item.reload();
      const floor = Number(item.minimumSalePrice) * Number(item.cantidad);
      const accessory = Number(item.subtotal);
      expect(accessory * (1 - 10000 / (accessory + 100000))).toBeGreaterThanOrEqual(floor);
      expect(accessory * (1 - 10000 / (accessory + 10000))).toBeLessThan(floor);
      let suggestionId: number | undefined;
      if (!direct) {
        const proposed = await propose(orderId, service.id, 10000);
        expect(proposed.status, JSON.stringify(proposed.body)).toBe(201);
        expect(proposed.body.suggestion.estado).toBe('pendiente');
        suggestionId = proposed.body.suggestion.id;
      }
      const before = await snapshot(orderId);
      const response = direct
        ? await propose(orderId, service.id, 10000)
        : await patch(`/api/work-orders/${orderId}/price-suggestions/${suggestionId}`).send({
            decision: 'aprobar',
          });
      expect(response.status, JSON.stringify(response.body)).toBe(400);
      expect(response.body.error.message).toMatch(/25%.*descuentos/);
      expect(await snapshot(orderId)).toEqual(before);
    },
  );

  it.each([true, false])(
    'allows another service reduction that retains final ACC margin and IVA (direct=%s)',
    async (direct) => {
      const { orderId, item, service } = await commercialFixture(direct);
      const before = await snapshot(orderId);
      const proposed = await propose(orderId, service.id, 80000);
      expect(proposed.status, JSON.stringify(proposed.body)).toBe(201);
      const response = direct
        ? proposed
        : await patch(
            `/api/work-orders/${orderId}/price-suggestions/${proposed.body.suggestion.id}`,
          ).send({ decision: 'aprobar' });
      expect(response.status, JSON.stringify(response.body)).toBe(direct ? 201 : 200);
      expect(response.body.suggestion).toMatchObject({
        estado: 'aprobada',
        appliedDirectly: direct,
      });
      expect(Number((await service.reload()).precioUnitario)).toBe(80000);
      const after = await snapshot(orderId);
      const originalAccessory = before.items.find((row) => row.id === item.id)!;
      expect(after.items.find((row) => row.id === item.id)).toEqual(originalAccessory);
      expect(after.purchases).toEqual(before.purchases);
      expect(after.expenses).toBe(before.expenses);
      expect(after.stock).toBe(before.stock);
      const quote = (await Quotation.findOne({ where: { workOrderId: orderId } }))!;
      const net = Number(originalAccessory.subtotal) + 80000 - 10000;
      expect(quote.descuentoTipo).toBe('fijo');
      expect(Number(quote.descuentoValor)).toBe(10000);
      expect(Number(quote.total)).toBe(net);
      expect(getQuotationGrossTotal(Number(quote.total))).toBe(
        Math.round((net + Math.round(net * 0.19)) * 100) / 100,
      );
      expect((Number(originalAccessory.subtotal) * net) / (net + 10000)).toBeGreaterThanOrEqual(
        Number(originalAccessory.minimumSalePrice) * Number(originalAccessory.cantidad),
      );
      const line = (await QuotationItem.findOne({
        where: { quotationId: quote.id, workOrderItemId: service.id },
      }))!;
      expect(Number(line.precioUnitario)).toBe(80000);
    },
  );
});
