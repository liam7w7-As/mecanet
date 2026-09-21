import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
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
});
