import { Sequelize } from 'sequelize-typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CatalogItem,
  Permission,
  Role,
  RolePermission,
  User,
  initModels,
} from '../../models/index.js';
import * as seederRoles from '../seeders/001-roles.js';
import * as seederPermissions from '../seeders/002-permissions.js';
import * as seederRolePermissions from '../seeders/003-role-permissions.js';
import * as seederAdminUser from '../seeders/004-admin-user.js';
import * as seederCatalogItems from '../seeders/005-catalog-items.js';

describe('Database Base Seeders (unithor_test)', () => {
  let testSequelize: Sequelize;

  beforeAll(async () => {
    process.env.SEED_ADMIN_EMAIL = 'dev@unithor.local';
    process.env.SEED_ADMIN_PASSWORD = 'Desarrollador2026!';
    process.env.SEED_ADMIN_NAME = 'Desarrollador UNITHOR';

    testSequelize = new Sequelize('mysql://root:@localhost:3306/unithor_test', {
      dialect: 'mysql',
      logging: false,
      define: {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        timestamps: true,
        underscored: true,
      },
    });

    initModels(testSequelize);
    await testSequelize.authenticate();

    // Limpiar tablas antes de la suite
    const qi = testSequelize.getQueryInterface();
    await seederCatalogItems.down(qi);
    await seederAdminUser.down(qi);
    await seederRolePermissions.down(qi);
    await seederPermissions.down(qi);
    await seederRoles.down(qi);
  });

  afterAll(async () => {
    await testSequelize.close();
  });

  it('ejecuta los seeders y verifica los registros iniciales creados', async () => {
    const qi = testSequelize.getQueryInterface();

    await seederRoles.up(qi);
    await seederPermissions.up(qi);
    await seederRolePermissions.up(qi);
    await seederAdminUser.up(qi);
    await seederCatalogItems.up(qi);

    // 1. Verificar 5 roles
    const rolesCount = await Role.count();
    expect(rolesCount).toBe(5);

    // 2. Verificar 24 permisos
    const permissionsCount = await Permission.count();
    expect(permissionsCount).toBe(24);

    // 3. Verificar que desarrollador tiene 24 permisos asignados
    const devRole = await Role.findOne({
      where: { nombre: 'desarrollador' },
      include: [{ model: Permission }],
    });
    expect(devRole).not.toBeNull();
    expect(devRole?.permissions?.length).toBe(24);

    // 4. Verificar que bodeguero tiene exactamente 4 permisos
    const bodegueroRole = await Role.findOne({
      where: { nombre: 'bodeguero' },
      include: [{ model: Permission }],
    });
    expect(bodegueroRole).not.toBeNull();
    expect(bodegueroRole?.permissions?.length).toBe(4);

    // 5. Verificar que existe 1 usuario con rol desarrollador y password_hash empieza con $2b$
    const users = await User.findAll({
      include: [{ model: Role }],
    });
    expect(users.length).toBe(1);
    expect(users[0].email).toBe('dev@unithor.local');
    expect(users[0].role?.nombre).toBe('desarrollador');
    expect(users[0].passwordHash.startsWith('$2b$')).toBe(true);

    // 6. Verificar 6 items estandar, 5 parte y 3 especifico
    const estandarCount = await CatalogItem.count({ where: { tipo: 'estandar' } });
    const parteCount = await CatalogItem.count({ where: { tipo: 'parte' } });
    const especificoCount = await CatalogItem.count({ where: { tipo: 'especifico' } });

    expect(estandarCount).toBe(6);
    expect(parteCount).toBe(5);
    expect(especificoCount).toBe(3);
    expect(estandarCount + parteCount + especificoCount).toBe(14);
  });

  it('ejecuta los seeders una segunda vez y verifica que los conteos NO cambian (idempotencia)', async () => {
    const qi = testSequelize.getQueryInterface();

    // Segunda ejecución consecutiva
    await seederRoles.up(qi);
    await seederPermissions.up(qi);
    await seederRolePermissions.up(qi);
    await seederAdminUser.up(qi);
    await seederCatalogItems.up(qi);

    expect(await Role.count()).toBe(5);
    expect(await Permission.count()).toBe(24);
    expect(await RolePermission.count()).toBe(72);
    expect(await User.count()).toBe(1);
    expect(await CatalogItem.count()).toBe(14);
  });

  it('ejecuta down de todos los seeders y verifica que las tablas quedan vacías', async () => {
    const qi = testSequelize.getQueryInterface();

    await seederCatalogItems.down(qi);
    await seederAdminUser.down(qi);
    await seederRolePermissions.down(qi);
    await seederPermissions.down(qi);
    await seederRoles.down(qi);

    expect(await CatalogItem.count()).toBe(0);
    expect(await User.count()).toBe(0);
    expect(await RolePermission.count()).toBe(0);
    expect(await Permission.count()).toBe(0);
    expect(await Role.count()).toBe(0);
  });
});
