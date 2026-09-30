import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { hashPassword } from '../../utils/password.js';
import {
  getPermissionsForRole,
  hasPermission,
  invalidatePermissionCache,
  updateRolePermissions,
} from '../permission.service.js';

describe('permission.service', () => {
  let devUserId: number;
  let vendedorUserId: number;
  let vendedorRoleId: number;
  let adminUserId: number;

  beforeAll(async () => {
    await sequelize.authenticate();

    let devUser = await User.findOne({
      where: { email: 'dev@unithor.local' },
    });
    if (!devUser) {
      const developerRole = await Role.findOne({ where: { nombre: 'desarrollador' } });
      if (!developerRole) {
        throw new Error('El rol desarrollador no existe en la base de datos');
      }
      devUser = await User.create({
        nombre: 'Desarrollador UNITHOR',
        email: 'dev@unithor.local',
        username: 'dev',
        passwordHash: await hashPassword('Desarrollador2026!'),
        roleId: developerRole.id,
        activo: true,
      });
    }
    devUserId = devUser.id;

    // Obtener rol vendedor
    const vendedorRole = await Role.findOne({ where: { nombre: 'vendedor' } });
    if (!vendedorRole) {
      throw new Error('El rol vendedor no existe en la base de datos');
    }
    vendedorRoleId = vendedorRole.id;

    const adminRole = await Role.findOne({ where: { nombre: 'admin' } });
    if (!adminRole) throw new Error('El rol admin no existe en la base de datos');
    await User.destroy({ where: { email: 'test-admin-reportes@unithor.local' }, force: true });
    const adminUser = await User.create({
      nombre: 'Admin Reportes Temporal',
      email: 'test-admin-reportes@unithor.local',
      passwordHash: '$2b$10$invaliddummypasswordhashforvitest',
      roleId: adminRole.id,
      activo: true,
    });
    adminUserId = adminUser.id;

    // Crear o recuperar usuario temporal de prueba vendedor
    let vendedorUser = await User.findOne({
      where: { email: 'test-vendedor@unithor.local' },
      paranoid: false,
    });
    if (!vendedorUser) {
      vendedorUser = await User.create({
        nombre: 'Test Vendedor',
        email: 'test-vendedor@unithor.local',
        passwordHash: '$2b$10$invaliddummypasswordhashforvitest',
        roleId: vendedorRoleId,
        activo: true,
      });
    } else {
      await vendedorUser.restore();
      await vendedorUser.update({ activo: true, roleId: vendedorRoleId });
    }
    vendedorUserId = vendedorUser.id;

    invalidatePermissionCache();
  });

  afterAll(async () => {
    // Limpiar usuario de test vendedor
    await User.destroy({
      where: { email: 'test-vendedor@unithor.local' },
      force: true,
    });
    await User.destroy({ where: { id: adminUserId }, force: true });
    invalidatePermissionCache();
  });

  describe('desarrollador bypass', () => {
    it('retorna true siempre para rol desarrollador sin importar módulo o acción', async () => {
      const canReadTaller = await hasPermission(devUserId, 'taller', 'read');
      const canDeleteAdmin = await hasPermission(devUserId, 'admin', 'delete');
      const canFake = await hasPermission(
        devUserId,
        'modulo_inventado',
        'accion_inventada',
      );

      expect(canReadTaller).toBe(true);
      expect(canDeleteAdmin).toBe(true);
      expect(canFake).toBe(true);
    });
  });

  it('conserva acceso total para el rol admin', async () => {
    expect(await hasPermission(adminUserId, 'finanzas', 'export')).toBe(true);
    expect(await hasPermission(adminUserId, 'almacen', 'read')).toBe(true);
  });

  it('impide restringir la matriz del rol admin', async () => {
    const admin = await Role.findOne({ where: { nombre: 'admin' } });
    expect(admin).not.toBeNull();
    await expect(updateRolePermissions(admin!.id, [])).rejects.toMatchObject({ statusCode: 400 });
  });

  describe('roles estándar y matriz de permisos', () => {
    it('permite acciones asignadas en la matriz para el rol vendedor', async () => {
      // Vendedor tiene acceso a comercial:read y comercial:create
      const canReadComercial = await hasPermission(
        vendedorUserId,
        'comercial',
        'read',
      );
      expect(canReadComercial).toBe(true);
    });

    it('deniega acciones no asignadas para el rol vendedor', async () => {
      // Vendedor NO tiene permiso para admin:delete
      const canDeleteAdmin = await hasPermission(
        vendedorUserId,
        'admin',
        'delete',
      );
      expect(canDeleteAdmin).toBe(false);
    });

    it('retorna false si el usuario está inactivo', async () => {
      await User.update({ activo: false }, { where: { id: vendedorUserId } });

      const allowed = await hasPermission(vendedorUserId, 'comercial', 'read');
      expect(allowed).toBe(false);

      // Restaurar estado activo
      await User.update({ activo: true }, { where: { id: vendedorUserId } });
    });
  });

  describe('caché en memoria e invalidación', () => {
    it('sirve permisos desde la memoria caché y se puede invalidar', async () => {
      invalidatePermissionCache();

      // Primera consulta: puebla caché
      const res1 = await hasPermission(vendedorUserId, 'comercial', 'read');
      expect(res1).toBe(true);

      // Segunda consulta: debe provenir de caché
      const res2 = await hasPermission(vendedorUserId, 'comercial', 'read');
      expect(res2).toBe(true);

      // Invalidar caché específicamente para el rol
      invalidatePermissionCache(vendedorRoleId);

      // Consulta post-invalidación: re-consulta DB
      const res3 = await hasPermission(vendedorUserId, 'comercial', 'read');
      expect(res3).toBe(true);
    });
  });

  describe('getPermissionsForRole', () => {
    it('retorna la lista completa de permisos para un rol', async () => {
      const permissions = await getPermissionsForRole('bodeguero');
      expect(Array.isArray(permissions)).toBe(true);
      expect(permissions.length).toBeGreaterThan(0);
      expect(permissions.some((p) => p.modulo === 'taller')).toBe(true);
    });

    it('retorna arreglo vacío si el rol no existe', async () => {
      const permissions = await getPermissionsForRole('rol_fantasma');
      expect(permissions).toEqual([]);
    });
  });
});
