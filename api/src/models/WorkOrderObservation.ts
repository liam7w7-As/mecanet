import {
  AutoIncrement,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

import { User } from './User.js';
import { WorkOrder } from './WorkOrder.js';
import { WorkOrderItem } from './WorkOrderItem.js';
import { WorkOrderObservationFile } from './WorkOrderObservationFile.js';
import { WorkOrderProgressReport } from './WorkOrderProgressReport.js';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'work_order_observations',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
  indexes: [
    { name: 'work_order_observations_order_created_idx', fields: ['work_order_id', 'created_at'] },
    { name: 'work_order_observations_item_idx', fields: ['work_order_item_id'] },
  ],
})
export class WorkOrderObservation extends Model<
  InferAttributes<WorkOrderObservation>,
  InferCreationAttributes<WorkOrderObservation>
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

  @ForeignKey(() => WorkOrderProgressReport)
  @Column({ type: DataType.INTEGER, allowNull: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  declare progressReportId: number | null;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  declare authorId: number | null;

  @Column({ type: DataType.STRING(180), allowNull: true })
  declare authorName: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare texto: string | null;

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  declare createdAt: CreationOptional<Date>;

  @BelongsTo(() => WorkOrder)
  declare workOrder?: WorkOrder;

  @BelongsTo(() => WorkOrderItem)
  declare item?: WorkOrderItem;

  @BelongsTo(() => WorkOrderProgressReport)
  declare progressReport?: WorkOrderProgressReport;

  @BelongsTo(() => User, 'authorId')
  declare author?: User;

  @HasMany(() => WorkOrderObservationFile)
  declare files?: WorkOrderObservationFile[];
}
