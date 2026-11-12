import { randomUUID } from 'node:crypto';

import { Op } from 'sequelize';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { Permission } from '../../models/Permission.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { RolePermission } from '../../models/RolePermission.js';
import { User } from '../../models/User.js';
import { invalidatePermissionCache } from '../../services/permission.service.js';
import { updateUser } from '../../services/user.service.js';
import { signAccessToken } from '../../utils/jwt.js';
import { hashPassword } from '../../utils/password.js';

import type { Role as RoleName } from '@unithor/shared';

const password = 'Phase7Regression2026!';
const csrf = 'phase7-user-csrf';
const fixtures: User[] = [];
const roles = new Map<RoleName, number>();
let passwordHash: string;
let admin: User;
let developer: User;

const createUser = async (role: RoleName): Promise<User> => {
  const tag = `p7-${randomUUID().slice(0, 12)}`;
  const user = await User.create({
    nombre: 'Phase 7 User', username: tag, email: `${tag}@unithor.local`,
    passwordHash, roleId: roles.get(role)!, activo: true,
  });
  fixtures.push(user);
  return user;
};

const asUser = (test: request.Test, user: User, role: RoleName): request.Test => test
  .set('Cookie', [`access_token=${signAccessToken({ sub: user.id, role })}`, `csrf_token=${csrf}`])
  .set('X-CSRF-Token', csrf);

const withOnlyActiveUsers = async (role: RoleName, ids: number[], run: () => Promise<void>) => {
  const others = await User.findAll({
    where: { roleId: roles.get(role)!, activo: true, id: { [Op.notIn]: ids } },
    attributes: ['id'],
  });
  const otherIds = others.map((user) => user.id);
  try {
    if (otherIds.length) await User.update({ activo: false }, { where: { id: otherIds } });
    await run();
  } finally {
    if (otherIds.length) await User.update({ activo: true }, { where: { id: otherIds } });
  }
};

describe('Phase 7 user administration regressions', () => {
  beforeAll(async () => {
    if (sequelize.getDatabaseName() !== 'unithor_test') throw new Error('Requires unithor_test');
    passwordHash = await hashPassword(password);
    for (const role of await Role.findAll()) roles.set(role.nombre, role.id);
    admin = await createUser('admin');
    developer = await createUser('desarrollador');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    invalidatePermissionCache();
  });

  afterAll(async () => {
    const ids = fixtures.map((user) => user.id);
    if (ids.length) {
      await RefreshToken.destroy({ where: { userId: ids }, force: true });
      await User.destroy({ where: { id: ids }, force: true });
    }
  });

  it.each(['admin', 'desarrollador'] as const)(
    'protects the last active %s from generic deactivation, status, demotion and deletion',
    async (role) => {
      const target = role === 'admin' ? admin : developer;
      const actor = role === 'admin' ? developer : admin;
      const actorRole = role === 'admin' ? 'desarrollador' : 'admin';
      await withOnlyActiveUsers(role, [target.id], async () => {
        const mutations = [
          request(app).patch(`/api/users/${target.id}`).send({ activo: false }),
          request(app).patch(`/api/users/${target.id}/status`).send({ activo: false }),
          request(app).patch(`/api/users/${target.id}`).send({ roleId: roles.get('vendedor') }),
          request(app).delete(`/api/users/${target.id}`),
        ];
        for (const mutation of mutations) {
          expect((await asUser(mutation, actor, actorRole)).status).toBe(400);
          const stored = await User.findByPk(target.id);
          expect(stored?.activo).toBe(true);
          expect(stored?.roleId).toBe(roles.get(role));
        }
        const sameRole = await asUser(request(app).patch(`/api/users/${target.id}`), actor, actorRole)
          .send({ nombre: 'Still privileged', roleId: roles.get(role) });
        expect(sameRole.status).toBe(200);
      });
    },
  );

  it('checks self deactivation in both API paths and the service', async () => {
    for (const suffix of ['', '/status']) {
      const response = await asUser(request(app).patch(`/api/users/${admin.id}${suffix}`), admin, 'admin')
        .send({ activo: false });
      expect(response.status).toBe(400);
    }
    await expect(updateUser(admin.id, { activo: false }, admin.id))
      .rejects.toMatchObject({ statusCode: 400 });
    expect((await asUser(request(app).delete(`/api/users/${admin.id}`), admin, 'admin')).status).toBe(400);
  });

  it('serializes concurrent removals so one active admin survives', async () => {
    const first = await createUser('admin');
    const second = await createUser('admin');
    await withOnlyActiveUsers('admin', [first.id, second.id], async () => {
      const responses = await Promise.all([
        asUser(request(app).patch(`/api/users/${first.id}`), developer, 'desarrollador').send({ activo: false }),
        asUser(request(app).patch(`/api/users/${second.id}/status`), developer, 'desarrollador').send({ activo: false }),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
      expect(await User.count({ where: { roleId: roles.get('admin')!, activo: true } })).toBe(1);
    });
  });

  it('allows cleanup of an inactive privileged user without an active peer', async () => {
    const target = await createUser('admin');
    await target.update({ activo: false });
    await withOnlyActiveUsers('admin', [], async () => {
      const response = await asUser(request(app).delete(`/api/users/${target.id}`), developer, 'desarrollador');
      expect(response.status).toBe(204);
    });
  });

  it('uses the current role with existing access and refresh tokens after reassignment', async () => {
    const target = await createUser('admin');
    const login = await request(app).post('/api/auth/login').send({ email: target.email, password });
    expect(login.status).toBe(200);
    const cookies = login.headers['set-cookie'] as unknown as string[];
    const sessionCookies = cookies.map((cookie) => cookie.split(';')[0]);
    const oldTokenRequest = () => request(app).get('/api/users').set('Cookie', sessionCookies);
    expect((await oldTokenRequest()).status).toBe(200);
    const update = await asUser(request(app).patch(`/api/users/${target.id}`), developer, 'desarrollador')
      .send({ roleId: roles.get('vendedor') });
    expect(update.status).toBe(200);
    expect((await oldTokenRequest()).status).toBe(403);
    const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', sessionCookies);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.user.role).toBe('vendedor');
    expect(refreshed.body.user).not.toHaveProperty('passwordHash');
  });

  it.each(['', '/status'])('revokes refresh tokens and disables existing access via PATCH %s', async (suffix) => {
    const target = await createUser('vendedor');
    const login = await request(app).post('/api/auth/login').send({ email: target.email, password });
    expect(login.status).toBe(200);
    const cookies = (login.headers['set-cookie'] as unknown as string[]).map((cookie) => cookie.split(';')[0]);
    const response = await asUser(request(app).patch(`/api/users/${target.id}${suffix}`), developer, 'desarrollador')
      .send({ activo: false });
    expect(response.status).toBe(200);
    expect(await RefreshToken.count({ where: { userId: target.id, revokedAt: null } })).toBe(0);
    expect((await request(app).get('/api/auth/me').set('Cookie', cookies)).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookies)).status).toBe(401);
  });

  it('rolls back deactivation if token revocation fails', async () => {
    const target = await createUser('vendedor');
    vi.spyOn(RefreshToken, 'update').mockRejectedValueOnce(new Error('revocation failed'));
    const response = await asUser(request(app).patch(`/api/users/${target.id}/status`), developer, 'desarrollador')
      .send({ activo: false });
    expect(response.status).toBe(500);
    expect((await User.findByPk(target.id))?.activo).toBe(true);
  });

  it('revokes warmed matrix permissions immediately for an existing token', async () => {
    const target = await createUser('vendedor');
    const original = await RolePermission.findAll({ where: { roleId: target.roleId } });
    const originalIds = original.map((grant) => grant.permissionId);
    const read = await Permission.findOne({ where: { modulo: 'admin', accion: 'read' } });
    const retained = await Permission.findOne({ where: { modulo: 'taller', accion: 'read' } });
    const token = signAccessToken({ sub: target.id, role: 'vendedor' });
    const requestWithOldToken = () => request(app).get('/api/users').set('Cookie', [`access_token=${token}`]);
    const replace = (permissionIds: number[]) => asUser(
      request(app).put(`/api/roles/${target.roleId}/permissions`), developer, 'desarrollador',
    ).send({ roleId: target.roleId, permissionIds });
    try {
      expect((await replace([read!.id, retained!.id])).status).toBe(200);
      expect((await requestWithOldToken()).status).toBe(200);
      expect((await replace([retained!.id])).status).toBe(200);
      expect((await requestWithOldToken()).status).toBe(403);
    } finally {
      await RolePermission.destroy({ where: { roleId: target.roleId } });
      await RolePermission.bulkCreate(originalIds.map((permissionId) => ({ roleId: target.roleId, permissionId })));
      invalidatePermissionCache(target.roleId);
    }
  });

  it('validates user input and strips password fields from every public response', async () => {
    const tag = `p7-${randomUUID().slice(0, 12)}`;
    const payload = { nombre: 'New User', username: tag, email: `${tag}@unithor.local`, password, roleId: roles.get('vendedor') };
    const longEmail = `${'a'.repeat(170)}@example.com`;
    for (const invalid of [{ ...payload, password: 'short' }, { ...payload, email: 'invalid' }, { ...payload, email: longEmail }, { ...payload, roleId: 2147483647 }]) {
      expect((await asUser(request(app).post('/api/users'), developer, 'desarrollador').send(invalid)).status).toBe(400);
    }
    const created = await asUser(request(app).post('/api/users'), developer, 'desarrollador').send(payload);
    expect(created.status).toBe(201);
    const target = (await User.findByPk(created.body.user.id))!;
    fixtures.push(target);
    expect(target.passwordHash).toMatch(/^\$2[aby]\$/);
    expect((await asUser(request(app).patch(`/api/users/${target.id}`), developer, 'desarrollador')
      .send({ email: longEmail })).status).toBe(400);
    const updated = await asUser(request(app).patch(`/api/users/${target.id}`), developer, 'desarrollador')
      .send({ nombre: 'Updated', password: 'ignored password', passwordHash: 'injected hash' });
    expect(updated.status).toBe(200);
    expect((await User.findByPk(target.id))?.passwordHash).toBe(target.passwordHash);
    const detail = await asUser(request(app).get(`/api/users/${target.id}`), developer, 'desarrollador');
    const list = await asUser(request(app).get('/api/users').query({ search: tag }), developer, 'desarrollador');
    expect(detail.status).toBe(200);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    for (const user of [created.body.user, updated.body.user, detail.body.user, ...list.body.data]) {
      expect(user).not.toHaveProperty('password');
      expect(user).not.toHaveProperty('passwordHash');
    }
  });
});
