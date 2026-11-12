import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { CompanySettings } from '../../models/CompanySettings.js';
import { Permission } from '../../models/Permission.js';
import { Role } from '../../models/Role.js';
import { RolePermission } from '../../models/RolePermission.js';
import { User } from '../../models/User.js';
import * as storage from '../../services/file-storage.service.js';
import { invalidatePermissionCache } from '../../services/permission.service.js';
import { signAccessToken } from '../../utils/jwt.js';

import type { Role as RoleName } from '@unithor/shared';
import type { InferAttributes } from 'sequelize';

const csrf = 'phase7-settings-csrf';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const users = new Map<RoleName, User>();
const storedFiles = new Map<string, Buffer>();
let snapshot: InferAttributes<CompanySettings> | undefined;

const asRole = (test: request.Test, role: RoleName): request.Test => test
  .set('Cookie', [`access_token=${signAccessToken({ sub: users.get(role)!.id, role })}`, `csrf_token=${csrf}`])
  .set('X-CSRF-Token', csrf);

const upload = (role: RoleName, bytes = png, mime = 'image/png') => asRole(
  request(app).post('/api/settings/company/logo'), role,
).attach('logo', bytes, { filename: 'logo', contentType: mime });

describe('Phase 7 company settings policies and logo regressions', () => {
  beforeAll(async () => {
    if (sequelize.getDatabaseName() !== 'unithor_test') throw new Error('Requires unithor_test');
    const settings = await CompanySettings.findByPk(1);
    expect(settings).not.toBeNull();
    snapshot = settings!.get({ plain: true });
    for (const roleName of ['admin', 'desarrollador', 'jefe', 'vendedor'] as const) {
      const role = await Role.findOne({ where: { nombre: roleName } });
      const tag = `p7-settings-${randomUUID().slice(0, 12)}`;
      users.set(roleName, await User.create({ nombre: 'Phase 7 Settings', username: tag, email: `${tag}@unithor.local`, passwordHash: 'unused', roleId: role!.id, activo: true }));
    }
    invalidatePermissionCache();
  });

  beforeEach(async () => {
    storedFiles.clear();
    vi.spyOn(storage, 'storeFile').mockImplementation(async (key, bytes) => { storedFiles.set(key, bytes); });
    vi.spyOn(storage, 'removeStoredFile').mockImplementation(async (key) => { storedFiles.delete(key); });
    vi.spyOn(storage, 'readStoredFile').mockImplementation(async (key) => {
      const bytes = storedFiles.get(key);
      if (!bytes) throw new Error(`Missing mocked logo: ${key}`);
      return bytes;
    });
    await CompanySettings.update({ logoStorageKey: null, logoMimeType: null, logoSizeBytes: null, logoUpdatedAt: null }, { where: { id: 1 } });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (snapshot) await CompanySettings.upsert(snapshot);
    invalidatePermissionCache();
  });

  afterAll(async () => {
    if (snapshot) await CompanySettings.upsert(snapshot);
    const ids = [...users.values()].map((user) => user.id);
    if (ids.length) await User.destroy({ where: { id: ids }, force: true });
    invalidatePermissionCache();
  });

  it('keeps branding public and full reads behind the existing admin:read rule', async () => {
    const branding = await request(app).get('/api/settings/branding');
    expect(branding.status).toBe(200);
    for (const field of ['updatedBy', 'lastEditor', 'logoStorageKey', 'logoMimeType', 'giro']) {
      expect(branding.body).not.toHaveProperty(field);
    }
    expect((await request(app).get('/api/settings/company')).status).toBe(401);
    expect((await asRole(request(app).get('/api/settings/company'), 'vendedor')).status).toBe(403);
    expect((await asRole(request(app).get('/api/settings/company'), 'jefe')).status).toBe(200);
  });

  it('denies all settings writes to read-only jefe', async () => {
    expect((await asRole(request(app).patch('/api/settings/company'), 'jefe').send({ razonSocial: 'Blocked change' })).status).toBe(403);
    expect((await upload('jefe')).status).toBe(403);
    expect((await asRole(request(app).delete('/api/settings/company/logo'), 'jefe')).status).toBe(403);
    expect(storage.storeFile).not.toHaveBeenCalled();
    expect((await CompanySettings.findByPk(1))?.razonSocial).toBe(snapshot!.razonSocial);
  });

  it('honors delegated admin:update for both identity and logo writes', async () => {
    const permission = await Permission.findOne({ where: { modulo: 'admin', accion: 'update' } });
    const [grant, created] = await RolePermission.findOrCreate({
      where: { roleId: users.get('jefe')!.roleId, permissionId: permission!.id },
    });
    invalidatePermissionCache();
    try {
      expect((await asRole(request(app).patch('/api/settings/company'), 'jefe').send({ razonSocial: 'Delegated change' })).status).toBe(200);
      expect((await upload('jefe')).status).toBe(200);
      expect((await asRole(request(app).delete('/api/settings/company/logo'), 'jefe')).status).toBe(200);
    } finally {
      if (created) await grant.destroy();
      invalidatePermissionCache();
    }
  });

  it('creates the missing singleton safely during concurrent public branding reads', async () => {
    await CompanySettings.destroy({ where: { id: 1 } });
    const responses = await Promise.all([
      request(app).get('/api/settings/branding'),
      request(app).get('/api/settings/branding'),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(await CompanySettings.count()).toBe(1);
  });

  it.each(['admin', 'desarrollador'] as const)('allows %s identity and logo writes with public logo reads', async (role) => {
    const patched = await asRole(request(app).patch('/api/settings/company'), role)
      .send({ razonSocial: 'Phase 7 Company', logoStorageKey: 'injected', updatedBy: users.get('jefe')!.id });
    expect(patched.status).toBe(200);
    expect(patched.body.lastEditor.id).toBe(users.get(role)!.id);
    expect((await CompanySettings.findByPk(1))?.logoStorageKey).toBeNull();
    expect((await upload(role)).status).toBe(200);
    const logo = await request(app).get('/api/settings/company/logo');
    expect(logo.status).toBe(200);
    expect(logo.headers['content-type']).toContain('image/png');
    expect(logo.headers['content-security-policy']).toContain('sandbox');
    expect(Buffer.from(logo.body)).toEqual(png);
    expect((await asRole(request(app).delete('/api/settings/company/logo'), role)).status).toBe(200);
    expect((await request(app).get('/api/settings/company/logo')).status).toBe(404);
    expect(storedFiles.size).toBe(0);
  });

  it('requires CSRF and validates settings fields before writing', async () => {
    const user = users.get('admin')!;
    const missingCsrf = await request(app).patch('/api/settings/company')
      .set('Cookie', [`access_token=${signAccessToken({ sub: user.id, role: 'admin' })}`])
      .send({ razonSocial: 'Blocked' });
    expect(missingCsrf.status).toBe(403);
    for (const payload of [{}, { razonSocial: ' ' }, { email: 'invalid' }, { sitioWeb: 'javascript:alert(1)' }]) {
      expect((await asRole(request(app).patch('/api/settings/company'), 'admin').send(payload)).status).toBe(400);
    }
  });

  it.each(['<?xml version="1.0"?><html/>', '<svg-not-an-image/>'])(
    'rejects non-SVG XML: %s', async (source) => {
      expect((await upload('admin', Buffer.from(source), 'image/svg+xml')).status).toBe(400);
      expect(storage.storeFile).not.toHaveBeenCalled();
    },
  );

  it('accepts SVG with an XML declaration and comments, and rejects mismatched MIME', async () => {
    const svg = Buffer.from('<?xml version="1.0"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<!-- logo -->\n<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
    expect((await upload('admin', svg, 'image/png')).status).toBe(400);
    const response = await upload('admin', svg, 'image/svg+xml');
    expect(response.status).toBe(200);
    expect(response.body.logo.mimeType).toBe('image/svg+xml');
  });

  it('serializes overlapping logo replacements and removes both superseded files', async () => {
    expect((await upload('admin')).status).toBe(200);
    const responses = await Promise.all([upload('admin'), upload('desarrollador')]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const current = await CompanySettings.findByPk(1);
    expect([...storedFiles.keys()]).toEqual([current!.logoStorageKey]);
    expect(storage.removeStoredFile).toHaveBeenCalledTimes(2);
  });

  it('removes the newly stored file when a settings transaction fails', async () => {
    vi.spyOn(CompanySettings.prototype, 'update').mockRejectedValueOnce(new Error('settings update failed'));
    expect((await upload('admin')).status).toBe(500);
    expect(storedFiles.size).toBe(0);
    expect((await CompanySettings.findByPk(1))?.logoStorageKey).toBeNull();
  });
});
