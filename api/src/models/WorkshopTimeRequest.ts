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

import type { WorkshopTimeRequestKind, WorkshopTimeRequestStatus } from '@unithor/shared';
import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'workshop_time_requests',
  timestamps: true,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
  indexes: [
    {
      name: 'workshop_time_requests_user_status_start_idx',
      fields: ['user_id', 'status', 'started_at'],
    },
    { name: 'workshop_time_requests_source_status_idx', fields: ['source_session_id', 'status'] },
  ],
})
export class WorkshopTimeRequest extends Model<
  InferAttributes<WorkshopTimeRequest>,
  InferCreationAttributes<WorkshopTimeRequest>
> {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) declare id: CreationOptional<number>;
  @Column({ type: DataType.ENUM('manual', 'correction'), allowNull: false })
  declare kind: WorkshopTimeRequestKind;
  @Column({
    type: DataType.ENUM('pendiente', 'aprobada', 'rechazada'),
    allowNull: false,
    defaultValue: 'pendiente',
  })
  declare status: CreationOptional<WorkshopTimeRequestStatus>;
  @ForeignKey(() => WorkOrder)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare workOrderId: number;
  @ForeignKey(() => WorkOrderItem)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare workOrderItemId: number;
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare userId: number;
  @Column({ type: DataType.STRING(180), allowNull: false }) declare userName: string;
  @ForeignKey(() => WorkOrderItemSession)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare sourceSessionId: number | null;
  @ForeignKey(() => WorkOrderItemSession)
  @Column({ type: DataType.INTEGER, allowNull: true, unique: true })
  declare replacementSessionId: number | null;
  @Column({ type: DataType.DATE, allowNull: false }) declare startedAt: Date;
  @Column({ type: DataType.DATE, allowNull: false }) declare endedAt: Date;
  @Column({ type: DataType.INTEGER, allowNull: false }) declare durationMinutes: number;
  @Column({ type: DataType.TEXT, allowNull: false }) declare note: string;
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare createdBy: number;
  @ForeignKey(() => User) @Column({ type: DataType.INTEGER, allowNull: true }) declare reviewedBy:
    number | null;
  @Column({ type: DataType.DATE, allowNull: true }) declare reviewedAt: Date | null;
  @Column({ type: DataType.TEXT, allowNull: true }) declare reviewNote: string | null;
  @Column(DataType.DATE) declare createdAt: CreationOptional<Date>;
  @Column(DataType.DATE) declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => WorkOrder) declare workOrder?: WorkOrder;
  @BelongsTo(() => WorkOrderItem) declare item?: WorkOrderItem;
  @BelongsTo(() => User, 'userId') declare worker?: User;
  @BelongsTo(() => User, 'createdBy') declare creator?: User;
  @BelongsTo(() => User, 'reviewedBy') declare reviewer?: User;
  @BelongsTo(() => WorkOrderItemSession, 'sourceSessionId')
  declare sourceSession?: WorkOrderItemSession;
  @BelongsTo(() => WorkOrderItemSession, 'replacementSessionId')
  declare replacementSession?: WorkOrderItemSession;
}
