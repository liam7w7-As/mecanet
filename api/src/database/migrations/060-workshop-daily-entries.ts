import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

const INDEX = 'workshop_time_requests_client_request_unique';
const hasIndex = async (queryInterface: QueryInterface): Promise<boolean> => {
  const indexes = await queryInterface.showIndex('workshop_time_requests') as unknown as Array<{ name: string }>;
  return indexes.some((index) => index.name === INDEX);
};

export async function up(queryInterface: QueryInterface): Promise<void> {
  const columns = await queryInterface.describeTable('workshop_time_requests');
  if (!columns.client_request_id) {
    await queryInterface.addColumn('workshop_time_requests', 'client_request_id', {
      type: DataTypes.STRING(36), allowNull: true,
    });
  }
  if (!columns.client_request_hash) {
    await queryInterface.addColumn('workshop_time_requests', 'client_request_hash', {
      type: DataTypes.STRING(64), allowNull: true,
    });
  }
  if (!(await hasIndex(queryInterface))) {
    await queryInterface.addIndex('workshop_time_requests', ['client_request_id'], {
      name: INDEX, unique: true,
    });
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const columns = await queryInterface.describeTable('workshop_time_requests');
  if (columns.client_request_id && columns.activity_status) {
    // Old versions must never replay activity already applied by a daily entry.
    await queryInterface.sequelize.query(`UPDATE workshop_time_requests
      SET activity_status = NULL WHERE client_request_id IS NOT NULL`);
  }
  if (await hasIndex(queryInterface)) await queryInterface.removeIndex('workshop_time_requests', INDEX);
  if (columns.client_request_hash) await queryInterface.removeColumn('workshop_time_requests', 'client_request_hash');
  if (columns.client_request_id) await queryInterface.removeColumn('workshop_time_requests', 'client_request_id');
}
