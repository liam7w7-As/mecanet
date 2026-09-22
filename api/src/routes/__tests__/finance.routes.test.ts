import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { CashClosure } from '../../models/CashClosure.js';
import { Client } from '../../models/Client.js';
import { Payment } from '../../models/Payment.js';
import { Quotation } from '../../models/Quotation.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { hashPassword } from '../../utils/password.js';

const TEST_PASSWORD = 'Desarrollador2026!';
const BODEGUERO_EMAIL = 'phase861-bodeguero@unithor.local';

const cookiesFrom = (response: request.Response): string[] => {
  const header = response.headers['set-cookie'];
  const values = Array.isArray(header) ? header : typeof header === 'string' ? [header] : [];
  return values.map((cookie) => cookie.split(';')[0]);
};

describe('Finance Routes (E2E)', () => {
  let bodegueroId: number;

  beforeAll(async () => {
    await sequelize.authenticate();
    const existing = await User.findOne({ where: { email: BODEGUERO_EMAIL }, paranoid: false });
    if (existing) {
      await RefreshToken.destroy({ where: { userId: existing.id }, force: true });
      await existing.destroy({ force: true });
    }

    const [role, passwordHash, developer] = await Promise.all([
      Role.findOne({ where: { nombre: 'bodeguero' } }),
      hashPassword(TEST_PASSWORD),
      User.findOne({ where: { email: 'dev@unithor.local' } }),
    ]);
    if (!role || !developer) throw new Error('Faltan roles o usuario desarrollador base');
    await developer.update({ passwordHash, activo: true });
    const bodeguero = await User.create({
      nombre: 'Bodeguero Finanzas 861',
      email: BODEGUERO_EMAIL,
      passwordHash,
      roleId: role.id,
      activo: true,
    });
    bodegueroId = bodeguero.id;
  });

  afterAll(async () => {
    await RefreshToken.destroy({ where: { userId: bodegueroId }, force: true });
    await User.destroy({ where: { id: bodegueroId }, force: true });
  });

  it('requiere autenticación y permiso de lectura de finanzas', async () => {
    expect((await request(app).get('/api/finance/summary')).status).toBe(401);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: BODEGUERO_EMAIL, password: TEST_PASSWORD });
    const response = await request(app)
      .get('/api/finance/summary')
      .set('Cookie', cookiesFrom(login));
    expect(response.status).toBe(403);
  });

  it('retorna el resumen financiero para desarrollador', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'dev@unithor.local', password: TEST_PASSWORD });
    const response = await request(app)
      .get('/api/finance/summary')
      .set('Cookie', cookiesFrom(login));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      metrics: {
        revenueToday: expect.any(Number),
        revenueMonth: expect.any(Number),
        receivableTotal: expect.any(Number),
        receivableCount: expect.any(Number),
        pendingTransferCount: expect.any(Number),
        pendingTransferAmount: expect.any(Number),
      },
      pendingTransfers: expect.any(Array),
      recentPayments: expect.any(Array),
      pendingQuotations: expect.any(Array),
    });
  });

  it('cierra la jornada por método y bloquea movimientos retroactivos', async () => {
    const accountingDate = '2000-01-15';
    await CashClosure.destroy({ where: { fecha: accountingDate } });
    const client = await Client.create({
      rut: '86120001',
      nombre: 'Cliente Arqueo 8612',
      tipo: 'cliente',
      email: 'phase861-cash@unithor.local',
    });
    const quotation = await Quotation.create({
      codigo: 'COT-2000-8612',
      clientId: client.id,
      estadoPago: 'parcial',
      subtotal: 100000,
      total: 100000,
      pagado: 50000,
      notas: 'Prueba de cierre diario',
    });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'dev@unithor.local', password: TEST_PASSWORD });
    const cookies = cookiesFrom(login);
    const csrfToken = cookies.find((cookie) => cookie.startsWith('csrf_token='))?.split('=')[1];

    try {
      await Payment.bulkCreate([
        { quotationId: quotation.id, monto: 20000, metodo: 'efectivo', estado: 'confirmado', fecha: new Date(`${accountingDate}T10:00:00.000Z`), createdBy: null },
        { quotationId: quotation.id, monto: 30000, metodo: 'tarjeta_debito', estado: 'confirmado', fecha: new Date(`${accountingDate}T11:00:00.000Z`), createdBy: null },
        { quotationId: quotation.id, monto: 10000, metodo: 'transferencia', estado: 'por_verificar', fecha: new Date(`${accountingDate}T12:00:00.000Z`), createdBy: null },
      ]);

      const dayResponse = await request(app)
        .get(`/api/finance/day?fecha=${accountingDate}`)
        .set('Cookie', cookies);
      expect(dayResponse.status).toBe(200);
      expect(dayResponse.body).toMatchObject({
        fecha: accountingDate,
        isClosed: false,
        totals: {
          confirmedTotal: 50000,
          pendingTransferCount: 1,
          pendingTransferAmount: 10000,
          byMethod: { efectivo: 20000, tarjeta_debito: 30000 },
        },
      });

      const blockedClose = await request(app)
        .post('/api/finance/cash-closures')
        .set('Cookie', cookies)
        .set('X-CSRF-Token', csrfToken ?? '')
        .send({ fecha: accountingDate, efectivoDeclarado: 21000 });
      expect(blockedClose.status).toBe(400);
      expect(blockedClose.body.error.message).toContain('transferencia(s) pendientes');

      await Payment.update(
        { estado: 'rechazado' },
        { where: { quotationId: quotation.id, estado: 'por_verificar' } },
      );
      const closeResponse = await request(app)
        .post('/api/finance/cash-closures')
        .set('Cookie', cookies)
        .set('X-CSRF-Token', csrfToken ?? '')
        .send({
          fecha: accountingDate,
          efectivoDeclarado: 21000,
          observaciones: 'Diferencia documentada en caja',
        });
      expect(closeResponse.status).toBe(201);
      expect(closeResponse.body).toMatchObject({
        isClosed: true,
        closure: {
          fecha: accountingDate,
          totalConfirmado: 50000,
          efectivoEsperado: 20000,
          efectivoDeclarado: 21000,
          diferenciaEfectivo: 1000,
        },
      });

      const retroactivePayment = await request(app)
        .post('/api/payments')
        .set('Cookie', cookies)
        .set('X-CSRF-Token', csrfToken ?? '')
        .send({
          quotationId: quotation.id,
          monto: 1000,
          metodo: 'efectivo',
          fecha: `${accountingDate}T15:00:00.000Z`,
        });
      expect(retroactivePayment.status).toBe(400);
      expect(retroactivePayment.body.error.message).toContain('ya está cerrada');
    } finally {
      await CashClosure.destroy({ where: { fecha: accountingDate } });
      await Payment.destroy({ where: { quotationId: quotation.id } });
      await quotation.destroy({ force: true });
      await client.destroy({ force: true });
    }
  });
});
