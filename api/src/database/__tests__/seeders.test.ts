import { QueryTypes, Sequelize } from 'sequelize';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as seederRoles from '../seeders/001-roles.js';
import * as seederPermissions from '../seeders/002-permissions.js';
import * as seederRolePermissions from '../seeders/003-role-permissions.js';
import * as seederAdminUser from '../seeders/004-admin-user.js';
import * as seederCatalogItems from '../seeders/005-catalog-items.js';

interface UserRoleRow {
  username: string;
  email: string;
  passwordHash: string;
  roleName: string;
}

const queryCount = async (sequelize: Sequelize, sql: string): Promise<number> => {
  const [row] = await sequelize.query<{ total: number }>(sql, {
    type: QueryTypes.SELECT,
  });
  return Number(row?.total ?? 0);
};

const createSeederTables = async (sequelize: Sequelize): Promise<void> => {
  await sequelize.query(`
    CREATE TABLE roles (
      id INTEGER NOT NULL AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(80) NOT NULL UNIQUE,
      descripcion TEXT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  await sequelize.query(`
    CREATE TABLE permissions (
      id INTEGER NOT NULL AUTO_INCREMENT PRIMARY KEY,
      modulo VARCHAR(50) NOT NULL,
      accion VARCHAR(50) NOT NULL,
      descripcion TEXT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      UNIQUE KEY permissions_modulo_accion_unique (modulo, accion)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  await sequelize.query(`
    CREATE TABLE role_permissions (
      role_id INTEGER NOT NULL,
      permission_id INTEGER NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (role_id, permission_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  await sequelize.query(`
    CREATE TABLE users (
      id INTEGER NOT NULL AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(120) NOT NULL,
      username VARCHAR(80) NULL,
      email VARCHAR(160) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role_id INTEGER NOT NULL,
      activo TINYINT(1) NOT NULL DEFAULT 1,
      deleted_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  await sequelize.query(`
    CREATE TABLE catalog_items (
      id INTEGER NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tipo ENUM('parte', 'estandar', 'especifico') NOT NULL,
      codigo VARCHAR(50) NULL,
      nombre VARCHAR(180) NOT NULL,
      descripcion TEXT NULL,
      precio DECIMAL(12, 2) NOT NULL DEFAULT 0,
      stock INTEGER NOT NULL DEFAULT 0,
      deleted_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
};

describe('Database Base Seeders (isolated schema)', () => {
  const seedersDatabaseName = 'unithor_seeders_test';
  let testSequelize: Sequelize;

  beforeAll(async () => {
    process.env.SEED_ADMIN_EMAIL = 'dev@unithor.local';
    process.env.SEED_ADMIN_USERNAME = 'dev';
    process.env.SEED_ADMIN_PASSWORD = 'Desarrollador2026!';
    process.env.SEED_ADMIN_NAME = 'Desarrollador UNITHOR';

    const adminSequelize = new Sequelize('mysql://root:@localhost:3306/mysql', {
      dialect: 'mysql',
      logging: false,
    });
    await adminSequelize.query(`DROP DATABASE IF EXISTS \`${seedersDatabaseName}\`;`);
    await adminSequelize.query(
      `CREATE DATABASE \`${seedersDatabaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
    );
    await adminSequelize.close();

    testSequelize = new Sequelize(`mysql://root:@localhost:3306/${seedersDatabaseName}`, {
      dialect: 'mysql',
      logging: false,
    });

    await testSequelize.authenticate();
    await createSeederTables(testSequelize);
  });

  afterAll(async () => {
    await testSequelize.close();
    const adminSequelize = new Sequelize('mysql://root:@localhost:3306/mysql', {
      dialect: 'mysql',
      logging: false,
    });
    await adminSequelize.query(`DROP DATABASE IF EXISTS \`${seedersDatabaseName}\`;`);
    await adminSequelize.close();
  });

  it('ejecuta los seeders y verifica los registros iniciales creados', async () => {
    const qi = testSequelize.getQueryInterface();

    await seederRoles.up(qi);
    await seederPermissions.up(qi);
    await seederRolePermissions.up(qi);
    await seederAdminUser.up(qi);
    await seederCatalogItems.up(qi);

    expect(await queryCount(testSequelize, 'SELECT COUNT(*) AS total FROM roles;')).toBe(7);
    expect(await queryCount(testSequelize, 'SELECT COUNT(*) AS total FROM permissions;')).toBe(30);
    expect(
      await queryCount(
        testSequelize,
        `SELECT COUNT(*) AS total
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         WHERE r.nombre = 'desarrollador';`,
      ),
    ).toBe(30);
    expect(
      await queryCount(
        testSequelize,
        `SELECT COUNT(*) AS total
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         WHERE r.nombre = 'bodeguero';`,
      ),
    ).toBe(4);

    const users = await testSequelize.query<UserRoleRow>(
      `SELECT u.username, u.email, u.password_hash AS passwordHash, r.nombre AS roleName
       FROM users u
       JOIN roles r ON r.id = u.role_id;`,
      { type: QueryTypes.SELECT },
    );
    expect(users).toHaveLength(1);
    expect(users[0].username).toBe('dev');
    expect(users[0].email).toBe('dev@unithor.local');
    expect(users[0].roleName).toBe('desarrollador');
    expect(users[0].passwordHash.startsWith('$2b$')).toBe(true);

    const estandarCount = await queryCount(
      testSequelize,
      "SELECT COUNT(*) AS total FROM catalog_items WHERE tipo = 'estandar';",
    );
    const parteCount = await queryCount(
      testSequelize,
      "SELECT COUNT(*) AS total FROM catalog_items WHERE tipo = 'parte';",
    );
    const especificoCount = await queryCount(
      testSequelize,
      "SELECT COUNT(*) AS total FROM catalog_items WHERE tipo = 'especifico';",
    );

    expect(estandarCount).toBe(6);
    expect(parteCount).toBe(5);
    expect(especificoCount).toBe(3);
    expect(estandarCount + parteCount + especificoCount).toBe(14);
  });

  it('ejecuta los seeders una segunda vez y verifica que los conteos NO cambian (idempotencia)', async () => {
    const qi = testSequelize.getQueryInterface();

    await seederRoles.up(qi);
    await seederPermissions.up(qi);
    await seederRolePermissions.up(qi);
    await seederAdminUser.up(qi);
    await seederCatalogItems.up(qi);

    expect(await queryCount(testSequelize, 'SELECT COUNT(*) AS total FROM roles;')).toBe(7);
    expect(await queryCount(testSequelize, 'SELECT COUNT(*) AS total FROM permissions;')).toBe(30);
    expect(await queryCount(testSequelize, 'SELECT COUNT(*) AS total FROM role_permissions;')).toBe(92);
    expect(await queryCount(testSequelize, 'SELECT COUNT(*) AS total FROM users;')).toBe(1);
    expect(await queryCount(testSequelize, 'SELECT COUNT(*) AS total FROM catalog_items;')).toBe(14);
  });

  it('ejecuta down de todos los seeders y verifica que las tablas quedan vacías', async () => {
    const qi = testSequelize.getQueryInterface();

    await seederCatalogItems.down(qi);
    await seederAdminUser.down(qi);
    await seederRolePermissions.down(qi);
    await seederPermissions.down(qi);
    await seederRoles.down(qi);

    expect(await queryCount(testSequelize, 'SELECT COUNT(*) AS total FROM catalog_items;')).toBe(0);
    expect(await queryCount(testSequelize, 'SELECT COUNT(*) AS total FROM users;')).toBe(0);
    expect(await queryCount(testSequelize, 'SELECT COUNT(*) AS total FROM role_permissions;')).toBe(0);
    expect(await queryCount(testSequelize, 'SELECT COUNT(*) AS total FROM permissions;')).toBe(0);
    expect(await queryCount(testSequelize, 'SELECT COUNT(*) AS total FROM roles;')).toBe(0);
  });
});
