import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import {
  getPermissionsForRole,
  hasPermission,
  invalidatePermissionCache,
} from '../permission.service.js';

describe('permission.service', () => {
  let devUserId: number;
  let vendedorUserId: number;
  let vendedorRoleId: number;

  beforeAll(async () => {
    await sequelize.authenticate();

    // Obtener usuario desarrollador existente
    const devUser = await User.findOne({
      where: { email: 'dev@unithor.local' },
    });
    if (!devUser) {
      throw new Error(
        'El usuario desarrollador base no existe en unithor_test. Ejecuta npm run db:seed.',
      );
    }
    devUserId = devUser.id;

    // Obtener rol vendedor
    const vendedorRole = await Role.findOne({ where: { nombre: 'vendedor' } });
    if (!vendedorRole) {
      throw new Error('El rol vendedor no existe en la base de datos');
    }
    vendedorRoleId = vendedorRole.id;

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
