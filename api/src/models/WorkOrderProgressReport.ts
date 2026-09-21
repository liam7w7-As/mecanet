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

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'work_order_progress_reports',
  timestamps: false,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
  indexes: [{ name: 'work_order_progress_work_order_created_idx', fields: ['work_order_id', 'created_at'] }],
})
export class WorkOrderProgressReport extends Model<
  InferAttributes<WorkOrderProgressReport>,
  InferCreationAttributes<WorkOrderProgressReport>
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
  declare mechanicId: number | null;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare porcentaje: number;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare comentario: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare bloqueos: string | null;

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  declare createdAt: CreationOptional<Date>;

  @BelongsTo(() => WorkOrder)
  declare workOrder?: WorkOrder;

  @BelongsTo(() => User, 'mechanicId')
  declare mechanic?: User;
}
