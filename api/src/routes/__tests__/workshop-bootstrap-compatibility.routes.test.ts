import { randomUUID } from 'node:crypto';

import { UniqueConstraintError } from 'sequelize';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { up as personnel } from '../../database/migrations/050-workshop-personnel.js';
import { up as timeRequests } from '../../database/migrations/051-workshop-time-requests.js';
import { up as teams } from '../../database/migrations/052-work-order-teams.js';
import { up as quality } from '../../database/migrations/053-work-order-quality.js';
import { up as commercial } from '../../database/migrations/054-work-order-commercial-control.js';
import { up as alerts } from '../../database/migrations/055-workshop-alert-settings.js';
import { up as workingHours } from '../../database/migrations/056-workshop-working-hours.js';
import { up as overtime } from '../../database/migrations/057-workshop-overtime.js';
import { up as timeOperational } from '../../database/migrations/058-workshop-time-operational.js';
import { up as reviews } from '../../database/migrations/059-workshop-commercial-reviews.js';
import { app } from '../../main.js';
import { Client, Role, Specialty, User, Vehicle, WorkerSpecialty, WorkOrder, WorkOrderItem, WorkOrderItemSession } from '../../models/index.js';
import { signAccessToken } from '../../utils/jwt.js';

describe('Interrupted MySQL workshop bootstrap (unithor_test only)', () => {
  const query = sequelize.getQueryInterface();
  const tag = randomUUID().slice(0, 8);
  const resume = async () => {
    for (const migrate of [personnel, timeRequests, teams, quality, commercial, alerts, workingHours, overtime, timeOperational, reviews]) await migrate(query);
  };
  let admin: User; let worker: User; let order: WorkOrder; let item: WorkOrderItem; let session: WorkOrderItemSession;
  let specialties: Specialty[];
  const listing = () => request(app).get('/api/work-orders?page=1&pageSize=12')
    .set('Cookie', `access_token=${signAccessToken({ sub: admin.id, role: 'admin' })}`);

  beforeAll(async () => {
    if (sequelize.getDatabaseName() !== 'unithor_test') throw new Error('Schema recovery test requires unithor_test');
    for (const roleName of ['admin', 'mecanico'] as const) {
      const role = await Role.findOne({ where: { nombre: roleName } });
      if (!role) throw new Error('Missing fixture role');
      const user = await User.create({ nombre: `Bootstrap ${roleName}`, username: `boot_${tag}_${roleName}`, email: `boot_${tag}_${roleName}@example.test`, passwordHash: 'signed-fixture', roleId: role.id, activo: true });
      if (roleName === 'admin') admin = user; else worker = user;
    }
    specialties = await Promise.all([1, 2, 3].map((index) => Specialty.create({ name: `Boot ${tag} ${index}`, active: true })));
    await WorkerSpecialty.bulkCreate([
      { userId: worker.id, specialtyId: specialties[0].id, isPrincipal: true, updatedBy: admin.id },
      { userId: worker.id, specialtyId: specialties[1].id, isPrincipal: false, updatedBy: admin.id },
    ]);
    const client = await Client.create({ nombre: `Bootstrap ${tag}`, tipo: 'cliente', email: null });
    const vehicle = await Vehicle.create({ patente: `B${tag}`, clientId: client.id });
    order = await WorkOrder.create({ codigo: `OT-BOOT-${tag}`, vehicleId: vehicle.id, clientId: client.id, estado: 'en_progreso', createdBy: admin.id });
    item = await WorkOrderItem.create({ workOrderId: order.id, descripcion: 'Diagnóstico conservado', precioUnitario: 10000, horasHombreReales: 1.25 });
    const end = new Date(Date.now() - 60_000);
    session = await WorkOrderItemSession.create({ workOrderId: order.id, workOrderItemId: item.id, userId: worker.id, userName: worker.nombre,
      kind: 'manual', status: 'cerrada', startedAt: new Date(end.getTime() - 75 * 60_000), endedAt: end,
      durationMinutes: 75, note: 'Horas anteriores al despliegue', closeReason: 'cierre_manual', createdBy: admin.id });
  }, 60000);

  afterAll(async () => {
    // Restore the schema even if a recovery assertion fails.
    if (sequelize.getDatabaseName() === 'unithor_test') await resume();
    await sequelize.close();
  }, 60000);

  it('reproduces the missing price column 500 and recovers the OT listing without changing skills or hours', async () => {
    const before = (await WorkerSpecialty.findAll({ where: { userId: worker.id }, order: [['id', 'ASC']] })).map((row) => row.toJSON());
    const indexes = await query.showIndex('worker_specialties') as Array<{ name: string }>;
    if (indexes.some((index) => index.name === 'worker_specialties_principal_unique')) await query.removeIndex('worker_specialties', 'worker_specialties_principal_unique');
    await query.removeColumn('worker_specialties', 'principal_user_id');
    await query.removeColumn('work_orders', 'price_approval_required');
    expect((await listing()).status).toBe(500);

    await resume();
    const response = await listing();
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: order.id, priceApprovalRequired: true })]));
    expect((await query.describeTable('work_orders')).price_approval_required).toBeDefined();
    expect((await WorkerSpecialty.findAll({ where: { userId: worker.id }, order: [['id', 'ASC']] })).map((row) => row.toJSON())).toEqual(before);
    expect(Number((await item.reload()).horasHombreReales)).toBe(1.25);
    expect(Number((await session.reload()).durationMinutes)).toBe(75);
    expect(session.note).toBe('Horas anteriores al despliegue');
  }, 60000);

  it('retains one principal specialty, multiple additional specialties and idempotent redeployments', async () => {
    await expect(WorkerSpecialty.create({ userId: worker.id, specialtyId: specialties[2].id, isPrincipal: true, updatedBy: admin.id })).rejects.toBeInstanceOf(UniqueConstraintError);
    await WorkerSpecialty.create({ userId: worker.id, specialtyId: specialties[2].id, isPrincipal: false, updatedBy: admin.id });
    await resume();
    await resume();
    expect(await WorkerSpecialty.count({ where: { userId: worker.id, isPrincipal: true } })).toBe(1);
    expect(await WorkerSpecialty.count({ where: { userId: worker.id, isPrincipal: false } })).toBe(2);
    expect((await listing()).status).toBe(200);
    expect(Number((await session.reload()).durationMinutes)).toBe(75);
  }, 60000);
});
