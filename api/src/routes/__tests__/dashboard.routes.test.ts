import { dashboardSummarySchema } from '@unithor/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { Quotation } from '../../models/Quotation.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { WorkOrderItem } from '../../models/WorkOrderItem.js';
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
  const createdUsers: number[] = [];
  const createdOrders: number[] = [];

  beforeAll(async () => {
    await sequelize.authenticate();
    let developer = await User.findOne({ where: { email: 'dev@unithor.local' } });
    if (!developer) {
      const developerRole = await Role.findOne({ where: { nombre: 'desarrollador' } });
      if (!developerRole) throw new Error('No se encontró el rol desarrollador base');
      developer = await User.create({
        nombre: 'Desarrollador UNITHOR',
        email: 'dev@unithor.local',
        username: 'dev',
        passwordHash: await hashPassword(TEST_PASSWORD),
        roleId: developerRole.id,
        activo: true,
      });
    }

    developerId = developer.id;
    await developer.update({ passwordHash: await hashPassword(TEST_PASSWORD), activo: true });
  });

  afterAll(async () => {
    if (createdOrders.length) await WorkOrder.destroy({ where: { id: createdOrders }, force: true });
    if (createdUsers.length) {
      await RefreshToken.destroy({ where: { userId: createdUsers }, force: true });
      await User.destroy({ where: { id: createdUsers }, force: true });
    }
    if (developerId !== undefined) {
      await RefreshToken.destroy({ where: { userId: developerId }, force: true });
    }
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
    expect(response.body.operationalInbox).toEqual(
      expect.objectContaining({
        role: 'desarrollador',
        total: expect.any(Number),
        counts: expect.objectContaining({
          approvals: expect.any(Number),
          warehouseDeliveries: expect.any(Number),
          paymentVerifications: expect.any(Number),
        }),
        items: expect.any(Array),
      }),
    );
    expect(dashboardSummarySchema.safeParse(response.body).success).toBe(true);
  });

  it('muestra el mismo total con IVA en la bandeja y en el resumen de COT sin OT', async () => {
    const quotation = await Quotation.create({ codigo: 'DASH-IVA', asesorId: developerId,
      estadoPago: 'por_pagar', subtotal: 1000000, total: 1000000, pagado: 0 });
    try {
      const login = await request(app).post('/api/auth/login').send({ email: 'dev@unithor.local', password: TEST_PASSWORD });
      const response = await request(app).get('/api/dashboard/summary')
        .set('Cookie', [`access_token=${extractAccessToken(login)}`]);
      expect(response.status).toBe(200);
      expect(response.body.unlinkedQuotations.find((item: { id: number }) => item.id === quotation.id)?.total).toBe(1190000);
      expect(response.body.operationalInbox.items.find((item: { id: string }) => item.id === `quotation-${quotation.id}`)?.description).toContain('$1.190.000');
    } finally {
      await quotation.destroy({ force: true });
    }
  });

  it('el resumen del mecánico incluye asignaciones por servicio y excluye las OT de otros', async () => {
    const role = await Role.findOne({ where: { nombre: 'mecanico' } });
    if (!role) throw new Error('Falta el rol mecánico');
    const passwordHash = await hashPassword(TEST_PASSWORD);
    const mechanics = await Promise.all(['own', 'other'].map((suffix) => User.create({ nombre: `Dashboard ${suffix}`, email: `dashboard-${suffix}@example.com`, passwordHash, activo: true, roleId: role.id })));
    createdUsers.push(...mechanics.map((user) => user.id));
    const orders = await Promise.all([
      WorkOrder.create({ codigo: 'DASH-OWN', estado: 'en_progreso', assignedMechanicId: mechanics[0].id, createdBy: developerId }),
      WorkOrder.create({ codigo: 'DASH-ITEM', estado: 'esperando_repuesto', assignedMechanicId: mechanics[1].id, createdBy: developerId }),
      WorkOrder.create({ codigo: 'DASH-FOREIGN', estado: 'en_progreso', assignedMechanicId: mechanics[1].id, createdBy: developerId }),
    ]);
    createdOrders.push(...orders.map((order) => order.id));
    await WorkOrderItem.create({ workOrderId: orders[1].id, descripcion: 'Servicio asignado', tipoLinea: 'especifico', cantidad: 1, precioUnitario: 10000, subtotal: 10000, assignedUserId: mechanics[0].id });
    const login = await request(app).post('/api/auth/login').send({ email: mechanics[0].email, password: TEST_PASSWORD });
    const response = await request(app).get('/api/dashboard/summary').set('Cookie', [`access_token=${extractAccessToken(login)}`]);
    expect(response.status).toBe(200);
    expect(response.body.metrics.activeWorkOrders).toBe(2);
    expect(response.body.metrics.waitingForParts).toBe(1);
    expect(response.body.operationalInbox.counts.assignedWorkOrders).toBe(2);
    expect(response.body.recentWorkOrders.map((order: { id: number }) => order.id).sort()).toEqual([orders[0].id, orders[1].id].sort());
    expect(JSON.stringify(response.body)).not.toContain('DASH-FOREIGN');
    expect(response.body.metrics.monthlyRevenue).toBe(0);
    expect(response.body.unlinkedQuotations).toEqual([]);
  });
});
