import { dashboardSummarySchema } from '@unithor/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { User } from '../../models/User.js';
import { hashPassword } from '../../utils/password.js';

const TEST_PASSWORD = 'Desarrollador2026!';

const extractAccessToken = (response: request.Response): string => {
  const rawHeader = response.headers['set-cookie'];
  const cookies: string[] = Array.isArray(rawHeader)
    ? rawHeader
    : typeof rawHeader === 'string'
      ? [rawHeader]
      : [];
  const accessCookie = cookies.find((cookie) => cookie.startsWith('access_token='));
  return accessCookie?.split(';')[0].slice('access_token='.length) ?? '';
};

describe('Dashboard Routes (E2E)', () => {
  let developerId: number;

  beforeAll(async () => {
    await sequelize.authenticate();
    const developer = await User.findOne({ where: { email: 'dev@unithor.local' } });
    if (!developer) throw new Error('No se encontró el usuario desarrollador base');

    developerId = developer.id;
    await developer.update({ passwordHash: await hashPassword(TEST_PASSWORD), activo: true });
  });

  afterAll(async () => {
    await RefreshToken.destroy({ where: { userId: developerId }, force: true });
  });

  it('requiere una sesión autenticada', async () => {
    const response = await request(app).get('/api/dashboard/summary');
    expect(response.status).toBe(401);
  });

  it('retorna las métricas y listas operativas con la estructura esperada', async () => {
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ email: 'dev@unithor.local', password: TEST_PASSWORD });
    expect(loginResponse.status).toBe(200);

    const response = await request(app)
      .get('/api/dashboard/summary')
      .set('Cookie', [`access_token=${extractAccessToken(loginResponse)}`]);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        metrics: expect.objectContaining({}),
      }),
    );
    expect(typeof response.body.metrics.activeWorkOrders).toBe('number');
    expect(typeof response.body.metrics.monthlyRevenue).toBe('number');
    expect(typeof response.body.metrics.pendingBalance).toBe('number');
    expect(typeof response.body.metrics.pendingQuotations).toBe('number');
    expect(typeof response.body.metrics.waitingForParts).toBe('number');
    expect(Array.isArray(response.body.recentWorkOrders)).toBe(true);
    expect(typeof response.body.lowStockCount).toBe('number');
    expect(Array.isArray(response.body.lowStockItems)).toBe(true);
    expect(Array.isArray(response.body.unlinkedQuotations)).toBe(true);
    expect(dashboardSummarySchema.safeParse(response.body).success).toBe(true);
  });
});
