import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { Role } from '../../models/Role.js';
import { Specialty } from '../../models/Specialty.js';
import { SpecialtyRate } from '../../models/SpecialtyRate.js';
import { User } from '../../models/User.js';
import { WorkerSpecialty } from '../../models/WorkerSpecialty.js';
import { WorkshopSchedule } from '../../models/WorkshopSchedule.js';
import { WorkshopScheduleException } from '../../models/WorkshopScheduleException.js';
import { getWorkerRateSnapshot, getWorkerShift } from '../../services/workshop-personnel.service.js';
import { signAccessToken } from '../../utils/jwt.js';

import type { Role as RoleName } from '@unithor/shared';

/** DB integration coverage: run only with the parent's serial API suite. */
describe('workshop personnel routes', () => {
  const people = new Map<RoleName, User>();
  const specialtyIds: number[] = [];
  const csrf = 'workshop-personnel-test-csrf';
  const as = (test: request.Test, role: RoleName = 'admin') => test
    .set('Cookie', [`access_token=${signAccessToken({ sub: people.get(role)!.id, role })}`, `csrf_token=${csrf}`])
    .set('X-CSRF-Token', csrf);
  const createSpecialty = async () => {
    const response = await as(request(app).post('/api/workshop-personnel/specialties')).send({ name: `Oficio ${randomUUID().slice(0, 12)}` });
    expect(response.status).toBe(201);
    specialtyIds.push(response.body.id as number);
    return response.body as { id: number; name: string };
  };
  beforeAll(async () => {
    if (sequelize.getDatabaseName() !== 'unithor_test') throw new Error('Requires unithor_test');
    for (const role of ['desarrollador', 'admin', 'jefe', 'mecanico', 'vendedor'] as const) {
      const storedRole = await Role.findOne({ where: { nombre: role } });
      if (!storedRole) throw new Error(`Missing role ${role}`);
      const tag = `personnel-${randomUUID().slice(0, 12)}`;
      people.set(role, await User.create({ nombre: `Personnel ${role}`, username: tag, email: `${tag}@example.test`, passwordHash: 'unused-test-token-auth', roleId: storedRole.id, activo: true }));
    }
  });
  afterAll(async () => {
    // Test fixture cleanup explicitly bypasses the append-only ORM hooks.
    const ids = [...people.values()].map((user) => user.id);
    if (ids.length) {
      await WorkshopScheduleException.destroy({ where: { createdBy: ids }, hooks: false });
      await WorkerSpecialty.destroy({ where: { userId: ids } });
      await WorkshopSchedule.update({ updatedBy: null, weekly: [] }, { where: { updatedBy: ids } });
    }
    if (specialtyIds.length) {
      await SpecialtyRate.destroy({ where: { specialtyId: specialtyIds }, hooks: false });
      await Specialty.destroy({ where: { id: specialtyIds } });
    }
    if (ids.length) await User.destroy({ where: { id: ids }, force: true });
  });

  it('requires authentication and never returns prices to mechanics or sellers', async () => {
    expect((await request(app).get('/api/workshop-personnel/config')).status).toBe(401);
    for (const role of ['mecanico', 'vendedor'] as const) {
      const response = await as(request(app).get('/api/workshop-personnel/config'), role);
      expect(response.status).toBe(403);
      expect(response.body.rates).toBeUndefined();
    }
    for (const role of ['admin', 'desarrollador', 'jefe'] as const) {
      const response = await as(request(app).get('/api/workshop-personnel/config'), role);
      expect(response.status).toBe(200);
      expect(Object.keys(response.body).sort()).toEqual(['exceptions', 'profiles', 'rates', 'schedule', 'specialties', 'workers']);
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    }
  });
  it('uses global CSRF protection for configuration mutations', async () => {
    const response = await request(app).post('/api/workshop-personnel/specialties')
      .set('Cookie', `access_token=${signAccessToken({ sub: people.get('admin')!.id, role: 'admin' })}`)
      .send({ name: 'Blocked without CSRF' });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_INVALID');
  });
  it('lets the workshop chief create specialties, assign profiles and edit the weekly schedule', async () => {
    const specialty = await createSpecialty();
    const workerId = people.get('mecanico')!.id;
    const created = await as(request(app).post('/api/workshop-personnel/specialties').send({ name: `Oficio jefe ${randomUUID().slice(0, 8)}` }), 'jefe');
    expect(created.status).toBe(201);
    specialtyIds.push(created.body.id as number);
    expect((await as(request(app).patch(`/api/workshop-personnel/specialties/${created.body.id}`).send({ active: false }), 'jefe')).status).toBe(200);
    expect((await as(request(app).put(`/api/workshop-personnel/workers/${workerId}/profile`).send({ principalSpecialtyId: specialty.id, additionalSpecialtyIds: [] }), 'jefe')).status).toBe(200);
    expect((await as(request(app).put('/api/workshop-personnel/schedule').send({ timezone: 'America/Santiago', weekly: [] }), 'jefe')).status).toBe(200);
    const seeded = await as(request(app).post('/api/workshop-personnel/specialties/seed').send({}), 'jefe');
    expect(seeded.status).toBe(201);
    specialtyIds.push(...(seeded.body as { id: number }[]).map((row) => row.id));
  });
  it('keeps specialty prices admin-only', async () => {
    const specialty = await createSpecialty();
    const response = await as(request(app).post(`/api/workshop-personnel/specialties/${specialty.id}/rates`)
      .send({ validityFrom: '2099-01-01', costHourly: 1, saleHourly: 2 }), 'jefe');
    expect(response.status).toBe(403);
  });
  it('rejects workshop management from mechanics and sellers', async () => {
    const specialty = await createSpecialty();
    const workerId = people.get('mecanico')!.id;
    for (const role of ['mecanico', 'vendedor'] as const) {
      expect((await as(request(app).post('/api/workshop-personnel/specialties').send({ name: `No autorizado ${role}` }), role)).status).toBe(403);
      expect((await as(request(app).put(`/api/workshop-personnel/workers/${workerId}/profile`)
        .send({ principalSpecialtyId: specialty.id, additionalSpecialtyIds: [] }), role)).status).toBe(403);
    }
  });
  it('supports opt-in default names without creating any rates', async () => {
    const response = await as(request(app).post('/api/workshop-personnel/specialties/seed')).send({});
    expect(response.status).toBe(201);
    expect(response.body.map((row: { name: string }) => row.name)).toEqual(['Mecánico', 'Electricista', 'Ayudante', 'Desabollador', 'Pintor']);
    const ids = response.body.map((row: { id: number }) => row.id) as number[];
    specialtyIds.push(...ids);
    expect(await SpecialtyRate.count({ where: { specialtyId: ids } })).toBe(0);
    const repeated = await as(request(app).post('/api/workshop-personnel/specialties/seed')).send({});
    expect(repeated.body.map((row: { id: number }) => row.id)).toEqual(ids);
  });
  it('preserves every historical rate and refuses rewriting a validity date', async () => {
    const specialty = await createSpecialty();
    const first = await as(request(app).post(`/api/workshop-personnel/specialties/${specialty.id}/rates`)).send({ validityFrom: '2020-01-01', costHourly: 0, saleHourly: 10000 });
    expect(first.status).toBe(201);
    const next = await as(request(app).post(`/api/workshop-personnel/specialties/${specialty.id}/rates`)).send({ validityFrom: '2099-01-01', costHourly: 5000, saleHourly: 18000 });
    expect(next.status).toBe(201);
    expect((await as(request(app).post(`/api/workshop-personnel/specialties/${specialty.id}/rates`)).send({ validityFrom: '2099-01-01', costHourly: 10, saleHourly: 20 })).status).toBe(409);
    expect((await as(request(app).post(`/api/workshop-personnel/specialties/${specialty.id}/rates`)).send({ validityFrom: '2098-01-01', costHourly: 10, saleHourly: 20 })).status).toBe(409);
    const stored = await SpecialtyRate.findByPk(first.body.id as number);
    expect(Number(stored!.costHourly)).toBe(0);
    expect(Number(stored!.saleHourly)).toBe(10000);
    await expect(stored!.update({ costHourly: 50 })).rejects.toThrow(/históricas/);
  });
  it('assigns skills to a worker of any authorization role and resolves principal/additional snapshots', async () => {
    const principal = await createSpecialty();
    const additional = await createSpecialty();
    const worker = people.get('vendedor')!;
    const response = await as(request(app).put(`/api/workshop-personnel/workers/${worker.id}/profile`)).send({ principalSpecialtyId: principal.id, additionalSpecialtyIds: [additional.id] });
    expect(response.status).toBe(200);
    expect((await getWorkerRateSnapshot(worker.id, null, new Date())).specialtyId).toBe(principal.id);
    expect((await getWorkerRateSnapshot(worker.id, additional.id, new Date())).specialtyId).toBe(additional.id);
    const invalid = await as(request(app).put(`/api/workshop-personnel/workers/${worker.id}/profile`)).send({ principalSpecialtyId: principal.id, additionalSpecialtyIds: [principal.id] });
    expect(invalid.status).toBe(400);
    expect(await WorkerSpecialty.count({ where: { userId: worker.id } })).toBe(2);
  });
  it('keeps an empty weekly schedule unconfigured and lets a chief append worker/day exceptions with reasons', async () => {
    const worker = people.get('mecanico')!;
    expect((await as(request(app).put('/api/workshop-personnel/schedule')).send({ timezone: 'America/Santiago', weekly: [] })).status).toBe(200);
    expect(await getWorkerShift(worker.id, new Date('2026-01-02T15:00:00Z'))).toEqual({ configured: false, start: null, end: null });
    const url = `/api/workshop-personnel/workers/${worker.id}/exceptions`;
    expect((await as(request(app).post(url), 'jefe').send({ date: '2026-01-02', dayOff: true, reason: ' ' })).status).toBe(400);
    const first = await as(request(app).post(url), 'jefe').send({ date: '2026-01-02', dayOff: false, start: '09:15', end: '13:45', reason: 'Turno acordado' });
    expect(first.status).toBe(201);
    expect(first.body.version).toBe(1);
    expect((await getWorkerShift(worker.id, new Date('2026-01-02T15:00:00Z'))).end).toEqual(new Date('2026-01-02T16:45:00Z'));
    const second = await as(request(app).post(url), 'jefe').send({ date: '2026-01-02', dayOff: true, reason: 'Permiso médico' });
    expect(second.status).toBe(201);
    expect(second.body.version).toBe(2);
    expect(await getWorkerShift(worker.id, new Date('2026-01-02T15:00:00Z'))).toEqual({ configured: true, start: null, end: null });
    const versions = await WorkshopScheduleException.findAll({ where: { userId: worker.id, date: '2026-01-02' }, order: [['version', 'ASC']] });
    expect(versions.map((row) => row.reason)).toEqual(['Turno acordado', 'Permiso médico']);
    await expect(versions[0]!.update({ reason: 'Rewrite' })).rejects.toThrow(/históricas/);
  });
});
