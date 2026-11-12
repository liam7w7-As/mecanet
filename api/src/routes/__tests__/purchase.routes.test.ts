import { Op } from 'sequelize';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { CashMovement } from '../../models/CashMovement.js';
import { CatalogItem } from '../../models/CatalogItem.js';
import { Purchase } from '../../models/Purchase.js';
import { PurchaseItem } from '../../models/PurchaseItem.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { StockBalance } from '../../models/StockBalance.js';
import { StockMovement } from '../../models/StockMovement.js';
import { Supplier } from '../../models/Supplier.js';
import { User } from '../../models/User.js';
import { Warehouse } from '../../models/Warehouse.js';
import { registerMovement } from '../../services/warehouse.service.js';
import { hashPassword } from '../../utils/password.js';

import type { CreatePurchaseInput } from '@unithor/shared';

const TEST_PASSWORD = 'Desarrollador2026!';
const TEST_EMAIL_PREFIX = 'phase-purchases-';
const TEST_SUPPLIER_PREFIX = 'Proveedor Fase Compras';
const TEST_CATALOG_PREFIX = 'PURC-';
const today = new Date().toISOString().slice(0, 10);

interface LoginCookies {
  accessToken: string;
  csrfToken: string;
}

interface PurchaseFixtureOverrides {
  formaPago?: 'contado' | 'credito';
  withStock?: boolean;
  cantidad?: number;
  precioUnitario?: number;
  proveedorNombre?: string;
  folio?: string;
}

const extractCookies = (res: request.Response): Record<string, string> => {
  const rawHeader = res.headers['set-cookie'];
  const rawCookies: string[] = Array.isArray(rawHeader)
    ? rawHeader
    : typeof rawHeader === 'string'
      ? [rawHeader]
      : [];

  return rawCookies.reduce<Record<string, string>>((cookies, cookieStr) => {
    const [pair] = cookieStr.split(';');
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex <= 0) {
      return cookies;
    }

    cookies[pair.slice(0, separatorIndex).trim()] = pair.slice(separatorIndex + 1).trim();
    return cookies;
  }, {});
};

const loginAs = async (email: string): Promise<LoginCookies> => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });

  expect(response.status).toBe(200);
  const cookies = extractCookies(response);

  return {
    accessToken: cookies.access_token,
    csrfToken: cookies.csrf_token,
  };
};

const authCookie = (cookies: LoginCookies): string[] => [
  `access_token=${cookies.accessToken}`,
  `csrf_token=${cookies.csrfToken}`,
];

const receiptBytes = Buffer.from('%PDF-1.4\n% comprobante de compra de prueba\n');

describe('Purchase Routes (E2E)', () => {
  let devUserId: number;
  let jefeUserId: number;
  let finanzasUserId: number;
  let bodegueroUserId: number;
  let catalogItemId: number;
  let warehouseId: number;
  let secondWarehouseId: number;

  const purchasePayload = (
    overrides: PurchaseFixtureOverrides = {},
  ): CreatePurchaseInput => {
    const cantidad = overrides.cantidad ?? 2;
    const precioUnitario = overrides.precioUnitario ?? 5000;

    return {
      proveedorNombre: overrides.proveedorNombre ?? `${TEST_SUPPLIER_PREFIX} Principal`,
      origenVehiculo: null,
      vehicleId: null,
      fleetVehicleId: null,
      workOrderId: null,
      conIva: true,
      formaPago: overrides.formaPago ?? 'contado',
      metodoPago: 'efectivo',
      tipoDocumento: 'factura',
      folio: overrides.folio ?? 'F-1001',
      fechaEmision: today,
      montoComprobante: Math.round(cantidad * precioUnitario * 1.19),
      numeroOperacion: 'OP-1001',
      banco: 'Banco de Chile',
      observaciones: 'Compra de prueba',
      items: [
        {
          catalogItemId: overrides.withStock ? catalogItemId : null,
          descripcion: 'Filtro de aceite de prueba',
          cantidad,
          precioUnitario,
          afectaStock: overrides.withStock ?? false,
          warehouseId: overrides.withStock ? warehouseId : null,
        },
      ],
    } as CreatePurchaseInput;
  };

  const createPurchaseRequest = (
    cookies: LoginCookies,
    payload: CreatePurchaseInput,
    attachReceipt = true,
  ) => {
    const base = request(app)
      .post('/api/purchases')
      .set('Cookie', authCookie(cookies))
      .set('X-CSRF-Token', cookies.csrfToken)
      .field('payload', JSON.stringify(payload));

    return attachReceipt
      ? base.attach('comprobante', receiptBytes, {
          filename: 'comprobante-compra.pdf',
          contentType: 'application/pdf',
        })
      : base;
  };

  beforeAll(async () => {
    await sequelize.authenticate();

    const passwordHash = await hashPassword(TEST_PASSWORD);
    const [devUser, jefeRole, finanzasRole, bodegueroRole] = await Promise.all([
      User.findOne({ where: { email: 'dev@unithor.local' } }),
      Role.findOne({ where: { nombre: 'jefe' } }),
      Role.findOne({ where: { nombre: 'finanzas' } }),
      Role.findOne({ where: { nombre: 'bodeguero' } }),
    ]);

    if (!devUser || !jefeRole || !finanzasRole || !bodegueroRole) {
      throw new Error('No se encontraron los usuarios o roles base para purchase.routes.test');
    }

    await devUser.update({ passwordHash, activo: true });
    devUserId = devUser.id;

    const [jefe, finanzas, bodeguero] = await Promise.all([
      User.create({
        nombre: 'Jefe Compras Fase',
        email: `${TEST_EMAIL_PREFIX}jefe@unithor.local`,
        passwordHash,
        roleId: jefeRole.id,
        activo: true,
      }),
      User.create({
        nombre: 'Finanzas Compras Fase',
        email: `${TEST_EMAIL_PREFIX}finanzas@unithor.local`,
        passwordHash,
        roleId: finanzasRole.id,
        activo: true,
      }),
      User.create({
        nombre: 'Bodeguero Compras Fase',
        email: `${TEST_EMAIL_PREFIX}bodeguero@unithor.local`,
        passwordHash,
        roleId: bodegueroRole.id,
        activo: true,
      }),
    ]);
    jefeUserId = jefe.id;
    finanzasUserId = finanzas.id;
    bodegueroUserId = bodeguero.id;

    const [warehouse, secondWarehouse, catalogItem] = await Promise.all([
      Warehouse.create({ codigo: 'PURC-ALM-1', nombre: 'Almacén compras 1', activo: true }),
      Warehouse.create({ codigo: 'PURC-ALM-2', nombre: 'Almacén compras 2', activo: true }),
      CatalogItem.create({
        tipo: 'parte',
        codigo: `${TEST_CATALOG_PREFIX}FILTRO`,
        nombre: 'Filtro de prueba compras',
        descripcion: null,
        precio: 5000,
        stock: 0,
      }),
    ]);

    warehouseId = warehouse.id;
    secondWarehouseId = secondWarehouse.id;
    catalogItemId = catalogItem.id;
  });

  afterAll(async () => {
    const testSuppliers = await Supplier.findAll({
      where: { nombre: { [Op.like]: `${TEST_SUPPLIER_PREFIX}%` } },
    });
    const testSupplierIds = testSuppliers.map((supplier) => supplier.id);

    const purchases = await Purchase.findAll({
      where: { supplierId: testSupplierIds },
    });
    const purchaseIds = purchases.map((purchase) => purchase.id);
    const cashMovementIds = purchases
      .map((purchase) => purchase.cashMovementId)
      .filter((value): value is number => value !== null);

    await PurchaseItem.destroy({ where: { purchaseId: purchaseIds }, force: true });
    await Purchase.destroy({ where: { id: purchaseIds }, force: true });
    if (cashMovementIds.length > 0) {
      await CashMovement.destroy({ where: { id: cashMovementIds }, force: true });
    }
    await Supplier.destroy({
      where: { nombre: { [Op.like]: `${TEST_SUPPLIER_PREFIX}%` } },
      force: true,
    });

    await StockMovement.destroy({ where: { catalogItemId }, force: true });
    await StockBalance.destroy({ where: { catalogItemId }, force: true });
    await CatalogItem.destroy({ where: { id: catalogItemId }, force: true });
    await Warehouse.destroy({ where: { id: [warehouseId, secondWarehouseId] }, force: true });

    await RefreshToken.destroy({
      where: { userId: [jefeUserId, finanzasUserId, bodegueroUserId] },
      force: true,
    });
    await User.destroy({
      where: { id: [jefeUserId, finanzasUserId, bodegueroUserId] },
      force: true,
    });
  });

  it('exige autenticación, lectura y permisos de creación', async () => {
    const noSession = await request(app).get('/api/purchases');
    expect(noSession.status).toBe(401);

    const bodegueroCookies = await loginAs(`${TEST_EMAIL_PREFIX}bodeguero@unithor.local`);
    const readResponse = await request(app)
      .get('/api/purchases')
      .set('Cookie', authCookie(bodegueroCookies));
    expect(readResponse.status).toBe(200);

    const createResponse = await createPurchaseRequest(
      bodegueroCookies,
      purchasePayload(),
    );
    expect(createResponse.status).toBe(403);

    const jefeCookies = await loginAs(`${TEST_EMAIL_PREFIX}jefe@unithor.local`);
    const jefeCreate = await createPurchaseRequest(jefeCookies, purchasePayload(), false);
    expect(jefeCreate.status).toBe(400);
    expect(jefeCreate.body.error.message).toContain('comprobante');
  });

  it('registra una compra de contado, crea proveedor, egreso y stock', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const response = await createPurchaseRequest(
      devCookies,
      purchasePayload({ withStock: true }),
    );

    expect(response.status).toBe(201);
    const purchase = response.body.purchase as {
      id: number;
      codigo: string;
      neto: number;
      iva: number;
      total: number;
      formaPago: string;
      pagadoAt: string | null;
      cashMovementId: number | null;
      supplier: { nombre: string; datosCompletos: boolean };
      items: Array<{ afectaStock: boolean; warehouseId: number | null }>;
    };
    expect(purchase.codigo).toMatch(/^COMP-\d{6}$/);
    expect(purchase).toMatchObject({
      neto: 10000,
      iva: 1900,
      total: 11900,
      formaPago: 'contado',
      supplier: {
        nombre: `${TEST_SUPPLIER_PREFIX} Principal`,
        datosCompletos: false,
      },
    });
    expect(purchase.pagadoAt).not.toBeNull();
    expect(purchase.cashMovementId).not.toBeNull();
    expect(purchase.items[0]).toMatchObject({ afectaStock: true, warehouseId });

    const cashMovement = await CashMovement.findByPk(purchase.cashMovementId as number);
    expect(cashMovement).toMatchObject({
      tipo: 'egreso',
      categoria: 'compra_repuesto',
      metodo: 'efectivo',
      voidedAt: null,
    });
    expect(Number(cashMovement?.monto)).toBe(11900);

    const stockMovement = await StockMovement.findOne({
      where: { catalogItemId, referencia: purchase.codigo },
    });
    expect(stockMovement).toMatchObject({ tipo: 'ingreso' });
    expect(Number(stockMovement?.cantidad)).toBe(2);

    const balance = await StockBalance.findOne({ where: { catalogItemId, warehouseId } });
    expect(Number(balance?.cantidad)).toBe(2);

    const receiptResponse = await request(app)
      .get(`/api/purchases/${purchase.id}/receipt`)
      .set('Cookie', authCookie(devCookies));
    expect(receiptResponse.status).toBe(200);
    expect(receiptResponse.headers['content-type']).toContain('application/pdf');
    expect(receiptResponse.body.subarray(0, 5).toString('ascii')).toBe('%PDF-');

    const downloadResponse = await request(app)
      .get(`/api/purchases/${purchase.id}/receipt?download=1`)
      .set('Cookie', authCookie(devCookies));
    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers['content-disposition']).toContain('attachment');

    const listResponse = await request(app)
      .get('/api/purchases')
      .query({ search: purchase.codigo })
      .set('Cookie', authCookie(devCookies));
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.items).toHaveLength(1);
    expect(listResponse.body.summary).toMatchObject({ count: 1, total: 11900 });
  });

  it('registra una compra a crédito y genera el egreso recién al pagar', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const jefeCookies = await loginAs(`${TEST_EMAIL_PREFIX}jefe@unithor.local`);
    const finanzasCookies = await loginAs(`${TEST_EMAIL_PREFIX}finanzas@unithor.local`);
    const response = await createPurchaseRequest(
      devCookies,
      purchasePayload({ formaPago: 'credito', folio: 'F-2001' }),
    );

    expect(response.status).toBe(201);
    const purchase = response.body.purchase as {
      id: number;
      total: number;
      cashMovementId: number | null;
      pagadoAt: string | null;
    };
    expect(purchase.cashMovementId).toBeNull();
    expect(purchase.pagadoAt).toBeNull();

    const forbiddenPayment = await request(app)
      .post(`/api/purchases/${purchase.id}/payment`)
      .set('Cookie', authCookie(finanzasCookies))
      .set('X-CSRF-Token', finanzasCookies.csrfToken)
      .send({ metodo: 'transferencia' });
    expect(forbiddenPayment.status).toBe(403);

    const paymentResponse = await request(app)
      .post(`/api/purchases/${purchase.id}/payment`)
      .set('Cookie', authCookie(jefeCookies))
      .set('X-CSRF-Token', jefeCookies.csrfToken)
      .send({
        metodo: 'transferencia',
        referencia: 'Transferencia proveedor',
        banco: 'Banco Santander',
        numeroOperacion: 'TRX-COMP-1',
      });

    expect(paymentResponse.status).toBe(200);
    expect(paymentResponse.body.purchase.pagadoAt).not.toBeNull();
    expect(paymentResponse.body.purchase.cashMovementId).not.toBeNull();

    const cashMovement = await CashMovement.findByPk(
      paymentResponse.body.purchase.cashMovementId as number,
    );
    expect(cashMovement).toMatchObject({
      tipo: 'egreso',
      categoria: 'pago_proveedor',
      metodo: 'transferencia',
    });
    expect(Number(cashMovement?.monto)).toBe(purchase.total);
    expect(cashMovement?.descripcion).toContain('Banco: Banco Santander');
    expect(cashMovement?.descripcion).toContain('Operación: TRX-COMP-1');
    expect(paymentResponse.body.purchase.cashMovement.descripcion).toBe(cashMovement?.descripcion);

    const duplicatePayment = await request(app)
      .post(`/api/purchases/${purchase.id}/payment`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({ metodo: 'efectivo' });
    expect(duplicatePayment.status).toBe(409);

    const jefeVoid = await request(app)
      .patch(`/api/purchases/${purchase.id}/void`)
      .set('Cookie', authCookie(jefeCookies))
      .set('X-CSRF-Token', jefeCookies.csrfToken)
      .send({ motivo: 'Intento sin permisos' });
    expect(jefeVoid.status).toBe(403);

    const voidResponse = await request(app)
      .patch(`/api/purchases/${purchase.id}/void`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({ motivo: 'Compra duplicada' });
    expect(voidResponse.status).toBe(200);
    expect(voidResponse.body.purchase).toMatchObject({
      estado: 'anulada',
      voidReason: 'Compra duplicada',
    });

    const voidedCash = await CashMovement.findByPk(
      paymentResponse.body.purchase.cashMovementId as number,
    );
    expect(voidedCash?.voidedAt).not.toBeNull();
  });

  it('revierte el stock al anular una compra y falla si ya fue consumido', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const response = await createPurchaseRequest(
      devCookies,
      purchasePayload({ withStock: true, cantidad: 1, folio: 'F-3001' }),
    );
    expect(response.status).toBe(201);
    const purchaseId = response.body.purchase.id as number;

    const voidResponse = await request(app)
      .patch(`/api/purchases/${purchaseId}/void`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({ motivo: 'Devolución al proveedor' });
    expect(voidResponse.status).toBe(200);

    const balance = await StockBalance.findOne({ where: { catalogItemId, warehouseId } });
    expect(Number(balance?.cantidad)).toBe(2);

    const reversal = await StockMovement.findOne({
      where: { catalogItemId, referencia: `ANUL-${response.body.purchase.codigo as string}` },
    });
    expect(reversal).toMatchObject({ tipo: 'salida' });
    expect(Number(reversal?.cantidad)).toBe(1);

    const secondResponse = await createPurchaseRequest(
      devCookies,
      purchasePayload({ withStock: true, cantidad: 1, folio: 'F-3002' }),
    );
    expect(secondResponse.status).toBe(201);
    const secondId = secondResponse.body.purchase.id as number;

    await StockMovement.create({
      catalogItemId,
      warehouseId,
      tipo: 'salida',
      cantidad: 3,
      saldoResultante: 0,
      motivo: 'Consumo de prueba',
      referencia: 'TEST-CONSUMO',
      createdBy: devUserId,
    });
    await StockBalance.update({ cantidad: 0 }, { where: { catalogItemId, warehouseId } });

    const failedVoid = await request(app)
      .patch(`/api/purchases/${secondId}/void`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({ motivo: 'Intento con stock consumido' });
    expect(failedVoid.status).toBe(400);

    const stillRegistered = await Purchase.findByPk(secondId);
    expect(stillRegistered?.estado).toBe('registrada');
  });

  it('recibe líneas repetidas una sola vez por almacén y revierte sin perder el pago histórico', async () => {
    const cookies = await loginAs('dev@unithor.local');
    const payload = purchasePayload({ withStock: true, folio: 'F-MULTI' });
    payload.items = [
      { ...payload.items[0], cantidad: 2, precioUnitario: 12.5 },
      { ...payload.items[0], cantidad: 3, precioUnitario: 3.25 },
      { ...payload.items[0], warehouseId: secondWarehouseId, cantidad: 4, precioUnitario: 1.1 },
      { ...payload.items[0], afectaStock: false, cantidad: 7, precioUnitario: 2 },
    ];
    const before = Number(await StockBalance.sum('cantidad', { where: { catalogItemId } }) ?? 0);
    const balanceBefore = async (target: number) => Number(
      (await StockBalance.findOne({ where: { catalogItemId, warehouseId: target } }))?.cantidad ?? 0,
    );
    const firstBefore = await balanceBefore(warehouseId);
    const secondBefore = await balanceBefore(secondWarehouseId);
    const created = await createPurchaseRequest(cookies, payload);
    expect(created.status).toBe(201);
    const purchase = created.body.purchase;
    expect(purchase).toMatchObject({ neto: 53.15, iva: 10.1, total: 63.25 });
    expect(new Set(purchase.items.map((item: { id: number }) => item.id)).size).toBe(4);
    expect(purchase.items[3].warehouseId).toBeNull();
    expect(await balanceBefore(warehouseId)).toBe(firstBefore + 5);
    expect(await balanceBefore(secondWarehouseId)).toBe(secondBefore + 4);
    expect(Number((await CatalogItem.findByPk(catalogItemId))?.stock)).toBe(before + 9);
    const movements = () => StockMovement.count({ where: { referencia: purchase.codigo } });
    expect(await movements()).toBe(3);
    await request(app).get(`/api/purchases/${purchase.id}`).set('Cookie', authCookie(cookies));
    await request(app).get(`/api/purchases/${purchase.id}/receipt`).set('Cookie', authCookie(cookies));
    expect(await movements()).toBe(3);
    expect(await balanceBefore(warehouseId)).toBe(firstBefore + 5);

    const voidRequest = () => request(app)
      .patch(`/api/purchases/${purchase.id}/void`)
      .set('Cookie', authCookie(cookies)).set('X-CSRF-Token', cookies.csrfToken)
      .send({ motivo: 'Devolución de todas las líneas' });
    const voided = await voidRequest();
    expect(voided.status).toBe(200);
    expect(voided.body.purchase).toMatchObject({
      estado: 'anulada', total: 63.25, pagadoAt: purchase.pagadoAt,
      cashMovementId: purchase.cashMovementId,
      cashMovement: { monto: 63.25 },
    });
    expect(voided.body.purchase.cashMovement.voidedAt).not.toBeNull();
    expect(await balanceBefore(warehouseId)).toBe(firstBefore);
    expect(await balanceBefore(secondWarehouseId)).toBe(secondBefore);
    expect(Number((await CatalogItem.findByPk(catalogItemId))?.stock)).toBe(before);
    expect((await voidRequest()).status).toBe(409);
    expect(await StockMovement.count({ where: { referencia: `ANUL-${purchase.codigo}` } })).toBe(3);
    const payment = await request(app).post(`/api/purchases/${purchase.id}/payment`)
      .set('Cookie', authCookie(cookies)).set('X-CSRF-Token', cookies.csrfToken)
      .send({ metodo: 'efectivo' });
    expect(payment.status).toBe(409);
  });

  it('revierte toda la transacción si un almacén no conserva stock suficiente', async () => {
    const cookies = await loginAs('dev@unithor.local');
    const payload = purchasePayload({ withStock: true, cantidad: 2, folio: 'F-ROLLBACK' });
    payload.items.push({ ...payload.items[0], cantidad: 3, warehouseId: secondWarehouseId });
    const created = await createPurchaseRequest(cookies, payload);
    expect(created.status).toBe(201);
    const purchase = created.body.purchase;
    await registerMovement({
      catalogItemId, warehouseId: secondWarehouseId, tipo: 'salida', cantidad: 3,
      motivo: 'Consumo antes de anular compra',
    }, devUserId);
    const balancesBefore = await StockBalance.findAll({
      where: { catalogItemId }, order: [['warehouseId', 'ASC']], raw: true,
    });
    const globalBefore = Number((await CatalogItem.findByPk(catalogItemId))?.stock);
    const response = await request(app).patch(`/api/purchases/${purchase.id}/void`)
      .set('Cookie', authCookie(cookies)).set('X-CSRF-Token', cookies.csrfToken)
      .send({ motivo: 'Debe fallar sin revertir parcialmente' });
    expect(response.status).toBe(400);
    expect(await StockBalance.findAll({
      where: { catalogItemId }, order: [['warehouseId', 'ASC']], raw: true,
    })).toEqual(balancesBefore);
    expect(Number((await CatalogItem.findByPk(catalogItemId))?.stock)).toBe(globalBefore);
    expect(await StockMovement.count({ where: { referencia: `ANUL-${purchase.codigo}` } })).toBe(0);
    expect(await Purchase.findByPk(purchase.id)).toMatchObject({
      estado: 'registrada', cashMovementId: purchase.cashMovementId,
    });
    expect((await CashMovement.findByPk(purchase.cashMovementId))?.voidedAt).toBeNull();
  });

  it.each(['catalogItemId', 'warehouseId'] as const)(
    'impide anular silenciosamente un ítem de stock que perdió %s', async (field) => {
      const cookies = await loginAs('dev@unithor.local');
      const created = await createPurchaseRequest(cookies,
        purchasePayload({ withStock: true, folio: `F-LOST-${field}` }));
      expect(created.status).toBe(201);
      const purchase = created.body.purchase;
      await PurchaseItem.update({ [field]: null }, { where: { id: purchase.items[0].id } });
      const response = await request(app).patch(`/api/purchases/${purchase.id}/void`)
        .set('Cookie', authCookie(cookies)).set('X-CSRF-Token', cookies.csrfToken)
        .send({ motivo: 'Referencia de stock eliminada' });
      expect(response.status).toBe(409);
      expect(await Purchase.findByPk(purchase.id)).toMatchObject({ estado: 'registrada' });
      expect((await CashMovement.findByPk(purchase.cashMovementId))?.voidedAt).toBeNull();
      expect(await StockMovement.count({ where: { referencia: `ANUL-${purchase.codigo}` } })).toBe(0);
    },
  );

  it('serializa pagos concurrentes y conserva monto y fecha de pago asignados por el servidor', async () => {
    const cookies = await loginAs('dev@unithor.local');
    const created = await createPurchaseRequest(cookies,
      purchasePayload({ formaPago: 'credito', folio: 'F-CONCURRENT' }));
    expect(created.status).toBe(201);
    const purchase = created.body.purchase;
    // MySQL DATE columns retain whole seconds in this schema.
    const startedAt = Math.floor(Date.now() / 1000) * 1000;
    const pay = () => request(app).post(`/api/purchases/${purchase.id}/payment`)
      .set('Cookie', authCookie(cookies)).set('X-CSRF-Token', cookies.csrfToken)
      .send({ metodo: 'transferencia', monto: 1, fecha: '2000-01-01' });
    const results = await Promise.all([pay(), pay()]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const updated = results.find((result) => result.status === 200)!.body.purchase;
    expect(Number((await CashMovement.findByPk(updated.cashMovementId))?.monto)).toBe(purchase.total);
    expect(new Date(updated.cashMovement.fecha).getTime()).toBeGreaterThanOrEqual(startedAt);
    expect(new Date(updated.cashMovement.fecha).getTime()).toBeLessThanOrEqual(Date.now());
    expect(await CashMovement.count({ where: { referencia: purchase.codigo } })).toBe(1);
    expect(await StockMovement.count({ where: { referencia: purchase.codigo } })).toBe(0);
  });

  it('valida los metadatos del comprobante y el stock', async () => {
    const devCookies = await loginAs('dev@unithor.local');

    const missingMetadata = purchasePayload();
    const invalidPayload = {
      ...missingMetadata,
      banco: '',
      numeroOperacion: '',
    };
    const metadataResponse = await createPurchaseRequest(devCookies, invalidPayload);
    expect(metadataResponse.status).toBe(400);
    expect(metadataResponse.body.error.code).toBe('VALIDATION_ERROR');

    const stockWithoutWarehouse = purchasePayload({ withStock: true, folio: 'F-4001' });
    stockWithoutWarehouse.items[0].warehouseId = null;
    const stockResponse = await createPurchaseRequest(devCookies, stockWithoutWarehouse);
    expect(stockResponse.status).toBe(400);

    const withoutReceipt = await createPurchaseRequest(
      devCookies,
      purchasePayload({ folio: 'F-4002' }),
      false,
    );
    expect(withoutReceipt.status).toBe(400);
  });

  it('completa los datos del proveedor solo con administración', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const jefeCookies = await loginAs(`${TEST_EMAIL_PREFIX}jefe@unithor.local`);
    const createResponse = await createPurchaseRequest(
      devCookies,
      purchasePayload({ proveedorNombre: `${TEST_SUPPLIER_PREFIX} Por Completar`, folio: 'F-5001' }),
    );
    expect(createResponse.status).toBe(201);
    const supplierId = createResponse.body.purchase.supplierId as number;

    const jefeUpdate = await request(app)
      .patch(`/api/suppliers/${supplierId}`)
      .set('Cookie', authCookie(jefeCookies))
      .set('X-CSRF-Token', jefeCookies.csrfToken)
      .send({ rut: '76543210-9', telefono: '+56 9 8765 4321' });
    expect(jefeUpdate.status).toBe(403);

    const adminUpdate = await request(app)
      .patch(`/api/suppliers/${supplierId}`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({
        rut: '76543210-9',
        telefono: '+56 9 8765 4321',
        email: 'proveedor@example.com',
      });
    expect(adminUpdate.status).toBe(200);
    expect(adminUpdate.body.supplier).toMatchObject({
      rut: '765432109',
      datosCompletos: true,
    });
  });

  it('genera reportes PDF y Excel y restringe su exportación', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const bodegueroCookies = await loginAs(`${TEST_EMAIL_PREFIX}bodeguero@unithor.local`);

    const pdfResponse = await request(app)
      .get('/api/purchases/report/pdf')
      .set('Cookie', authCookie(devCookies));
    expect(pdfResponse.status).toBe(200);
    expect(pdfResponse.headers['content-type']).toContain('application/pdf');

    const excelResponse = await request(app)
      .get('/api/purchases/report/excel')
      .set('Cookie', authCookie(devCookies));
    expect(excelResponse.status).toBe(200);
    expect(excelResponse.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    const forbidden = await request(app)
      .get('/api/purchases/report/pdf')
      .set('Cookie', authCookie(bodegueroCookies));
    expect(forbidden.status).toBe(403);
  });
});
