import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { CashMovement } from '../../models/CashMovement.js';
import { Quotation } from '../../models/Quotation.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { Vehicle } from '../../models/Vehicle.js';
import { hashPassword } from '../../utils/password.js';

interface Session {
  id: number;
  cookies: string[];
  csrf: string;
}

const users: User[] = [];
const createSession = async (roleName: 'admin' | 'jefe'): Promise<Session> => {
  const role = await Role.findOne({ where: { nombre: roleName } });
  const password = 'Test-express-123';
  const username = `express.${randomUUID().slice(0, 8)}`;
  const user = await User.create({
    username,
    nombre: username,
    email: `${username}@unithor.local`,
    roleId: role!.id,
    passwordHash: await hashPassword(password),
    activo: true,
  });
  users.push(user);
  const response = await request(app)
    .post('/api/auth/login')
    .send({ identifier: username, password });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  const cookies = (response.headers['set-cookie'] as unknown as string[]).map(
    (cookie) => cookie.split(';')[0],
  );
  return {
    id: user.id,
    cookies,
    csrf: cookies.find((cookie) => cookie.startsWith('csrf_token='))!.slice(11),
  };
};
const get = (session: Session, path: string) =>
  request(app).get(`/api${path}`).set('Cookie', session.cookies);
const post = (session: Session, path: string) =>
  request(app).post(`/api${path}`).set('Cookie', session.cookies).set('X-CSRF-Token', session.csrf);
const patch = (session: Session, path: string) =>
  request(app)
    .patch(`/api${path}`)
    .set('Cookie', session.cookies)
    .set('X-CSRF-Token', session.csrf);
const payload = (destino: 'oficina' | 'flota' | 'taller') => ({
  destino,
  operationKey: randomUUID(),
  concepto: `Compra de ${destino}`,
  monto: 12000,
  metodoPago: 'efectivo',
});
const expense = (session: Session, data: object) =>
  post(session, '/purchases/express/expense').field('payload', JSON.stringify(data));
const newWorkOrder = async (session: Session): Promise<number> => {
  const vehicle = (await Vehicle.findOne())!;
  const response = await post(session, '/work-orders').send({
    clientId: vehicle.clientId,
    vehicleId: vehicle.id,
    items: [],
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body.workOrder.id as number;
};

describe('Destinos e historial de Compras express', () => {
  let owner: Session;
  let other: Session;
  let admin: Session;

  beforeAll(async () => {
    owner = await createSession('jefe');
    other = await createSession('jefe');
    admin = await createSession('admin');
  });

  afterAll(async () => {
    for (const user of users) await user.destroy();
    await sequelize.close();
  });

  it('registra egresos una sola vez y separa los registros de Oficina, Flota y Taller', async () => {
    const fleet = await post(admin, '/fleet-vehicles').send({
      patente: 'FLOT83',
      marca: 'Toyota',
      modelo: 'Hilux',
    });
    expect(fleet.status, JSON.stringify(fleet.body)).toBe(201);
    const fleetId = fleet.body.fleetVehicle.id as number;
    const options = await get(owner, '/purchases/express/fleet').query({ search: 'FLOT83' });
    expect(options.status).toBe(200);
    expect(options.body.items).toEqual([expect.objectContaining({ id: fleetId, marca: 'Toyota' })]);

    const office = payload('oficina');
    const responses = await Promise.all([expense(owner, office), expense(owner, office)]);
    for (const response of responses)
      expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(responses[0].body.purchase.id).toBe(responses[1].body.purchase.id);

    const fleetExpense = await expense(owner, { ...payload('flota'), fleetVehicleId: fleetId });
    const shop = await expense(owner, payload('taller'));
    expect(fleetExpense.status, JSON.stringify(fleetExpense.body)).toBe(201);
    expect(shop.status, JSON.stringify(shop.body)).toBe(201);
    for (const [ledger, response] of [
      ['oficina', responses[0]],
      ['flota', fleetExpense],
      ['taller', shop],
    ] as const) {
      const purchase = response.body.purchase;
      expect(purchase).toMatchObject({
        expressDestination: ledger,
        estado: 'registrada',
        total: 12000,
      });
      expect(purchase).not.toHaveProperty('confirmedAt');
      expect(await CashMovement.count({ where: { referencia: purchase.codigo } })).toBe(1);
      const movement = await CashMovement.findByPk(purchase.cashMovementId);
      expect(movement?.ledger).toBe(ledger);
      expect(movement?.afterClosureId).toBeNull();
      const selected = await get(owner, '/purchases').query({ registro: ledger });
      expect(selected.status, JSON.stringify(selected.body)).toBe(200);
      expect(selected.body.items).toEqual([expect.objectContaining({ id: purchase.id })]);
    }
    const finance = await get(admin, '/finance/movements');
    expect(finance.status).toBe(200);
    expect(finance.body.items).toEqual([
      expect.objectContaining({ id: shop.body.purchase.cashMovementId }),
    ]);
  });

  it('restringe historial, comprobantes y confirmación según el usuario', async () => {
    const purchaseResponse = await expense(owner, {
      ...payload('taller'),
      proveedorNombre: 'Insumos del taller',
      folio: '31240',
      tipoDocumento: 'recibo',
    }).attach(
      'comprobante',
      Buffer.from('%PDF-1.4\n% Recibo de prueba\n'),
      { filename: 'recibo.pdf', contentType: 'application/pdf' },
    );
    expect(purchaseResponse.status, JSON.stringify(purchaseResponse.body)).toBe(201);
    const purchase = purchaseResponse.body.purchase;
    expect(purchase).toMatchObject({
      supplier: { nombre: 'Insumos del taller' },
      folio: '31240',
      tipoDocumento: 'recibo',
    });
    const otherPurchase = await expense(other, { ...payload('taller'), concepto: 'Otro registro' });
    expect(otherPurchase.status).toBe(201);
    const path = `/purchases/${purchase.id}`;
    expect((await get(other, path)).status).toBe(404);
    expect((await get(other, `${path}/receipt`)).status).toBe(404);
    expect((await get(owner, `${path}/receipt`)).status).toBe(200);
    expect((await get(owner, '/purchases/creators')).status).toBe(403);
    const own = await get(other, '/purchases').query({ creadoPor: owner.id });
    expect(own.body.items).toEqual([
      expect.objectContaining({ id: otherPurchase.body.purchase.id }),
    ]);

    const creators = await get(admin, '/purchases/creators');
    expect(creators.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: owner.id }),
        expect.objectContaining({ id: other.id }),
      ]),
    );
    const filtered = await get(admin, '/purchases').query({
      creadoPor: owner.id,
      search: purchase.codigo,
    });
    expect(filtered.body.items).toEqual([
      expect.objectContaining({ id: purchase.id, confirmedAt: null }),
    ]);
    expect((await patch(owner, `${path}/confirm`)).status).toBe(403);
    const confirmed = await patch(admin, `${path}/confirm`);
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
    expect(confirmed.body.purchase).toMatchObject({
      confirmedBy: admin.id,
      cashMovementId: purchase.cashMovementId,
    });
    expect(confirmed.body.purchase.confirmedAt).toBeTruthy();
    const repeat = await patch(admin, `${path}/confirm`);
    expect(repeat.body.purchase.confirmedAt).toBe(confirmed.body.purchase.confirmedAt);
    expect(await CashMovement.count({ where: { referencia: purchase.codigo } })).toBe(1);
    const ownerDetail = (await get(owner, path)).body.purchase;
    expect(ownerDetail).not.toHaveProperty('confirmedAt');
    expect(ownerDetail).not.toHaveProperty('confirmedBy');
  });

  it('completa un gasto de Taller y sincroniza el cobro explícito con su OT y COT', async () => {
    const registered = await expense(owner, payload('taller'));
    expect(registered.status).toBe(201);
    const purchase = registered.body.purchase;
    const orderId = await newWorkOrder(owner);
    const path = `/purchases/${purchase.id}/complete`;
    const complete = (session: Session) =>
      patch(session, path).field(
        'payload',
        JSON.stringify({
          detalle: 'Instalación registrada',
          workOrderId: orderId,
          ventaUnitario: 15000,
        }),
      );
    expect((await complete(other)).status).toBe(404);
    const completed = await complete(owner);
    expect(completed.status, JSON.stringify(completed.body)).toBe(200);
    expect(completed.body.purchase).toMatchObject({
      workOrderId: orderId,
      cashMovementId: purchase.cashMovementId,
      observaciones: 'Instalación registrada',
    });
    expect(completed.body.purchase.expressCompletedAt).toBeTruthy();
    expect((await complete(owner)).status).toBe(200);
    expect(await CashMovement.count({ where: { referencia: purchase.codigo } })).toBe(1);
    const order = (await get(owner, `/work-orders/${orderId}`)).body.workOrder;
    expect(order.items).toEqual([expect.objectContaining({ descripcion: 'Compra de taller' })]);
    const quote = await Quotation.findOne({ where: { workOrderId: orderId } });
    expect(quote).toBeTruthy();
    const quotation = await get(admin, `/quotations/${quote!.id}`);
    expect(quotation.status, JSON.stringify(quotation.body)).toBe(200);
    expect(quotation.body.quotation.items).toEqual([
      expect.objectContaining({ descripcion: 'Compra de taller' }),
    ]);
  });
});
