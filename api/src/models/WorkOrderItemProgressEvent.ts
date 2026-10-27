import { ITEM_OPERATIONAL_STATUS } from '@unithor/shared';
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
import { WorkOrderItemSession } from './WorkOrderItemSession.js';
import { WorkOrderProgressReport } from './WorkOrderProgressReport.js';

import type { ItemOperationalStatus } from '@unithor/shared';
import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'work_order_item_progress_events',
  timestamps: false,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
  indexes: [
    { name: 'work_order_item_events_order_date_idx', fields: ['work_order_id', 'fecha_efectiva'] },
    { name: 'work_order_item_events_item_created_idx', fields: ['work_order_item_id', 'created_at'] },
    { name: 'work_order_item_events_user_date_idx', fields: ['assigned_user_id', 'fecha_efectiva'] },
  ],
})
export class WorkOrderItemProgressEvent extends Model<
  InferAttributes<WorkOrderItemProgressEvent>,
  InferCreationAttributes<WorkOrderItemProgressEvent>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @ForeignKey(() => WorkOrder)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare workOrderId: number;

  @ForeignKey(() => WorkOrderItem)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare workOrderItemId: number | null;

  @Column({ type: DataType.STRING(255), allowNull: false })
  declare itemDescripcion: string;

  @Column({ type: DataType.ENUM(...ITEM_OPERATIONAL_STATUS), allowNull: true })
  declare fromStatus: ItemOperationalStatus | null;

  @Column({ type: DataType.ENUM(...ITEM_OPERATIONAL_STATUS), allowNull: false })
  declare toStatus: ItemOperationalStatus;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare performedByUserId: number | null;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare assignedUserId: number | null;

  @Column({ type: DataType.DECIMAL(6, 2), allowNull: true })
  declare horasEstimadas: number | null;

  @Column({ type: DataType.DECIMAL(6, 2), allowNull: true })
  declare horasReales: number | null;

  @Column({ type: DataType.DECIMAL(7, 2), allowNull: false, defaultValue: 0 })
  declare horasDelta: CreationOptional<number>;

  @Column({ type: DataType.DATEONLY, allowNull: false })
  declare fechaEfectiva: string;

  @ForeignKey(() => WorkOrderProgressReport)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare progressReportId: number | null;

  @ForeignKey(() => WorkOrderItemSession)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare sessionId: number | null;

  @Column({
    type: DataType.ENUM('check', 'reverso', 'ajuste', 'migracion'),
    allowNull: false,
    defaultValue: 'check',
  })
  declare source: CreationOptional<'check' | 'reverso' | 'ajuste' | 'migracion'>;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare note: string | null;

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  declare createdAt: CreationOptional<Date>;

  @BelongsTo(() => WorkOrder)
  declare workOrder?: WorkOrder;

  @BelongsTo(() => WorkOrderItem)
  declare item?: WorkOrderItem;

  @BelongsTo(() => WorkOrderProgressReport)
  declare progressReport?: WorkOrderProgressReport;

  @BelongsTo(() => WorkOrderItemSession)
  declare session?: WorkOrderItemSession;

  @BelongsTo(() => User, 'performedByUserId')
  declare performedBy?: User;

  @BelongsTo(() => User, 'assignedUserId')
  declare assignedUser?: User;
}
