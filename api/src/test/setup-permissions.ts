import { sequelize } from '../config/database.js';
import { up as seedRolePermissions } from '../database/seeders/003-role-permissions.js';

/**
 * Permission suites temporarily replace the role matrix. If a run is stopped,
 * their afterAll cleanup cannot restore it. Start each run from the seed matrix
 * in the test database; application databases and runtime RBAC are untouched.
 */
export default async function setup(): Promise<void> {
  if (sequelize.getDatabaseName() !== 'unithor_test') {
    throw new Error('Permission fixtures require unithor_test');
  }
  try {
    const queryInterface = sequelize.getQueryInterface();
    await queryInterface.bulkDelete('role_permissions', {});
    await seedRolePermissions(queryInterface);
  } finally {
    await sequelize.close();
  }
}
