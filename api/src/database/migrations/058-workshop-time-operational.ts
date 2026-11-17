import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const columns = await queryInterface.describeTable('workshop_time_requests');
  for (const name of ['assignment_id', 'state_event_id']) {
    if (!columns[name]) await queryInterface.addColumn('workshop_time_requests', name, {
      type: DataTypes.INTEGER, allowNull: true,
    });
  }
  if (!columns.activity_status) await queryInterface.addColumn('workshop_time_requests', 'activity_status', {
    type: DataTypes.ENUM('en_proceso', 'completado'), allowNull: true,
  });
  // Keep attribution for pending requests created before this migration, including
  // a revoked assignment. Never attach an old request to a later reassignment.
  await queryInterface.sequelize.query(`UPDATE workshop_time_requests r
    SET r.assignment_id = (SELECT a.id FROM work_order_item_assignments a
      WHERE a.work_order_item_id = r.work_order_item_id AND a.user_id = r.user_id
        AND a.created_at <= r.started_at
      ORDER BY a.created_at DESC, a.id DESC LIMIT 1)
    WHERE r.kind = 'manual' AND r.assignment_id IS NULL`);
  // Legacy requests have no declared activity, so approving them changes only time.
  for (const table of ['workshop_time_requests', 'work_order_item_sessions']) {
    const definition = await queryInterface.describeTable(table);
    if (definition.duration_minutes.type.toUpperCase() !== 'DECIMAL(14,8)') {
      await queryInterface.changeColumn(table, 'duration_minutes', {
        type: DataTypes.DECIMAL(14, 8), allowNull: table === 'work_order_item_sessions',
      });
    }
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Keep fractional time: reverting the feature must not truncate accepted work.
  const columns = await queryInterface.describeTable('workshop_time_requests');
  for (const name of ['activity_status', 'state_event_id', 'assignment_id']) {
    if (columns[name]) await queryInterface.removeColumn('workshop_time_requests', name);
  }
}
