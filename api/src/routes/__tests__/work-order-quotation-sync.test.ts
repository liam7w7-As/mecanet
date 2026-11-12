import { Op } from 'sequelize';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getQuotationGrossTotal } from '@unithor/shared';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { CatalogItem } from '../../models/CatalogItem.js';
import { Client } from '../../models/Client.js';
import { Payment } from '../../models/Payment.js';
import { Quotation } from '../../models/Quotation.js';
import { QuotationItem } from '../../models/QuotationItem.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { Vehicle } from '../../models/Vehicle.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { WorkOrderItem } from '../../models/WorkOrderItem.js';
import { hashPassword } from '../../utils/password.js';

const TEST_PASSWORD = 'Desarrollador2026!';
const TEST_EMAIL_PREFIX = 'syncot-';
const TEST_CODE_PREFIX = 'SYNCOT';
const TEST_YEAR = new Date().getFullYear();

interface LoginCookies {
  accessToken: string;
  csrfToken: string;
}

const extractCookies = (res: request.Response): Record<string, string> => {
  const rawHeader = res.headers['set-cookie'];
  const rawCookies = Array.isArray(rawHeader)
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

    cookies[pair.slice(0, separatorIndex).trim()] = pair
      .slice(separatorIndex + 1)
      .trim();
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

const cleanupData = async (): Promise<void> => {
  const workOrders = await WorkOrder.findAll({
    where: {
      [Op.or]: [
        { codigo: { [Op.like]: `${TEST_CODE_PREFIX}%` } },
        { codigo: { [Op.like]: `OT-${TEST_YEAR}-%` } },
      ],
    },
    paranoid: false,
  });
  const workOrderIds = workOrders.map((workOrder) => workOrder.id);

  if (workOrderIds.length > 0) {
    const quotations = await Quotation.findAll({
      where: { workOrderId: workOrderIds },
      paranoid: false,
    });
    const quotationIds = quotations.map((quotation) => quotation.id);
    if (quotationIds.length > 0) {
      await Payment.destroy({ where: { quotationId: quotationIds } });
      await QuotationItem.destroy({ where: { quotationId: quotationIds } });
      await Quotation.destroy({ where: { id: quotationIds }, force: true });
    }
    await WorkOrderItem.destroy({ where: { workOrderId: workOrderIds } });
    await WorkOrder.destroy({ where: { id: workOrderIds }, force: true });
  }

  const clients = await Client.findAll({
    where: { email: { [Op.like]: `${TEST_EMAIL_PREFIX}%` } },
    paranoid: false,
  });
  if (clients.length > 0) {
    const clientIds = clients.map((client) => client.id);
    const vehicles = await Vehicle.findAll({
      where: { clientId: clientIds },
      paranoid: false,
    });
    if (vehicles.length > 0) {
      await Vehicle.destroy({ where: { id: vehicles.map((vehicle) => vehicle.id) }, force: true });
    }
    await Client.destroy({ where: { id: clientIds }, force: true });
  }

  const users = await User.findAll({
    where: { email: { [Op.like]: `${TEST_EMAIL_PREFIX}%` } },
    paranoid: false,
  });
  if (users.length > 0) {
    const userIds = users.map((user) => user.id);
    await RefreshToken.destroy({ where: { userId: userIds }, force: true });
    await User.destroy({ where: { id: userIds }, force: true });
  }
};

describe('Sincronización OT → COT espejo (E2E)', () => {
  let mecanicoUserId: number;
  let clientId: number;
  let vehicleId: number;
  let partId: number;
  let workOrderId: number;

  beforeAll(async () => {
    await sequelize.authenticate();
    await cleanupData();

    const passwordHash = await hashPassword(TEST_PASSWORD);
    const [devUser, vendedorRole, mecanicoRole] = await Promise.all([
      User.findOne({ where: { email: 'dev@unithor.local' } }),
      Role.findOne({ where: { nombre: 'vendedor' } }),
      Role.findOne({ where: { nombre: 'mecanico' } }),
    ]);

    if (!devUser || !vendedorRole || !mecanicoRole) {
      throw new Error('No se encontraron usuarios o roles base para la prueba de sincronización');
    }

    await devUser.update({ passwordHash, activo: true });

    const [, , mecanicoUser, client] = await Promise.all([
      User.create({
        nombre: 'Vendedor Sync OT',
        email: `${TEST_EMAIL_PREFIX}vendedor@unithor.local`,
        passwordHash,
        roleId: vendedorRole.id,
        activo: true,
      }),
      User.create({
        nombre: 'Comercial Sync OT',
        email: `${TEST_EMAIL_PREFIX}comercial@unithor.local`,
        passwordHash,
        roleId: vendedorRole.id,
        activo: true,
      }),
      User.create({
        nombre: 'Mecánico Sync OT',
        email: `${TEST_EMAIL_PREFIX}mecanico@unithor.local`,
        passwordHash,
        roleId: mecanicoRole.id,
        activo: true,
      }),
      Client.create({
        rut: '76990001',
        nombre: 'Cliente Sync OT',
        tipo: 'cliente',
        email: `${TEST_EMAIL_PREFIX}client@unithor.local`,
        telefono: '+56 9 7700 0001',
      }),
    ]);

    mecanicoUserId = mecanicoUser.id;
    clientId = client.id;

    const vehicle = await Vehicle.create({
      patente: 'SYNC01',
      marca: 'Toyota',
      modelo: 'Corolla',
      kilometraje: 5000,
      clientId,
    });
    vehicleId = vehicle.id;

    const part = await CatalogItem.create({
      tipo: 'parte',
      codigo: `${TEST_CODE_PREFIX}-PART`,
      nombre: 'Repuesto sincronización',
      descripcion: null,
      unidadMedida: 'unidad',
      precio: 15000,
      stock: 10,
      stockMinimo: 1,
    });
    partId = part.id;

    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);
    const createResponse = await request(app)
      .post('/api/work-orders')
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        clientId,
        vehicleId,
        descripcion: 'OT para sincronización',
        items: [
          {
            catalogItemId: partId,
            descripcion: 'Repuesto sincronización',
            tipoLinea: 'parte',
            unidadMedida: 'unidad',
            cantidad: 2,
            precioUnitario: 15000,
          },
          {
            catalogItemId: null,
            descripcion: 'Servicio de alineación',
            tipoLinea: 'estandar',
            unidadMedida: 'servicio',
            cantidad: 1,
            precioUnitario: 30000,
          },
        ],
      });

    expect(createResponse.status, JSON.stringify(createResponse.body)).toBe(201);
    workOrderId = createResponse.body.workOrder.id;
    // El vendedor conserva la autoría; la asignación corresponde al supervisor.
    const supervisor = await loginAs('dev@unithor.local');
    const assigned = await request(app).patch(`/api/work-orders/${workOrderId}/assignment`)
      .set('Cookie', authCookie(supervisor)).set('X-CSRF-Token', supervisor.csrfToken)
      .send({ mechanicId: mecanicoUserId });
    expect(assigned.status, JSON.stringify(assigned.body)).toBe(200);
  });

  afterAll(async () => {
    await cleanupData();
  });

  it('impide al vendedor asignar mecánicos al crear una OT', async () => {
    const seller = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);
    for (const assignment of [{ assignedMechanicId: mecanicoUserId }, { items: [{ descripcion: 'Servicio asignado', assignedUserId: mecanicoUserId }] }]) {
      const response = await request(app).post('/api/work-orders')
        .set('Cookie', authCookie(seller)).set('X-CSRF-Token', seller.csrfToken)
        .send({ clientId, vehicleId, ...assignment });
      expect(response.status, JSON.stringify(response.body)).toBe(403);
    }
  });

  it('crea la OT con tipo de línea y unidad, y refleja lo mismo en la cotización espejo', async () => {
    const workOrder = await WorkOrder.findByPk(workOrderId, {
      include: [{ model: WorkOrderItem, as: 'items' }],
    });
    const items = workOrder?.items ?? [];
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ tipoLinea: 'parte', unidadMedida: 'unidad' });
    expect(Number(items[0].cantidad)).toBe(2);
    expect(items[1]).toMatchObject({ tipoLinea: 'estandar', unidadMedida: 'servicio' });
    expect(Number(items[1].cantidad)).toBe(1);
    expect(workOrder?.assignedMechanicId).toBe(mecanicoUserId);

    const quotation = await Quotation.findOne({
      where: { workOrderId },
      include: [{ model: QuotationItem }],
    });
    expect(quotation).not.toBeNull();
    expect(Number(quotation?.total)).toBe(60000);
    expect(quotation?.estadoPago).toBe('por_pagar');
    const quotationItems = [...(quotation?.items ?? [])].sort((left, right) => left.id - right.id);
    expect(quotationItems).toHaveLength(2);
    expect(quotationItems[0]).toMatchObject({ tipoLinea: 'parte', unidadMedida: 'unidad' });
    expect(quotationItems[1]).toMatchObject({ tipoLinea: 'estandar', unidadMedida: 'servicio' });
  });

  it('rechaza cantidades decimales al actualizar los trabajos de la OT', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);
    const response = await request(app)
      .patch(`/api/work-orders/${workOrderId}`)
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        items: [
          {
            descripcion: 'Servicio de alineación',
            cantidad: 1.5,
            precioUnitario: 30000,
          },
        ],
      });

    expect(response.status).toBe(400);
  });

  it('sincroniza la cotización espejo al cambiar los trabajos de la OT', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);
    const response = await request(app)
      .patch(`/api/work-orders/${workOrderId}`)
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        items: [
          {
            catalogItemId: partId,
            descripcion: 'Repuesto sincronización',
            tipoLinea: 'parte',
            unidadMedida: 'juego',
            cantidad: 3,
            precioUnitario: 15000,
          },
        ],
      });

    expect(response.status).toBe(200);

    const quotation = await Quotation.findOne({
      where: { workOrderId },
      include: [{ model: QuotationItem }],
    });
    const quotationItems = quotation?.items ?? [];
    expect(quotationItems).toHaveLength(1);
    expect(quotationItems[0]).toMatchObject({
      descripcion: 'Repuesto sincronización',
      tipoLinea: 'parte',
      unidadMedida: 'juego',
    });
    expect(Number(quotationItems[0].cantidad)).toBe(3);
    expect(Number(quotation?.subtotal)).toBe(45000);
    expect(Number(quotation?.total)).toBe(45000);
  });

  it('sincroniza los trabajos de la OT al editar la cotización vinculada', async () => {
    const quotation = await Quotation.findOne({ where: { workOrderId } });
    expect(quotation).not.toBeNull();

    const comercialCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);
    const response = await request(app)
      .patch(`/api/quotations/${quotation?.id}`)
      .set('Cookie', authCookie(comercialCookies))
      .set('X-CSRF-Token', comercialCookies.csrfToken)
      .send({
        notas: 'Precio ajustado por el asesor',
        items: [
          {
            catalogItemId: null,
            descripcion: 'Concepto agregado por el asesor',
            tipoLinea: 'especifico',
            unidadMedida: 'servicio',
            cantidad: 1,
            precioUnitario: 50000,
          },
        ],
      });

    expect(response.status).toBe(200);

    const workOrderItems = await WorkOrderItem.findAll({ where: { workOrderId } });
    expect(workOrderItems).toHaveLength(1);
    expect(workOrderItems[0]).toMatchObject({
      descripcion: 'Concepto agregado por el asesor',
      tipoLinea: 'especifico',
      unidadMedida: 'servicio',
    });
    expect(Number(workOrderItems[0].cantidad)).toBe(1);

    const updatedQuotation = await Quotation.findByPk(quotation?.id ?? 0, {
      include: [{ model: QuotationItem }],
    });
    const updatedItems = updatedQuotation?.items ?? [];
    expect(updatedItems).toHaveLength(1);
    expect(updatedItems[0]).toMatchObject({
      descripcion: 'Concepto agregado por el asesor',
      tipoLinea: 'especifico',
      unidadMedida: 'servicio',
    });
    expect(Number(updatedQuotation?.total)).toBe(50000);
  });

  it('bloquea cambios de trabajos si la cotización espejo ya está pagada', async () => {
    const quotation = await Quotation.findOne({ where: { workOrderId } });
    await quotation?.update({ estadoPago: 'total', pagado: Number(quotation?.total) });

    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);
    const response = await request(app)
      .patch(`/api/work-orders/${workOrderId}`)
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        items: [
          {
            descripcion: 'Trabajo posterior al pago',
            cantidad: 1,
            precioUnitario: 10000,
          },
        ],
      });

    expect(response.status).toBe(400);

    const workOrderItems = await WorkOrderItem.findAll({ where: { workOrderId } });
    expect(workOrderItems).toHaveLength(1);
    expect(workOrderItems[0].descripcion).toBe('Concepto agregado por el asesor');
  });

  it('mantiene el estado de pago parcial al recalcular la cotización espejo', async () => {
    const quotation = await Quotation.findOne({ where: { workOrderId } });
    await quotation?.update({ estadoPago: 'parcial', pagado: 20000 });

    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);
    const response = await request(app)
      .patch(`/api/work-orders/${workOrderId}`)
      .set('Cookie', authCookie(vendedorCookies))
      .set('X-CSRF-Token', vendedorCookies.csrfToken)
      .send({
        items: [
          {
            descripcion: 'Repuesto sincronización',
            tipoLinea: 'parte',
            unidadMedida: 'unidad',
            cantidad: 4,
            precioUnitario: 15000,
          },
        ],
      });

    expect(response.status).toBe(200);
    const updated = await Quotation.findByPk(quotation?.id ?? 0);
    expect(updated?.estadoPago).toBe('parcial');
    expect(Number(updated?.total)).toBe(60000);
  });

  it('conserva descuentos comerciales al cambiar cantidades desde taller', async () => {
    const quotation = await Quotation.findOne({ where: { workOrderId } });
    await quotation!.update({ descuentoTipo: 'fijo', descuentoValor: 1000 });
    await QuotationItem.update({ descuentoTipo: 'porcentaje', descuentoValor: 10 }, { where: { quotationId: quotation!.id } });
    const cookies = await loginAs('dev@unithor.local');
    const response = await request(app).patch(`/api/work-orders/${workOrderId}`)
      .set('Cookie', authCookie(cookies)).set('X-CSRF-Token', cookies.csrfToken)
      .send({ items: [{ descripcion: 'Repuesto sincronización', tipoLinea: 'parte', unidadMedida: 'unidad', cantidad: 5, precioUnitario: 15000 }] });
    expect(response.status).toBe(200);
    await quotation!.reload();
    expect(Number(quotation!.subtotal)).toBe(75000);
    expect(Number(quotation!.total)).toBe(66500);
    const item = await QuotationItem.findOne({ where: { quotationId: quotation!.id } });
    expect(Number(item!.descuentoValor)).toBe(10);
    expect(Number(item!.subtotal)).toBe(67500);
  });

  it('mantiene el flujo Nueva OT → COT → abonos → avance sin duplicar líneas ni alterar descuentos o pagos', async () => {
    const cookies = await loginAs('dev@unithor.local');
    const create = await request(app).post('/api/work-orders')
      .set('Cookie', authCookie(cookies)).set('X-CSRF-Token', cookies.csrfToken)
      .send({
        clientId, contactClientId: clientId, billingClientId: clientId, vehicleId,
        descripcion: 'Recorrido completo de recepción a cobro',
        assignedMechanicId: mecanicoUserId,
        items: [{ descripcion: 'Servicio de revisión integral', tipoLinea: 'especifico',
          unidadMedida: 'servicio', cantidad: 1, precioUnitario: 10000, horasHombreEstimadas: 2 }],
      });
    expect(create.status, JSON.stringify(create.body)).toBe(201);
    const id = create.body.workOrder.id as number;
    const itemId = create.body.workOrder.items[0].id as number;
    expect(create.body.workOrder.estado).toBe('en_progreso');
    expect(await Quotation.count({ where: { workOrderId: id } })).toBe(1);
    const mirror = await Quotation.findOne({ where: { workOrderId: id } });
    const originalLine = await QuotationItem.findOne({ where: { quotationId: mirror!.id } });
    expect(originalLine!.workOrderItemId).toBe(itemId);

    const edit = await request(app).patch(`/api/quotations/${mirror!.id}`)
      .set('Cookie', authCookie(cookies)).set('X-CSRF-Token', cookies.csrfToken)
      .send({
        descuentoTipo: 'fijo', descuentoValor: 1000, notas: 'Condiciones comerciales propias',
        items: [{ id: originalLine!.id, descripcion: 'Servicio de revisión integral', tipoLinea: 'especifico',
          unidadMedida: 'servicio', cantidad: 2, precioUnitario: 10000,
          descuentoTipo: 'porcentaje', descuentoValor: 10 }],
      });
    expect(edit.status, JSON.stringify(edit.body)).toBe(200);
    expect(edit.body.quotation.total).toBe(17000);
    const item = await WorkOrderItem.findByPk(itemId);
    expect(Number(item!.cantidad)).toBe(2);
    expect(Number(item!.horasHombreEstimadas)).toBe(2);
    expect(await WorkOrderItem.count({ where: { workOrderId: id } })).toBe(1);

    const pay = await request(app).post('/api/payments')
      .set('Cookie', authCookie(cookies)).set('X-CSRF-Token', cookies.csrfToken)
      .send({ quotationId: mirror!.id, monto: 5000, metodo: 'efectivo' });
    expect(pay.status, JSON.stringify(pay.body)).toBe(201);
    const afterPay = await request(app).get(`/api/work-orders/${id}`).set('Cookie', authCookie(cookies));
    expect(afterPay.body.workOrder.quotation).toMatchObject({
      total: getQuotationGrossTotal(17000),
      pagado: 5000,
      saldoPendiente: getQuotationGrossTotal(17000) - 5000,
      estadoPago: 'parcial',
    });

    const editOrder = await request(app).patch(`/api/work-orders/${id}`)
      .set('Cookie', authCookie(cookies)).set('X-CSRF-Token', cookies.csrfToken)
      .send({ items: [{ id: itemId, descripcion: 'Servicio de revisión integral', tipoLinea: 'especifico',
        unidadMedida: 'servicio', cantidad: 3, precioUnitario: 10000 }] });
    expect(editOrder.status, JSON.stringify(editOrder.body)).toBe(200);
    expect(editOrder.body.workOrder.quotation).toMatchObject({
      total: getQuotationGrossTotal(26000),
      pagado: 5000,
      saldoPendiente: getQuotationGrossTotal(26000) - 5000,
      estadoPago: 'parcial',
    });
    const balance = await request(app).get(`/api/quotations/${mirror!.id}/payments`).set('Cookie', authCookie(cookies));
    expect(balance.body).toMatchObject({
      total: getQuotationGrossTotal(26000),
      pagado: 5000,
      saldoPendiente: getQuotationGrossTotal(26000) - 5000,
    });
    expect(balance.body.payments).toHaveLength(1);

    const finalPay = await request(app).post('/api/payments')
      .set('Cookie', authCookie(cookies)).set('X-CSRF-Token', cookies.csrfToken)
      .send({ quotationId: mirror!.id, monto: getQuotationGrossTotal(26000) - 5000, metodo: 'efectivo' });
    expect(finalPay.status, JSON.stringify(finalPay.body)).toBe(201);
    const advance = await request(app).patch(`/api/work-orders/${id}/execution`)
      .set('Cookie', authCookie(cookies)).set('X-CSRF-Token', cookies.csrfToken)
      .send({ items: [{ id: itemId, estadoOperativo: 'completado', notasOperativas: 'Trabajo terminado' }] });
    expect(advance.status, JSON.stringify(advance.body)).toBe(200);
    expect(advance.body.workOrder.quotation).toMatchObject({
      total: getQuotationGrossTotal(26000),
      pagado: getQuotationGrossTotal(26000),
      saldoPendiente: 0,
      estadoPago: 'total',
    });
    await originalLine!.reload();
    expect(originalLine).toMatchObject({ workOrderItemId: itemId, estadoOperativo: 'completado', descuentoTipo: 'porcentaje' });
    expect(Number(originalLine!.descuentoValor)).toBe(10);
    expect(Number((await item!.reload()).horasHombreEstimadas)).toBe(2);
    expect((await mirror!.reload()).notas).toBe('Condiciones comerciales propias');
    expect(await Payment.count({ where: { quotationId: mirror!.id } })).toBe(2);
    expect(await QuotationItem.count({ where: { quotationId: mirror!.id } })).toBe(1);
    expect((await Vehicle.findByPk(vehicleId))!.clientId).toBe(clientId);
  });

  it('refleja una corrección del vehículo de recepción en la COT sin modificar sus condiciones ni abonos', async () => {
    const cookies = await loginAs('dev@unithor.local');
    const replacement = await Vehicle.create({ patente: 'SYNC02', marca: 'Toyota', modelo: 'Yaris', clientId });
    const create = await request(app).post('/api/work-orders')
      .set('Cookie', authCookie(cookies)).set('X-CSRF-Token', cookies.csrfToken)
      .send({ clientId, vehicleId, items: [{ descripcion: 'Diagnóstico', cantidad: 1, precioUnitario: 10000 }] });
    expect(create.status, JSON.stringify(create.body)).toBe(201);
    const id = create.body.workOrder.id as number;
    const mirror = await Quotation.findOne({ where: { workOrderId: id } });
    await mirror!.update({ notas: 'Conservar condiciones comerciales' });
    const payment = await request(app).post('/api/payments')
      .set('Cookie', authCookie(cookies)).set('X-CSRF-Token', cookies.csrfToken)
      .send({ quotationId: mirror!.id, monto: 5000, metodo: 'efectivo' });
    expect(payment.status, JSON.stringify(payment.body)).toBe(201);
    const update = await request(app).patch(`/api/work-orders/${id}`)
      .set('Cookie', authCookie(cookies)).set('X-CSRF-Token', cookies.csrfToken)
      .send({ vehicleId: replacement.id });
    expect(update.status, JSON.stringify(update.body)).toBe(200);
    const commercial = await request(app).get(`/api/quotations/${mirror!.id}`).set('Cookie', authCookie(cookies));
    expect(commercial.body.quotation.vehicle).toMatchObject({ id: replacement.id, patente: 'SYNC02' });
    expect(commercial.body.quotation).toMatchObject({ vehicleId: replacement.id, total: 10000, pagado: 5000, estadoPago: 'parcial', notas: 'Conservar condiciones comerciales' });
    const invalidEdit = await request(app).patch(`/api/work-orders/${id}`)
      .set('Cookie', authCookie(cookies)).set('X-CSRF-Token', cookies.csrfToken)
      .send({ vehicleId, items: [{ descripcion: 'Total inferior al abono', cantidad: 1, precioUnitario: 1000 }] });
    expect(invalidEdit.status).toBe(400);
    expect((await WorkOrder.findByPk(id))!.vehicleId).toBe(replacement.id);
    expect((await mirror!.reload()).vehicleId).toBe(replacement.id);
    expect(Number(mirror!.total)).toBe(10000);
    expect(Number(mirror!.pagado)).toBe(5000);
    expect((await Vehicle.findByPk(vehicleId))!.clientId).toBe(clientId);
  });
});
