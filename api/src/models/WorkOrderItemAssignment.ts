import { AutoIncrement, Column, DataType, ForeignKey, Model, PrimaryKey, Table } from 'sequelize-typescript';

import { User } from './User.js';
import { WorkOrder } from './WorkOrder.js';
import { WorkOrderItem } from './WorkOrderItem.js';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

/** Historical rows are retained on reassignment; rates are snapshots, not live catalog prices. */
@Table({ tableName: 'work_order_item_assignments', timestamps: true, underscored: true,
  indexes: [{ fields: ['work_order_item_id', 'active'] }, { fields: ['user_id', 'active'] }] })
export class WorkOrderItemAssignment extends Model<InferAttributes<WorkOrderItemAssignment>, InferCreationAttributes<WorkOrderItemAssignment>> {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) declare id: CreationOptional<number>;
  @ForeignKey(() => WorkOrder) @Column({ type: DataType.INTEGER, allowNull: false }) declare workOrderId: number;
  @ForeignKey(() => WorkOrderItem) @Column({ type: DataType.INTEGER, allowNull: false }) declare workOrderItemId: number;
  @ForeignKey(() => User) @Column({ type: DataType.INTEGER, allowNull: false }) declare userId: number;
  @Column({ type: DataType.STRING(180), allowNull: false }) declare userName: string;
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true }) declare active: CreationOptional<boolean>;
  @Column({ type: DataType.INTEGER, allowNull: true }) declare specialtyId: number | null;
  @Column({ type: DataType.STRING(120), allowNull: true }) declare specialtyName: string | null;
  @Column({ type: DataType.INTEGER, allowNull: true }) declare rateId: number | null;
  @Column({ type: DataType.DECIMAL(12, 2), allowNull: true }) declare costHourly: number | null;
  @Column({ type: DataType.DECIMAL(12, 2), allowNull: true }) declare saleHourly: number | null;
  @Column({ type: DataType.DECIMAL(7, 2), allowNull: true }) declare estimatedHours: number | null;
  @Column({ type: DataType.DECIMAL(7, 2), allowNull: true }) declare originalEstimatedHours: number | null;
  @Column({ type: DataType.DATE, allowNull: true }) declare completedAt: CreationOptional<Date | null>;
  @Column({ type: DataType.INTEGER, allowNull: false }) declare createdBy: number;
  @Column(DataType.DATE) declare createdAt: CreationOptional<Date>;
  @Column(DataType.DATE) declare updatedAt: CreationOptional<Date>;
}
