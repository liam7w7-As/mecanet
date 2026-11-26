import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { CashClosure } from '../../models/CashClosure.js';
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
import { WorkOrderItem } from '../../models/WorkOrderItem.js';
import { WorkOrderObservation } from '../../models/WorkOrderObservation.js';
import { WorkOrderRequest } from '../../models/WorkOrderRequest.js';
import { closeCashDay, getDailyCashSummary } from '../../services/cash-closure.service.js';
import { createPriceSuggestion, reviewPriceSuggestion } from '../../services/work-order-commercial.service.js';
import { syncMirrorQuotationFromWorkOrder } from '../../services/work-order.service.js';
import { hashPassword } from '../../utils/password.js';

describe('Express unused accessories and late expenses', () => {
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

  const sendToStock = (id: number, motivo = 'El accesorio no se necesitó') => post(`/api/purchases/${id}/return-to-stock`).send({ motivo });
  it('requires authentication and CSRF before returning a purchase', async () => {
    expect((await request(app).post('/api/purchases/1/return-to-stock').set('Cookie','csrf_token=guest-review').set('X-CSRF-Token','guest-review').send({motivo:'Sin uso'})).status).toBe(401);
    expect((await request(app).post('/api/purchases/1/return-to-stock').set('Cookie',cookies).send({motivo:'Sin uso'})).status).toBe(403);
  });
  it.each(['jefe', 'bodeguero', 'finanzas'] as const)('respects the return-to-stock role permissions: %s', async (roleName) => {
    const role = (await Role.findOne({where:{nombre:roleName}}))!;
    const actor = await User.create({nombre:'Prueba devolución',username:`exp_${randomUUID().slice(0,8)}`,email:`exp-${randomUUID()}@test.local`,roleId:role.id,passwordHash:await hashPassword('Prueba123!'),activo:true});
    try {
      const login = await request(app).post('/api/auth/login').send({identifier:actor.email,password:'Prueba123!'});
      expect(login.status).toBe(200);
      const actorCookies = (login.headers['set-cookie'] as unknown as string[]).map((value)=>value.split(';')[0]);
      const actorCsrf = actorCookies.find((value)=>value.startsWith('csrf_token='))!.slice('csrf_token='.length);
      const orderId = await newOrder();
      const purchase = (await buy(payload(orderId))).body.purchase;
      const before = await StockMovement.count();
      const response = await request(app).post(`/api/purchases/${purchase.id}/return-to-stock`).set('Cookie',actorCookies).set('X-CSRF-Token',actorCsrf).send({motivo:'Accesorio no utilizado'});
      expect(response.status,JSON.stringify(response.body)).toBe(roleName==='jefe'?200:403);
      expect(await StockMovement.count()).toBe(before+(roleName==='jefe'?1:0));
    } finally { await actor.destroy(); }
  });
  it('returns a manual accessory automatically, preserving expense, observations and hours', async () => {
    const orderId = await newOrder();
    const purchase = (await buy(payload(orderId))).body.purchase;
    const item = (await WorkOrderItem.findOne({where:{workOrderId:orderId}}))!;
    await item.update({estadoOperativo:'en_proceso',horasHombreReales:3,notasOperativas:'Inspeccionado, no se utilizó'});
    const note = await WorkOrderObservation.create({workOrderId:orderId,workOrderItemId:item.id,progressReportId:null,authorId:user.id,authorName:user.nombre,texto:'Conservar este historial'});
    const response = await sendToStock(purchase.id);
    expect(response.status,JSON.stringify(response.body)).toBe(200);
    const returned = response.body.purchase;
    expect(returned.estado).toBe('registrada');
    expect(returned.cashMovement.voidedAt).toBeNull();
    expect(returned.cashMovement.monto).toBe(23800);
    expect(returned.items[0].stockReturnedAt).toBeTruthy();
    expect(returned.items[0].warehouse.codigo).toBe('CENTRAL');
    expect(Number((await CatalogItem.findByPk(returned.items[0].catalogItemId))!.stock)).toBe(2);
    const saved = (await WorkOrderItem.findByPk(item.id))!;
    expect(saved.estadoOperativo).toBe('omitido');
    expect(Number(saved.precioUnitario)).toBe(0);
    expect(Number(saved.horasHombreReales)).toBe(3);
    expect(saved.expressStockReturnedAt).not.toBeNull();
    expect(await WorkOrderObservation.findByPk(note.id)).not.toBeNull();
    expect(Number((await Quotation.findOne({where:{workOrderId:orderId}}))!.total)).toBe(0);
    expect(Number((await QuotationItem.findOne({where:{workOrderItemId:item.id}}))!.precioUnitario)).toBe(0);
  });
  it('returns a requested accessory to its existing catalogue without restoring an old customer charge', async () => {
    const orderId = await newOrder(true);
    const source = (await WorkOrderRequest.findOne({where:{workOrderId:orderId}}))!;
    const purchase = (await buy({...payload(orderId),requestId:source.id})).body.purchase;
    const before = Number((await CatalogItem.findByPk(catalog.id))!.stock);
    const response = await sendToStock(purchase.id);
    expect(response.status,JSON.stringify(response.body)).toBe(200);
    expect(response.body.purchase.items[0].catalogItemId).toBe(catalog.id);
    expect(Number((await CatalogItem.findByPk(catalog.id))!.stock)).toBe(before+2);
    expect((await WorkOrderRequest.findByPk(source.id))!.estado).toBe('cancelada');
    expect(Number((await WorkOrderItem.findByPk(source.workOrderItemId!))!.precioUnitario)).toBe(0);
    expect(Number((await Quotation.findOne({where:{workOrderId:orderId}}))!.total)).toBe(0);
  });
  it('does not duplicate stock under concurrent retries', async () => {
    const orderId = await newOrder();
    const purchase = (await buy(payload(orderId))).body.purchase;
    const [a,b] = await Promise.all([sendToStock(purchase.id),sendToStock(purchase.id)]);
    expect([a.status,b.status],JSON.stringify([a.body,b.body])).toEqual([200,200]);
    expect(await StockMovement.count({where:{referencia:`EXP-STOCK-${purchase.id}-${purchase.items[0].id}`}})).toBe(1);
    const line = (await PurchaseItem.findByPk(purchase.items[0].id))!;
    expect(Number((await StockBalance.findOne({where:{catalogItemId:line.catalogItemId!,warehouseId:line.warehouseId!}}))!.cantidad)).toBe(2);
  });
  it.each(['completado','consumido'] as const)('blocks used accessories: %s', async (mode) => {
    const orderId = await newOrder();
    const purchase = (await buy(payload(orderId))).body.purchase;
    await WorkOrderItem.update(mode==='completado'?{estadoOperativo:'completado'}:{stockConsumido:true},{where:{workOrderId:orderId}});
    const count = await StockMovement.count();
    expect((await sendToStock(purchase.id)).status).toBe(409);
    expect(await StockMovement.count()).toBe(count);
    expect((await PurchaseItem.findByPk(purchase.items[0].id))!.stockReturnedAt).toBeNull();
    expect((await CashMovement.findByPk(purchase.cashMovementId))!.voidedAt).toBeNull();
  });
  it('rolls back stock and the catalogue creation if removing the charge would invalidate payments', async () => {
    const orderId = await newOrder();
    const purchase = (await buy(payload(orderId))).body.purchase;
    await Quotation.update({pagado:1000,estadoPago:'parcial'},{where:{workOrderId:orderId}});
    const count = await StockMovement.count();
    const catalogueCount = await CatalogItem.count();
    const response = await sendToStock(purchase.id);
    expect(response.status,JSON.stringify(response.body)).toBe(400);
    expect(await StockMovement.count()).toBe(count);
    expect(await CatalogItem.count()).toBe(catalogueCount);
    expect((await PurchaseItem.findByPk(purchase.items[0].id))!.stockReturnedAt).toBeNull();
    expect(Number((await WorkOrderItem.findOne({where:{workOrderId:orderId}}))!.precioUnitario)).toBe(12500);
  });
  it('preserves an expense instead of allowing the old void endpoint to cancel it', async () => {
    const orderId = await newOrder();
    const purchase = (await buy(payload(orderId))).body.purchase;
    const response = await request(app).patch(`/api/purchases/${purchase.id}/void`).set('Cookie',cookies).set('X-CSRF-Token',csrf).send({motivo:'No se utilizará'});
    expect(response.status).toBe(400);
    expect(response.body.message ?? response.body.error?.message).toMatch(/stock general/);
    expect((await CashMovement.findByPk(purchase.cashMovementId))!.voidedAt).toBeNull();
  });
  it('does not let a returned accessory be reactivated in the same OT', async () => {
    const orderId = await newOrder();
    const purchase = (await buy(payload(orderId))).body.purchase;
    expect((await sendToStock(purchase.id)).status).toBe(200);
    const response = await request(app).patch(`/api/work-orders/${orderId}`).set('Cookie',cookies).set('X-CSRF-Token',csrf).send({items:[{
      id:purchase.items[0].workOrderItemId,catalogItemId:null,descripcion:'Filtro express',cantidad:2,precioUnitario:12500,tipoLinea:'parte',division:'ACC',subtipo:'a_pedido',unidadMedida:'unidad',estadoOperativo:'pendiente',
    }]});
    expect(response.status,JSON.stringify(response.body)).toBe(400);
    expect(Number((await Quotation.findOne({where:{workOrderId:orderId}}))!.total)).toBe(0);
  });
  it('allows a purchase after closing without changing the original closure', async () => {
    const fecha = new Date().toISOString().slice(0,10);
    await closeCashDay({fecha,efectivoDeclarado:0},user.id);
    const before = (await CashClosure.findOne({where:{fecha}}))!.toJSON();
    const orderId = await newOrder();
    const response = await buy(payload(orderId));
    expect(response.status,JSON.stringify(response.body)).toBe(201);
    expect(response.body.purchase.cashMovement.afterClosureId).toBe(before.id);
    expect((await CashClosure.findByPk(before.id))!.toJSON()).toEqual(before);
    const summary = await getDailyCashSummary(fecha);
    expect(summary.postClosureExpenses).toEqual({count:1,total:23800});
    expect(summary.closure!.totalEgresos).toBe(Number(before.totalEgresos));
    expect(summary.totals.expenseTotal).toBe(Number(before.totalEgresos)+23800);
    expect((await sendToStock(response.body.purchase.id)).status).toBe(200);
    expect((await CashClosure.findByPk(before.id))!.toJSON()).toEqual(before);
    expect((await CashMovement.findByPk(response.body.purchase.cashMovementId))!.voidedAt).toBeNull();
  });
  it('serializes delivery against return without a duplicate movement or a server error', async () => {
    const orderId = await newOrder(true);
    const source = (await WorkOrderRequest.findOne({where:{workOrderId:orderId}}))!;
    const purchase = (await buy({...payload(orderId),requestId:source.id})).body.purchase;
    const [returned, delivered] = await Promise.all([sendToStock(purchase.id),post(`/api/warehouses/requests/${source.id}/deliver`).send({})]);
    expect(returned.status,JSON.stringify(returned.body)).toBe(200);
    expect([200,400]).toContain(delivered.status);
    expect(await StockMovement.count({where:{referencia:`EXP-STOCK-${purchase.id}-${purchase.items[0].id}`}})).toBe(1);
    expect((await WorkOrderRequest.findByPk(source.id))!.estado).toBe('cancelada');
    expect((await CashMovement.findByPk(purchase.cashMovementId))!.voidedAt).toBeNull();
  });
  it('keeps the returned charge at zero while another service price is approved concurrently', async () => {
    const orderId = await newOrder();
    const purchase = (await buy(payload(orderId))).body.purchase;
    const service = await WorkOrderItem.create({workOrderId:orderId,catalogItemId:null,tipoLinea:'especifico',division:'MEC',subtipo:'especifico',descripcion:'Servicio para concurrencia',cantidad:1,unidadMedida:'servicio',precioUnitario:10000,subtotal:10000});
    await sequelize.transaction((transaction)=>syncMirrorQuotationFromWorkOrder(orderId,transaction));
    await WorkOrder.update({priceApprovalRequired:true},{where:{id:orderId}});
    const suggestion = await createPriceSuggestion(orderId,{workOrderItemId:service.id,precioSugerido:20000,alcance:'ot',motivo:'Complejidad del servicio'},user.id);
    const [returned, approved] = await Promise.all([sendToStock(purchase.id),reviewPriceSuggestion(orderId,suggestion.id,{decision:'aprobar'},user.id)]);
    expect(returned.status,JSON.stringify(returned.body)).toBe(200);
    expect(approved.estado).toBe('aprobada');
    expect(Number((await Quotation.findOne({where:{workOrderId:orderId}}))!.total)).toBe(20000);
    expect(Number((await QuotationItem.findOne({where:{workOrderItemId:purchase.items[0].workOrderItemId}}))!.precioUnitario)).toBe(0);
  });
});
