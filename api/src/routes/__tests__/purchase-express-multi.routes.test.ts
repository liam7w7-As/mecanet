import { createHash, randomUUID } from 'node:crypto';

import { createExpressPurchaseSchema } from '@unithor/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { CashMovement } from '../../models/CashMovement.js';
import { CatalogItem } from '../../models/CatalogItem.js';
import { Purchase } from '../../models/Purchase.js';
import { PurchaseItem } from '../../models/PurchaseItem.js';
import { Quotation } from '../../models/Quotation.js';
import { QuotationItem } from '../../models/QuotationItem.js';
import { User } from '../../models/User.js';
import { Vehicle } from '../../models/Vehicle.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { WorkOrderEvent } from '../../models/WorkOrderEvent.js';
import { WorkOrderItem } from '../../models/WorkOrderItem.js';
import { WorkOrderRequest } from '../../models/WorkOrderRequest.js';
import { hashPassword } from '../../utils/password.js';

import type { CreateExpressPurchaseBatchInput, ExpressPurchaseLineInput } from '@unithor/shared';

describe('Multi-product express purchases', () => {
  let cookies: string[];
  let csrf: string;
  let vehicle: Vehicle;
  let catalog: CatalogItem;

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
      codigo: `EXP-MULTI-${randomUUID().slice(0, 8)}`,
      nombre: 'Accesorio para compra múltiple',
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
  const buy = (data: object) =>
    post('/api/purchases/express').field('payload', JSON.stringify(data));
  const line = (overrides: Partial<ExpressPurchaseLineInput> = {}): ExpressPurchaseLineInput => ({
    descripcion: 'Filtro express múltiple',
    cantidad: 2,
    costoUnitario: 11900,
    ventaUnitario: 14875,
    ...overrides,
  });
  const payload = (
    workOrderId: number,
    items: ExpressPurchaseLineInput[],
  ): CreateExpressPurchaseBatchInput => ({
    operationKey: randomUUID(),
    workOrderId,
    conIva: true,
    metodoPago: 'efectivo',
    tipoDocumento: 'recibo',
    items,
  });
  const newOrder = async (options: { requested?: boolean; fixedDiscount?: number } = {}) => {
    const response = await post('/api/work-orders').send({
      clientId: vehicle.clientId,
      vehicleId: vehicle.id,
      ...(options.fixedDiscount
        ? { descuentoTipo: 'fijo', descuentoValor: options.fixedDiscount }
        : {}),
      items: [
        ...(options.fixedDiscount
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
        ...(options.requested
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
          : []),
      ],
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body.workOrder.id as number;
  };
  const sourceRequest = async (workOrderId: number) => {
    const source = (await WorkOrderRequest.findOne({
      where: { workOrderId, tipo: 'repuesto' },
    }))!;
    expect(source.estado).toBe('aprobada');
    return source;
  };
  const snapshot = async (orderIds: number[]) => {
    const [orders, items, quotes, requests, events, purchases, purchaseItems, expenses] =
      await Promise.all([
        WorkOrder.findAll({ where: { id: orderIds }, order: [['id', 'ASC']] }),
        WorkOrderItem.findAll({ where: { workOrderId: orderIds }, order: [['id', 'ASC']] }),
        Quotation.findAll({ where: { workOrderId: orderIds }, order: [['id', 'ASC']] }),
        WorkOrderRequest.findAll({ where: { workOrderId: orderIds }, order: [['id', 'ASC']] }),
        WorkOrderEvent.findAll({ where: { workOrderId: orderIds }, order: [['id', 'ASC']] }),
        Purchase.count(),
        PurchaseItem.count(),
        CashMovement.count(),
      ]);
    const quoteLines = await QuotationItem.findAll({
      where: { quotationId: quotes.map((quote) => quote.id) },
      order: [['id', 'ASC']],
    });
    return {
      orders: orders.map((row) => row.toJSON()),
      items: items.map((row) => row.toJSON()),
      quotes: quotes.map((row) => row.toJSON()),
      quoteLines: quoteLines.map((row) => row.toJSON()),
      requests: requests.map((row) => row.toJSON()),
      events: events.map((row) => row.toJSON()),
      purchases,
      purchaseItems,
      expenses,
    };
  };

  it('inherits the header OT for every omitted line and records one purchase and one expense', async () => {
    const orderId = await newOrder();
    const expenses = await CashMovement.count();
    const data = payload(orderId, [
      line({ detalle: 'Detalle del filtro' }),
      line({
        descripcion: 'Segundo accesorio',
        cantidad: 1,
        costoUnitario: 2380,
        ventaUnitario: 2975,
      }),
    ]);
    data.detalle = 'Un comprobante para ambos accesorios';
    const response = await buy(data);
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const purchase = response.body.purchase;
    expect(purchase).toMatchObject({
      express: true,
      workOrderId: orderId,
      total: 26180,
      neto: 22000,
      iva: 4180,
      montoComprobante: 26180,
      observaciones: data.detalle,
      formaPago: 'contado',
    });
    expect(purchase.items).toHaveLength(2);
    expect(purchase.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workOrderId: orderId,
          workOrder: expect.objectContaining({ id: orderId }),
        }),
      ]),
    );
    const storedLines = await PurchaseItem.findAll({ where: { purchaseId: purchase.id } });
    expect(storedLines.map((item) => item.workOrderId)).toEqual([orderId, orderId]);
    expect(storedLines.reduce((sum, item) => sum + Number(item.subtotal), 0)).toBe(22000);
    expect(await Purchase.count({ where: { expressKey: data.operationKey } })).toBe(1);
    expect(await CashMovement.count()).toBe(expenses + 1);
    expect(await CashMovement.count({ where: { referencia: purchase.codigo } })).toBe(1);
    expect(purchase.cashMovement.monto).toBe(26180);
    const items = await WorkOrderItem.findAll({
      where: { workOrderId: orderId },
      order: [['id', 'ASC']],
    });
    expect(items).toHaveLength(2);
    expect(items[0].notasOperativas).toBe('Detalle del filtro');
    expect(items.every((item) => item.expressPurchaseId === purchase.id)).toBe(true);
    const quote = (await Quotation.findOne({ where: { workOrderId: orderId } }))!;
    expect(Number(quote.total)).toBe(27500);
    expect(await QuotationItem.count({ where: { quotationId: quote.id } })).toBe(2);
  });

  it('links mixed OTs per line, keeps the header default and finds the receipt by its second OT', async () => {
    const headerId = await newOrder();
    const secondId = await newOrder({ requested: true });
    const source = await sourceRequest(secondId);
    // Submit in reverse OT order to exercise deterministic locking.
    const response = await buy(
      payload(headerId, [
        line({ workOrderId: secondId, requestId: source.id }),
        line({ descripcion: 'Accesorio para la OT predeterminada' }),
      ]),
    );
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const purchase = response.body.purchase;
    expect(purchase.workOrderId).toBe(headerId);
    expect(purchase.total).toBe(47600);
    expect(purchase.cashMovement.monto).toBe(47600);
    for (const orderId of [headerId, secondId]) {
      const stored = (await PurchaseItem.findOne({
        where: { purchaseId: purchase.id, workOrderId: orderId },
      }))!;
      expect(purchase.items).toContainEqual(
        expect.objectContaining({
          workOrderId: orderId,
          workOrderItemId: stored.workOrderItemId,
          workOrder: expect.objectContaining({ id: orderId }),
        }),
      );
      expect(await WorkOrderItem.count({ where: { workOrderId: orderId } })).toBe(1);
      const quote = (await Quotation.findOne({ where: { workOrderId: orderId } }))!;
      expect(Number(quote.total)).toBe(25000);
      expect(await QuotationItem.count({ where: { quotationId: quote.id } })).toBe(1);
    }
    const second = (await WorkOrder.findByPk(secondId))!;
    const history = await request(app)
      .get('/api/purchases')
      .set('Cookie', cookies)
      .query({ search: second.codigo });
    expect(history.status, JSON.stringify(history.body)).toBe(200);
    expect(history.body.items).toContainEqual(expect.objectContaining({ id: purchase.id }));
    expect(await PurchaseItem.count({ where: { sourceRequestId: source.id } })).toBe(1);
    expect(await CashMovement.count({ where: { referencia: purchase.codigo } })).toBe(1);
  });

  it('rolls back earlier line prices and approvals when a later request quantity is incomplete', async () => {
    const firstId = await newOrder({ requested: true });
    const secondId = await newOrder({ requested: true });
    const first = await sourceRequest(firstId);
    const second = await sourceRequest(secondId);
    const before = await snapshot([firstId, secondId]);
    const response = await buy(
      payload(firstId, [
        line({ requestId: first.id }),
        line({ workOrderId: secondId, requestId: second.id, cantidad: 1 }),
      ]),
    );
    expect(response.status, JSON.stringify(response.body)).toBe(400);
    expect(response.body.error.message).toContain('cantidad completa');
    expect(await snapshot([firstId, secondId])).toEqual(before);
  });

  it('rejects duplicate requests without registering a partial purchase', async () => {
    const orderId = await newOrder({ requested: true });
    const source = await sourceRequest(orderId);
    const before = await snapshot([orderId]);
    const response = await buy(
      payload(orderId, [line({ requestId: source.id }), line({ requestId: source.id })]),
    );
    expect(response.status, JSON.stringify(response.body)).toBe(400);
    expect(await snapshot([orderId])).toEqual(before);
  });

  it('rejects different requests targeting the same OT item and rolls back its first price update', async () => {
    const orderId = await newOrder({ requested: true });
    const source = await sourceRequest(orderId);
    const {
      id: _id,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...attributes
    } = source.toJSON();
    const duplicate = await WorkOrderRequest.create(attributes);
    const before = await snapshot([orderId]);
    const response = await buy(
      payload(orderId, [line({ requestId: source.id }), line({ requestId: duplicate.id })]),
    );
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(response.body.error.message).toMatch(/accesorio.*más de una vez/);
    expect(await snapshot([orderId])).toEqual(before);
  });

  it.each(['closed header', 'paid header', 'closed line', 'paid line'])(
    'requires every OT to be open with an unpaid quotation: %s',
    async (mode) => {
      const headerId = await newOrder();
      const secondId = await newOrder();
      const invalidId = mode.endsWith('header') ? headerId : secondId;
      if (mode.startsWith('closed'))
        await WorkOrder.update({ estado: 'cancelada' }, { where: { id: invalidId } });
      else await Quotation.update({ estadoPago: 'total' }, { where: { workOrderId: invalidId } });
      const before = await snapshot([headerId, secondId]);
      const response = await buy(payload(headerId, [line({ workOrderId: secondId })]));
      expect(response.status, JSON.stringify(response.body)).toBe(400);
      expect(await snapshot([headerId, secondId])).toEqual(before);
    },
  );

  it('checks the general discount against the completed batch instead of each intermediate price', async () => {
    const orderId = await newOrder({ fixedDiscount: 10000 });
    const response = await buy(
      payload(orderId, [
        line({ ventaUnitario: 16065 }),
        line({ descripcion: 'Accesorio complementario', cantidad: 1, ventaUnitario: 119000 }),
      ]),
    );
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const quote = (await Quotation.findOne({ where: { workOrderId: orderId } }))!;
    expect(Number(quote.total)).toBe(217000);
    expect(response.body.purchase.items).toHaveLength(2);
  });

  it('rolls back both quotations when the later OT fails its final margin after discounts', async () => {
    const headerId = await newOrder();
    const secondId = await newOrder();
    await Quotation.update(
      { descuentoTipo: 'porcentaje', descuentoValor: 10 },
      { where: { workOrderId: secondId } },
    );
    const before = await snapshot([headerId, secondId]);
    const response = await buy(payload(headerId, [line(), line({ workOrderId: secondId })]));
    expect(response.status, JSON.stringify(response.body)).toBe(400);
    expect(response.body.error.message).toMatch(/25%.*descuentos/);
    expect(await snapshot([headerId, secondId])).toEqual(before);
  });

  it.each([true, false])(
    'keeps allocated line cents equal to the header net and IVA (conIva=%s)',
    async (conIva) => {
      const orderId = await newOrder();
      const data = payload(
        orderId,
        [0, 1, 2].map((index) =>
          line({
            descripcion: `Accesorio con centavos ${index}`,
            cantidad: 1,
            costoUnitario: 0.03,
            ventaUnitario: 0.04,
          }),
        ),
      );
      data.conIva = conIva;
      const response = await buy(data);
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      const purchase = response.body.purchase;
      expect(purchase).toMatchObject({
        total: 0.09,
        neto: conIva ? 0.08 : 0.09,
        iva: conIva ? 0.01 : 0,
      });
      const stored = await PurchaseItem.findAll({ where: { purchaseId: purchase.id } });
      expect(stored.reduce((sum, item) => sum + Math.round(Number(item.subtotal) * 100), 0)).toBe(
        conIva ? 8 : 9,
      );
      expect(purchase.cashMovement.monto).toBe(0.09);
    },
  );

  it('replays concurrent identical batches and conflicts if any line changes', async () => {
    const headerId = await newOrder();
    const secondId = await newOrder();
    const data = payload(headerId, [line(), line({ workOrderId: secondId })]);
    const [first, second] = await Promise.all([buy(data), buy(data)]);
    expect([first.status, second.status], JSON.stringify([first.body, second.body])).toEqual([
      201, 201,
    ]);
    expect(first.body.purchase.id).toBe(second.body.purchase.id);
    expect(await Purchase.count({ where: { expressKey: data.operationKey } })).toBe(1);
    expect(await PurchaseItem.count({ where: { purchaseId: first.body.purchase.id } })).toBe(2);
    expect(await CashMovement.count({ where: { referencia: first.body.purchase.codigo } })).toBe(1);
    const before = await snapshot([headerId, secondId]);
    const changed = await buy({
      ...data,
      items: [data.items[0], { ...data.items[1], cantidad: 3 }],
    });
    expect(changed.status, JSON.stringify(changed.body)).toBe(409);
    expect(await snapshot([headerId, secondId])).toEqual(before);
  });

  it('preserves the legacy parsed-payload fingerprint and retries without another expense', async () => {
    const orderId = await newOrder();
    const legacy = { operationKey: randomUUID(), workOrderId: orderId, ...line() };
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(createExpressPurchaseSchema.parse(legacy)))
      .digest('hex');
    const first = await buy(legacy);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const stored = (await Purchase.findByPk(first.body.purchase.id))!;
    expect(stored.expressFingerprint).toBe(fingerprint);
    const repeated = await buy(legacy);
    expect(repeated.status, JSON.stringify(repeated.body)).toBe(201);
    expect(repeated.body.purchase.id).toBe(first.body.purchase.id);
    expect(await PurchaseItem.count({ where: { purchaseId: stored.id } })).toBe(1);
    expect(await CashMovement.count({ where: { referencia: stored.codigo } })).toBe(1);
  });
});
