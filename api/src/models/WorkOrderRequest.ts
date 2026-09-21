import { WORK_ORDER_REQUEST_STATUS, WORK_ORDER_REQUEST_TYPES } from '@unithor/shared';
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

import { CatalogItem } from './CatalogItem.js';
import { User } from './User.js';
import { WorkOrder } from './WorkOrder.js';
import { WorkOrderItem } from './WorkOrderItem.js';

import type { WorkOrderRequestStatus, WorkOrderRequestType } from '@unithor/shared';
import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'work_order_requests',
  timestamps: true,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
  indexes: [
    { name: 'work_order_requests_work_order_status_idx', fields: ['work_order_id', 'estado'] },
    { name: 'work_order_requests_requested_by_idx', fields: ['requested_by'] },
  ],
})
export class WorkOrderRequest extends Model<
  InferAttributes<WorkOrderRequest>,
  InferCreationAttributes<WorkOrderRequest>
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

  @ForeignKey(() => CatalogItem)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare catalogItemId: number | null;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare requestedBy: number | null;

  @Column({ type: DataType.ENUM(...WORK_ORDER_REQUEST_TYPES), allowNull: false })
  declare tipo: WorkOrderRequestType;

  @Column({
    type: DataType.ENUM(...WORK_ORDER_REQUEST_STATUS),
    allowNull: false,
    defaultValue: 'pendiente',
  })
  declare estado: CreationOptional<WorkOrderRequestStatus>;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare motivo: string;

  @Column({ type: DataType.DECIMAL(10, 2), allowNull: true })
  declare cantidad: number | null;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: true })
  declare precioSugerido: number | null;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: true })
  declare precioAprobado: number | null;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare reviewedBy: number | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare reviewNote: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare reviewedAt: Date | null;

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => WorkOrder)
  declare workOrder?: WorkOrder;

  @BelongsTo(() => WorkOrderItem)
  declare workOrderItem?: WorkOrderItem;

  @BelongsTo(() => CatalogItem)
  declare catalogItem?: CatalogItem;

  @BelongsTo(() => User, 'requestedBy')
  declare requester?: User;

  @BelongsTo(() => User, 'reviewedBy')
  declare reviewer?: User;
}
