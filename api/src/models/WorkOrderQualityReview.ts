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

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

/** Append-only audit rows. A null item identifies a final OT confirmation. */
@Table({
  tableName: 'work_order_quality_reviews',
  timestamps: false,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
  indexes: [
    {
      name: 'work_order_quality_reviews_order_created_idx',
      fields: ['work_order_id', 'created_at'],
    },
    {
      name: 'work_order_quality_reviews_item_created_idx',
      fields: ['work_order_item_id', 'created_at'],
    },
  ],
})
export class WorkOrderQualityReview extends Model<
  InferAttributes<WorkOrderQualityReview>,
  InferCreationAttributes<WorkOrderQualityReview>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @ForeignKey(() => WorkOrder)
  @Column({ type: DataType.INTEGER, allowNull: false, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  declare workOrderId: number;

  @ForeignKey(() => WorkOrderItem)
  @Column({ type: DataType.INTEGER, allowNull: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  declare workOrderItemId: number | null;

  @Column({ type: DataType.ENUM('aprobado', 'rechazado'), allowNull: false })
  declare decision: 'aprobado' | 'rechazado';

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  declare reviewedBy: number | null;

  @Column({ type: DataType.STRING(180), allowNull: false })
  declare reviewerName: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare note: string | null;

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  declare createdAt: CreationOptional<Date>;

  @BelongsTo(() => WorkOrder)
  declare workOrder?: WorkOrder;

  @BelongsTo(() => WorkOrderItem)
  declare item?: WorkOrderItem;

  @BelongsTo(() => User, 'reviewedBy')
  declare reviewer?: User;
}
