import {
  WORK_ORDER_LABOR_CLOSE_REASONS,
  WORK_ORDER_LABOR_SESSION_KINDS,
  WORK_ORDER_LABOR_SESSION_STATUS,
} from '@unithor/shared';
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
import { WorkOrderItem } from './WorkOrderItem.js';

import type {
  WorkOrderLaborCloseReason,
  WorkOrderLaborSessionKind,
  WorkOrderLaborSessionStatus,
} from '@unithor/shared';
import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'work_order_item_sessions',
  timestamps: true,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
  indexes: [
    { name: 'work_order_item_sessions_item_status_idx', fields: ['work_order_item_id', 'status'] },
    { name: 'work_order_item_sessions_user_status_idx', fields: ['user_id', 'status'] },
    { name: 'work_order_item_sessions_order_started_idx', fields: ['work_order_id', 'started_at'] },
  ],
})
export class WorkOrderItemSession extends Model<
  InferAttributes<WorkOrderItemSession>,
  InferCreationAttributes<WorkOrderItemSession>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @ForeignKey(() => WorkOrder)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare workOrderId: number;

  @ForeignKey(() => WorkOrderItem)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare workOrderItemId: number;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare userId: number | null;

  @Column({ type: DataType.STRING(180), allowNull: true })
  declare userName: string | null;

  @Column({ type: DataType.ENUM(...WORK_ORDER_LABOR_SESSION_KINDS), allowNull: false, defaultValue: 'cronometro' })
  declare kind: CreationOptional<WorkOrderLaborSessionKind>;

  @Column({ type: DataType.ENUM(...WORK_ORDER_LABOR_SESSION_STATUS), allowNull: false, defaultValue: 'abierta' })
  declare status: CreationOptional<WorkOrderLaborSessionStatus>;

  @Column({ type: DataType.DATE, allowNull: false })
  declare startedAt: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  declare endedAt: Date | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare durationMinutes: number | null;

  @Column({ type: DataType.ENUM(...WORK_ORDER_LABOR_CLOSE_REASONS), allowNull: true })
  declare closeReason: WorkOrderLaborCloseReason | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare note: string | null;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare createdBy: number | null;

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => WorkOrder)
  declare workOrder?: WorkOrder;

  @BelongsTo(() => WorkOrderItem)
  declare item?: WorkOrderItem;

  @BelongsTo(() => User, 'userId')
  declare user?: User;

  @BelongsTo(() => User, 'createdBy')
  declare creator?: User;
}
