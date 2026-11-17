import { AutoIncrement, BeforeBulkDestroy, BeforeBulkUpdate, BeforeDestroy, BeforeUpdate, Column, DataType, ForeignKey, Model, PrimaryKey, Table } from 'sequelize-typescript';

import { User } from './User.js';
import { WorkOrder } from './WorkOrder.js';
import { WorkOrderItem } from './WorkOrderItem.js';

import type { WorkshopCommercialSnapshot, WorkshopCommercialReviewRecord } from '@unithor/shared';
import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

/** Append-only operational comparison. It never posts a charge, payment or payroll entry. */
@Table({ tableName: 'workshop_commercial_reviews', timestamps: false, underscored: true,
  indexes: [{ fields: ['work_order_id', 'created_at'] }, { fields: ['work_order_item_id', 'created_at'] }] })
export class WorkshopCommercialReview extends Model<InferAttributes<WorkshopCommercialReview>, InferCreationAttributes<WorkshopCommercialReview>> {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) declare id: CreationOptional<number>;
  @ForeignKey(() => WorkOrder) @Column({ type: DataType.INTEGER, allowNull: false }) declare workOrderId: number;
  @ForeignKey(() => WorkOrderItem) @Column({ type: DataType.INTEGER, allowNull: false }) declare workOrderItemId: number;
  @Column({ type: DataType.STRING(30), allowNull: false }) declare reason: WorkshopCommercialReviewRecord['reason'];
  @Column({ type: DataType.TEXT, allowNull: false }) declare note: string;
  @ForeignKey(() => User) @Column({ type: DataType.INTEGER, allowNull: true }) declare createdBy: number | null;
  @Column({ type: DataType.STRING(180), allowNull: false }) declare createdByName: string;
  @Column({ type: DataType.JSON, allowNull: false,
    get(this: WorkshopCommercialReview): WorkshopCommercialSnapshot {
      const stored: unknown = this.getDataValue('snapshot');
      return (typeof stored === 'string' ? JSON.parse(stored) : stored) as WorkshopCommercialSnapshot;
    } }) declare snapshot: WorkshopCommercialSnapshot;
  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW }) declare createdAt: CreationOptional<Date>;

  @BeforeUpdate @BeforeDestroy @BeforeBulkUpdate @BeforeBulkDestroy
  static retainHistory(): never { throw new Error('Las revisiones comerciales son históricas; registra una nueva revisión'); }
}
