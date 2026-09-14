import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { Permission } from '../../models/Permission.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { Role } from '../../models/Role.js';
import { RolePermission } from '../../models/RolePermission.js';
import { User } from '../../models/User.js';
import { hasPermission, invalidatePermissionCache } from '../../services/permission.service.js';
import { hashPassword } from '../../utils/password.js';

const TEST_PASSWORD = 'Desarrollador2026!';
const TEST_EMAIL_PREFIX = 'phase23-';

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

describe('Permission Matrix Routes (E2E)', () => {
  let devUserId: number;
  let adminUserId: number;
  let vendedorUserId: number;
  let bodegueroUserId: number;
  let adminRoleId: number;
  let desarrolladorRoleId: number;
  let vendedorRoleId: number;
  let bodegueroRoleId: number;
  let originalVendedorPermissionIds: number[];
  let adminReadPermissionId: number;
  let adminDeletePermissionId: number;
  let comercialReadPermissionId: number;
  let comercialCreatePermissionId: number;

  beforeAll(async () => {
    await sequelize.authenticate();

    const passwordHash = await hashPassword(TEST_PASSWORD);
    const [devUser, adminRole, desarrolladorRole, vendedorRole, bodegueroRole] =
      await Promise.all([
        User.findOne({ where: { email: 'dev@unithor.local' } }),
        Role.findOne({ where: { nombre: 'admin' } }),
        Role.findOne({ where: { nombre: 'desarrollador' } }),
        Role.findOne({ where: { nombre: 'vendedor' } }),
        Role.findOne({ where: { nombre: 'bodeguero' } }),
      ]);

    if (!devUser || !adminRole || !desarrolladorRole || !vendedorRole || !bodegueroRole) {
      throw new Error('No se encontraron usuarios o roles base para permission.routes.test');
    }

    await devUser.update({ passwordHash, activo: true });
    devUserId = devUser.id;
    adminRoleId = adminRole.id;
    desarrolladorRoleId = desarrolladorRole.id;
    vendedorRoleId = vendedorRole.id;
    bodegueroRoleId = bodegueroRole.id;

    const permissions = await Permission.findAll();
    const permissionMap = new Map(
      permissions.map((permission) => [`${permission.modulo}:${permission.accion}`, permission.id]),
    );

    const requiredPermissions = {
      adminRead: permissionMap.get('admin:read'),
      adminDelete: permissionMap.get('admin:delete'),
      comercialRead: permissionMap.get('comercial:read'),
      comercialCreate: permissionMap.get('comercial:create'),
    };

    if (
      !requiredPermissions.adminRead ||
      !requiredPermissions.adminDelete ||
      !requiredPermissions.comercialRead ||
      !requiredPermissions.comercialCreate
    ) {
      throw new Error('No se encontraron permisos base para permission.routes.test');
    }

    adminReadPermissionId = requiredPermissions.adminRead;
    adminDeletePermissionId = requiredPermissions.adminDelete;
    comercialReadPermissionId = requiredPermissions.comercialRead;
    comercialCreatePermissionId = requiredPermissions.comercialCreate;

    const originalVendedorPermissions = await RolePermission.findAll({
      where: { roleId: vendedorRoleId },
    });
    originalVendedorPermissionIds = originalVendedorPermissions.map((rp) => rp.permissionId);

    await User.destroy({
      where: {
        email: [
          `${TEST_EMAIL_PREFIX}admin@unithor.local`,
          `${TEST_EMAIL_PREFIX}vendedor@unithor.local`,
          `${TEST_EMAIL_PREFIX}bodeguero@unithor.local`,
        ],
      },
      force: true,
    });

    const [adminUser, vendedorUser, bodegueroUser] = await Promise.all([
      User.create({
        nombre: 'Admin Fase 23',
        email: `${TEST_EMAIL_PREFIX}admin@unithor.local`,
        passwordHash,
        roleId: adminRoleId,
        activo: true,
      }),
      User.create({
        nombre: 'Vendedor Fase 23',
        email: `${TEST_EMAIL_PREFIX}vendedor@unithor.local`,
        passwordHash,
        roleId: vendedorRoleId,
        activo: true,
      }),
      User.create({
        nombre: 'Bodeguero Fase 23',
        email: `${TEST_EMAIL_PREFIX}bodeguero@unithor.local`,
        passwordHash,
        roleId: bodegueroRoleId,
        activo: true,
      }),
    ]);

    adminUserId = adminUser.id;
    vendedorUserId = vendedorUser.id;
    bodegueroUserId = bodegueroUser.id;
  });

  afterAll(async () => {
    await RolePermission.destroy({ where: { roleId: vendedorRoleId } });
    await RolePermission.bulkCreate(
      originalVendedorPermissionIds.map((permissionId) => ({
        roleId: vendedorRoleId,
        permissionId,
      })),
    );
    invalidatePermissionCache(vendedorRoleId);

    await RefreshToken.destroy({
      where: { userId: [devUserId, adminUserId, vendedorUserId, bodegueroUserId] },
      force: true,
    });
    await User.destroy({
      where: { id: [adminUserId, vendedorUserId, bodegueroUserId] },
      force: true,
    });
  });

  it('lista roles y permisos para usuario admin', async () => {
    const adminCookies = await loginAs(`${TEST_EMAIL_PREFIX}admin@unithor.local`);

    const rolesResponse = await request(app)
      .get('/api/roles')
      .set('Cookie', [`access_token=${adminCookies.accessToken}`]);
    expect(rolesResponse.status).toBe(200);
    expect(rolesResponse.body.roles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: adminRoleId, nombre: 'admin' }),
        expect.objectContaining({ id: vendedorRoleId, nombre: 'vendedor' }),
      ]),
    );

    const permissionsResponse = await request(app)
      .get('/api/permissions')
      .set('Cookie', [`access_token=${adminCookies.accessToken}`]);
    expect(permissionsResponse.status).toBe(200);
    expect(permissionsResponse.body.permissions).toHaveLength(24);
    expect(permissionsResponse.body.permissions[0]).toHaveProperty('modulo');
    expect(permissionsResponse.body.permissions[0]).toHaveProperty('accion');
  });

  it('deniega acceso a vendedor y bodeguero para consultar o editar permisos', async () => {
    const vendedorCookies = await loginAs(`${TEST_EMAIL_PREFIX}vendedor@unithor.local`);
    const bodegueroCookies = await loginAs(`${TEST_EMAIL_PREFIX}bodeguero@unithor.local`);

    const vendedorRead = await request(app)
      .get('/api/roles')
      .set('Cookie', [`access_token=${vendedorCookies.accessToken}`]);
    expect(vendedorRead.status).toBe(403);

    const bodegueroUpdate = await request(app)
      .put(`/api/roles/${vendedorRoleId}/permissions`)
      .set('Cookie', authCookie(bodegueroCookies))
      .set('X-CSRF-Token', bodegueroCookies.csrfToken)
      .send({
        roleId: vendedorRoleId,
        permissionIds: [comercialReadPermissionId],
      });
    expect(bodegueroUpdate.status).toBe(403);
  });

  it('asigna un nuevo conjunto de permisos a vendedor y persiste en role_permissions', async () => {
    const adminCookies = await loginAs(`${TEST_EMAIL_PREFIX}admin@unithor.local`);

    const response = await request(app)
      .put(`/api/roles/${vendedorRoleId}/permissions`)
      .set('Cookie', authCookie(adminCookies))
      .set('X-CSRF-Token', adminCookies.csrfToken)
      .send({
        roleId: vendedorRoleId,
        permissionIds: [comercialReadPermissionId, comercialCreatePermissionId],
      });

    expect(response.status).toBe(200);
    expect(response.body.permissions).toHaveLength(2);

    const stored = await RolePermission.findAll({
      where: { roleId: vendedorRoleId },
      order: [['permissionId', 'ASC']],
    });
    expect(stored.map((rp) => rp.permissionId).sort((a, b) => a - b)).toEqual(
      [comercialReadPermissionId, comercialCreatePermissionId].sort((a, b) => a - b),
    );
  });

  it('rechaza actualizar permisos del rol desarrollador', async () => {
    const adminCookies = await loginAs(`${TEST_EMAIL_PREFIX}admin@unithor.local`);

    const response = await request(app)
      .put(`/api/roles/${desarrolladorRoleId}/permissions`)
      .set('Cookie', authCookie(adminCookies))
      .set('X-CSRF-Token', adminCookies.csrfToken)
      .send({
        roleId: desarrolladorRoleId,
        permissionIds: [adminReadPermissionId],
      });

    expect(response.status).toBe(400);
  });

  it('rechaza IDs inexistentes y revierte sin modificar permisos del rol', async () => {
    const adminCookies = await loginAs(`${TEST_EMAIL_PREFIX}admin@unithor.local`);
    const before = await RolePermission.findAll({ where: { roleId: vendedorRoleId } });
    const beforeIds = before.map((rp) => rp.permissionId).sort((a, b) => a - b);

    const response = await request(app)
      .put(`/api/roles/${vendedorRoleId}/permissions`)
      .set('Cookie', authCookie(adminCookies))
      .set('X-CSRF-Token', adminCookies.csrfToken)
      .send({
        roleId: vendedorRoleId,
        permissionIds: [comercialReadPermissionId, 999999],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('Uno o más IDs de permiso no existen');

    const after = await RolePermission.findAll({ where: { roleId: vendedorRoleId } });
    const afterIds = after.map((rp) => rp.permissionId).sort((a, b) => a - b);
    expect(afterIds).toEqual(beforeIds);
  });

  it('refleja cambios inmediatamente en hasPermission por invalidación de caché', async () => {
    const devCookies = await loginAs('dev@unithor.local');

    await request(app)
      .put(`/api/roles/${vendedorRoleId}/permissions`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({
        roleId: vendedorRoleId,
        permissionIds: [comercialReadPermissionId],
      })
      .expect(200);

    expect(await hasPermission(vendedorUserId, 'comercial', 'read')).toBe(true);
    expect(await hasPermission(vendedorUserId, 'admin', 'delete')).toBe(false);

    await request(app)
      .put(`/api/roles/${vendedorRoleId}/permissions`)
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({
        roleId: vendedorRoleId,
        permissionIds: [adminDeletePermissionId],
      })
      .expect(200);

    expect(await hasPermission(vendedorUserId, 'comercial', 'read')).toBe(false);
    expect(await hasPermission(vendedorUserId, 'admin', 'delete')).toBe(true);
  });
});
