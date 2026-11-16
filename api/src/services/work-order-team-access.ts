import { QueryTypes } from 'sequelize';

import { sequelize } from '../config/database.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderItem } from '../models/WorkOrderItem.js';
import { WorkOrderItemAssignment } from '../models/WorkOrderItemAssignment.js';

import type { Transaction } from 'sequelize';

export const isAssignedToItem = async (item: WorkOrderItem, order: WorkOrder, userId: number, transaction?: Transaction): Promise<boolean> => {
  const rows = await WorkOrderItemAssignment.findAll({ where: { workOrderItemId: item.id }, attributes: ['userId', 'active'], transaction });
  return item.teamManaged ? rows.some((row) => row.active && row.userId === userId)
    : (item.assignedUserId ?? order.assignedMechanicId) === userId;
};

/** Explicit teams supersede the legacy order-wide responsible, including after revocation. */
export const getAssignedOrderIds = async (userId: number, transaction?: Transaction, options?: { activeOnly?: boolean; limit?: number }): Promise<number[]> => {
  const rows = await sequelize.query<{ id: number }>(`
    SELECT DISTINCT wo.id FROM work_orders wo
    LEFT JOIN work_order_items wi ON wi.work_order_id = wo.id
    WHERE wo.deleted_at IS NULL AND (
      (wo.assigned_mechanic_id = :userId AND NOT EXISTS (SELECT 1 FROM work_order_items managed WHERE managed.work_order_id = wo.id AND managed.team_managed = 1)) OR
      (wi.team_managed = 1 AND EXISTS (SELECT 1 FROM work_order_item_assignments a
              WHERE a.work_order_item_id = wi.id AND a.active = 1 AND a.user_id = :userId))
      OR (COALESCE(wi.team_managed, 0) = 0
          AND COALESCE(wi.assigned_user_id, wo.assigned_mechanic_id) = :userId)
    ) ${options?.activeOnly ? "AND wo.estado NOT IN ('entregada', 'cancelada')" : ''}
    ${options?.limit ? 'LIMIT :limit' : ''}`, { replacements: { userId, ...(options?.limit ? { limit: options.limit } : {}) }, type: QueryTypes.SELECT, transaction });
  return rows.map((row) => Number(row.id));
};
