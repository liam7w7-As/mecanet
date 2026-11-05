import { QueryTypes } from 'sequelize';

import { sequelize } from '../config/database.js';

interface WorkActivityRow {
  workOrderId: number;
  lastWorkActivityAt: string;
}

/** Actual workshop activity, grouped for the current page; administrative edits do not qualify. */
export const getLastWorkActivity = async (ids: number[]): Promise<Map<number, Date>> => {
  if (ids.length === 0) return new Map();
  const rows = await sequelize.query<WorkActivityRow>(`
    SELECT work_order_id AS workOrderId,
      DATE_FORMAT(MAX(activity_at), '%Y-%m-%dT%H:%i:%sZ') AS lastWorkActivityAt
    FROM (
      SELECT work_order_id, MAX(created_at) AS activity_at
      FROM work_order_item_progress_events
      WHERE work_order_id IN (:ids) AND source <> 'migracion'
        AND (
          (to_status IN ('en_proceso', 'completado')
            AND (from_status IS NULL OR from_status <> to_status)
            AND (from_status IS NULL OR from_status <> 'completado'))
          OR horas_delta > 0
        )
      GROUP BY work_order_id
      UNION ALL
      SELECT work_order_id, MAX(created_at) AS activity_at
      FROM work_order_progress_reports
      WHERE work_order_id IN (:ids)
      GROUP BY work_order_id
      UNION ALL
      SELECT work_order_id, MAX(COALESCE(ended_at, started_at)) AS activity_at
      FROM work_order_item_sessions
      WHERE work_order_id IN (:ids)
        AND (kind = 'cronometro' OR (kind = 'ajuste' AND duration_minutes > 0))
      GROUP BY work_order_id
    ) AS work_activity
    GROUP BY work_order_id
  `, { replacements: { ids }, type: QueryTypes.SELECT });
  return new Map(rows.map((row) => [Number(row.workOrderId), new Date(row.lastWorkActivityAt)]));
};
