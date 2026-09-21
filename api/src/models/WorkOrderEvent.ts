import { WORK_ORDER_EVENT_TYPES } from '@unithor/shared';
import {
  AutoIncrement,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

import { User } from './User.js';
import { WorkOrder } from './WorkOrder.js';

import type { WorkOrderEventType } from '@unithor/shared';
import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'work_order_events',
  timestamps: false,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
  indexes: [
    { name: 'work_order_events_work_order_created_idx', fields: ['work_order_id', 'created_at'] },
    { name: 'work_order_events_actor_user_idx', fields: ['actor_user_id'] },
  ],
})
export class WorkOrderEvent extends Model<
  InferAttributes<WorkOrderEvent>,
  InferCreationAttributes<WorkOrderEvent>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @ForeignKey(() => WorkOrder)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare workOrderId: number;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare actorUserId: number | null;

  @Column({ type: DataType.ENUM(...WORK_ORDER_EVENT_TYPES), allowNull: false })
  declare tipo: WorkOrderEventType;

  @Column({ type: DataType.STRING(255), allowNull: false })
  declare descripcion: string;

  @Column({ type: DataType.JSON, allowNull: true })
  declare metadata: Record<string, unknown> | null;

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  declare createdAt: CreationOptional<Date>;

  @BelongsTo(() => WorkOrder)
  declare workOrder?: WorkOrder;

  @BelongsTo(() => User, 'actorUserId')
  declare actor?: User;
}
