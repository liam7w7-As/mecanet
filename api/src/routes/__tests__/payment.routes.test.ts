import { Op } from 'sequelize';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { Client } from '../../models/Client.js';
import { Payment } from '../../models/Payment.js';
import { Quotation } from '../../models/Quotation.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { hashPassword } from '../../utils/password.js';

const TEST_PASSWORD = 'Desarrollador2026!';
const TEST_EMAIL_PREFIX = 'phase53-';
const TEST_YEAR = new Date().getFullYear();
const TEST_COT_PREFIX = `COT-${TEST_YEAR}-53`;

interface LoginCookies {
  accessToken: string;
  csrfToken: string;
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

const createQuotationFixture = async (
  suffix: string,
  clientId: number,
  total: number,
): Promise<Quotation> => {
  return Quotation.create({
    codigo: `${TEST_COT_PREFIX}${suffix}`,
    clientId,
    estadoPago: 'por_pagar',
    subtotal: total,
    total,
    pagado: 0,
    notas: `Cotización pagos fase 53 ${suffix}`,
  });
};

const deleteTestQuotations = async (): Promise<void> => {
  const quotations = await Quotation.findAll({
    where: { codigo: { [Op.like]: `${TEST_COT_PREFIX}%` } },
    paranoid: false,
  });
  const quotationIds = quotations.map((quotation) => quotation.id);

  if (quotationIds.length > 0) {
    await Payment.destroy({ where: { quotationId: quotationIds } });
    await Quotation.destroy({ where: { id: quotationIds }, force: true });
  }
};

describe('Payment Routes (E2E)', () => {
  let devUserId: number;
  let bodegueroUserId: number;
  let clientId: number;

  beforeAll(async () => {
    await sequelize.authenticate();
    await deleteTestQuotations();

    const existingClients = await Client.findAll({
      where: { email: { [Op.like]: `${TEST_EMAIL_PREFIX}%` } },
      paranoid: false,
    });
    await Client.destroy({
      where: { id: existingClients.map((client) => client.id) },
      force: true,
    });

    const testUsers = await User.findAll({
      where: { email: { [Op.like]: `${TEST_EMAIL_PREFIX}%` } },
      paranoid: false,
    });
    await RefreshToken.destroy({
      where: { userId: testUsers.map((user) => user.id) },
      force: true,
    });
    await User.destroy({
      where: { id: testUsers.map((user) => user.id) },
      force: true,
    });

    const passwordHash = await hashPassword(TEST_PASSWORD);
    const [devUser, bodegueroRole] = await Promise.all([
      User.findOne({ where: { email: 'dev@unithor.local' } }),
      Role.findOne({ where: { nombre: 'bodeguero' } }),
    ]);

    if (!devUser || !bodegueroRole) {
      throw new Error('No se encontraron usuarios o roles base para payment.routes.test');
    }

    await devUser.update({ passwordHash, activo: true });
    devUserId = devUser.id;

    const [bodegueroUser, client] = await Promise.all([
      User.create({
        nombre: 'Bodeguero Fase 53',
        email: `${TEST_EMAIL_PREFIX}bodeguero@unithor.local`,
        passwordHash,
        roleId: bodegueroRole.id,
        activo: true,
      }),
      Client.create({
        rut: '76530001',
        nombre: 'Cliente Pagos Fase 53',
        tipo: 'cliente',
        email: `${TEST_EMAIL_PREFIX}client@unithor.local`,
        telefono: '+56 9 5300 0001',
      }),
    ]);

    bodegueroUserId = bodegueroUser.id;
    clientId = client.id;
  });

  afterAll(async () => {
    await deleteTestQuotations();

    const testClients = await Client.findAll({
      where: { email: { [Op.like]: `${TEST_EMAIL_PREFIX}%` } },
      paranoid: false,
    });
    await Client.destroy({
      where: { id: testClients.map((client) => client.id) },
      force: true,
    });

    await RefreshToken.destroy({
      where: { userId: [devUserId, bodegueroUserId] },
      force: true,
    });
    await User.destroy({
      where: { id: [bodegueroUserId] },
      force: true,
    });
  });

  it('requiere autenticación y permiso comercial:create', async () => {
    const noSessionResponse = await request(app).get('/api/payments');
    expect(noSessionResponse.status).toBe(401);

    const bodegueroCookies = await loginAs(`${TEST_EMAIL_PREFIX}bodeguero@unithor.local`);
    const forbiddenResponse = await request(app)
      .post('/api/payments')
      .set('Cookie', authCookie(bodegueroCookies))
      .set('X-CSRF-Token', bodegueroCookies.csrfToken)
      .send({
        quotationId: 1,
        monto: 1000,
        metodo: 'efectivo',
      });

    expect(forbiddenResponse.status).toBe(403);
  });

  it('registra abonos parciales y completa automáticamente la cotización', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const quotation = await createQuotationFixture('01', clientId, 100000);

    const firstResponse = await request(app)
      .post('/api/payments')
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({
        quotationId: quotation.id,
        monto: 40000,
        metodo: 'efectivo',
      });

    expect(firstResponse.status).toBe(201);
    expect(firstResponse.body.payment).toMatchObject({
      quotationId: quotation.id,
      monto: 40000,
      metodo: 'efectivo',
      createdBy: devUserId,
    });
    expect(firstResponse.body.quotation).toMatchObject({
      id: quotation.id,
      total: 100000,
      pagado: 40000,
      saldoPendiente: 60000,
      estadoPago: 'parcial',
    });

    const secondResponse = await request(app)
      .post('/api/payments')
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({
        quotationId: quotation.id,
        monto: 60000,
        metodo: 'tarjeta_debito',
      });

    expect(secondResponse.status).toBe(201);
    expect(secondResponse.body.quotation).toMatchObject({
      id: quotation.id,
      total: 100000,
      pagado: 100000,
      saldoPendiente: 0,
      estadoPago: 'total',
    });

    const reloadedQuotation = await Quotation.findByPk(quotation.id);
    expect(Number(reloadedQuotation?.pagado)).toBe(100000);
    expect(reloadedQuotation?.estadoPago).toBe('total');

    const historyResponse = await request(app)
      .get(`/api/quotations/${quotation.id}/payments`)
      .set('Cookie', authCookie(devCookies));

    expect(historyResponse.status).toBe(200);
    expect(historyResponse.body).toMatchObject({
      quotationId: quotation.id,
      total: 100000,
      pagado: 100000,
      saldoPendiente: 0,
      estadoPago: 'total',
    });
    expect(historyResponse.body.payments).toHaveLength(2);
  });

  it('rechaza abonar sobre una cotización ya pagada', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const quotation = await createQuotationFixture('02', clientId, 50000);
    await quotation.update({ pagado: 50000, estadoPago: 'total' });

    const response = await request(app)
      .post('/api/payments')
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({
        quotationId: quotation.id,
        monto: 1000,
        metodo: 'efectivo',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe(
      'La cotización ya se encuentra pagada en su totalidad',
    );
  });

  it('rechaza pagos superiores al saldo pendiente', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const quotation = await createQuotationFixture('03', clientId, 50000);

    const response = await request(app)
      .post('/api/payments')
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({
        quotationId: quotation.id,
        monto: 50001,
        metodo: 'cheque',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain(
      'El abono supera el saldo pendiente disponible. Saldo restante: 50000',
    );

    const paymentCount = await Payment.count({ where: { quotationId: quotation.id } });
    expect(paymentCount).toBe(0);
  });

  it('anula un pago y recalcula saldo y estado de la cotización', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const quotation = await createQuotationFixture('04', clientId, 80000);

    const createResponse = await request(app)
      .post('/api/payments')
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({
        quotationId: quotation.id,
        monto: 30000,
        metodo: 'efectivo',
      });
    expect(createResponse.status).toBe(201);

    const paymentId = createResponse.body.payment.id as number;
    const deleteResponse = await request(app)
      .delete(`/api/payments/${paymentId}`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken);

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body).toMatchObject({
      message: 'Pago anulado correctamente',
      quotation: {
        id: quotation.id,
        total: 80000,
        pagado: 0,
        saldoPendiente: 80000,
        estadoPago: 'por_pagar',
      },
    });

    const deletedPayment = await Payment.findByPk(paymentId);
    expect(deletedPayment).toBeNull();

    const reloadedQuotation = await Quotation.findByPk(quotation.id);
    expect(Number(reloadedQuotation?.pagado)).toBe(0);
    expect(reloadedQuotation?.estadoPago).toBe('por_pagar');
  });

  it('mantiene consistencia ante pagos concurrentes', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const quotation = await createQuotationFixture('05', clientId, 100);

    const [firstResponse, secondResponse] = await Promise.all([
      request(app)
        .post('/api/payments')
        .set('Cookie', authCookie(devCookies))
        .set('X-CSRF-Token', devCookies.csrfToken)
        .send({
          quotationId: quotation.id,
          monto: 80,
          metodo: 'efectivo',
        }),
      request(app)
        .post('/api/payments')
        .set('Cookie', authCookie(devCookies))
        .set('X-CSRF-Token', devCookies.csrfToken)
        .send({
          quotationId: quotation.id,
          monto: 80,
          metodo: 'tarjeta_credito',
        }),
    ]);

    const statuses = [firstResponse.status, secondResponse.status].sort();
    expect(statuses).toEqual([201, 400]);

    const reloadedQuotation = await Quotation.findByPk(quotation.id);
    expect(Number(reloadedQuotation?.pagado)).toBe(80);
    expect(reloadedQuotation?.estadoPago).toBe('parcial');

    const payments = await Payment.findAll({ where: { quotationId: quotation.id } });
    expect(payments).toHaveLength(1);
    expect(Number(payments[0]?.monto)).toBe(80);
  });

  it('mantiene transferencias pendientes hasta que finanzas las aprueba o rechaza', async () => {
    const devCookies = await loginAs('dev@unithor.local');
    const bodegueroCookies = await loginAs(`${TEST_EMAIL_PREFIX}bodeguero@unithor.local`);
    const quotation = await createQuotationFixture('06', clientId, 100000);

    const createResponse = await request(app)
      .post('/api/payments')
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({
        quotationId: quotation.id,
        monto: 40000,
        metodo: 'transferencia',
        referencia: 'TRX-53006',
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.payment).toMatchObject({
      estado: 'por_verificar',
      referencia: 'TRX-53006',
    });
    expect(createResponse.body.quotation).toMatchObject({
      pagado: 0,
      saldoPendiente: 100000,
      estadoPago: 'por_verificar',
    });

    const forbiddenResponse = await request(app)
      .patch(`/api/payments/${createResponse.body.payment.id as number}/verify`)
      .set('Cookie', authCookie(bodegueroCookies))
      .set('X-CSRF-Token', bodegueroCookies.csrfToken)
      .send({ decision: 'aprobar' });
    expect(forbiddenResponse.status).toBe(403);

    const approveResponse = await request(app)
      .patch(`/api/payments/${createResponse.body.payment.id as number}/verify`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({ decision: 'aprobar', comentario: 'Abono confirmado en cartola' });

    expect(approveResponse.status).toBe(200);
    expect(approveResponse.body.payment).toMatchObject({
      estado: 'confirmado',
      reviewNote: 'Abono confirmado en cartola',
    });
    expect(approveResponse.body.quotation).toMatchObject({
      pagado: 40000,
      saldoPendiente: 60000,
      estadoPago: 'parcial',
    });

    const rejectedCreateResponse = await request(app)
      .post('/api/payments')
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({
        quotationId: quotation.id,
        monto: 20000,
        metodo: 'transferencia',
      });
    const rejectResponse = await request(app)
      .patch(`/api/payments/${rejectedCreateResponse.body.payment.id as number}/verify`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({ decision: 'rechazar', comentario: 'No aparece en cartola' });

    expect(rejectResponse.status).toBe(200);
    expect(rejectResponse.body.payment.estado).toBe('rechazado');
    expect(rejectResponse.body.quotation).toMatchObject({
      pagado: 40000,
      estadoPago: 'parcial',
    });
  });
});
