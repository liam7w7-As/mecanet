import {
  type DpStageKey,
} from '@unithor/shared';
import {
  AutoIncrement,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Index,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

import { User } from './User.js';
import { WorkOrder } from './WorkOrder.js';
import { WorkOrderItem } from './WorkOrderItem.js';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

export type DpStageStatus = 'pendiente' | 'en_proceso' | 'completado';

@Table({
  tableName: 'work_order_dp_stages',
  timestamps: true,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
  indexes: [{ name: 'work_order_dp_stages_item_stage_unique', fields: ['work_order_item_id', 'stage_index'], unique: true }],
})
export class WorkOrderDpStage extends Model<
  InferAttributes<WorkOrderDpStage>,
  InferCreationAttributes<WorkOrderDpStage>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @ForeignKey(() => WorkOrder)
  @Index('work_order_dp_stages_work_order_idx')
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  declare workOrderId: number;

  @ForeignKey(() => WorkOrderItem)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  declare workOrderItemId: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  declare stageIndex: number;

  @Column({
    type: DataType.STRING(30),
    allowNull: false,
  })
  declare stageKey: DpStageKey;

  @Column({
    type: DataType.STRING(180),
    allowNull: false,
  })
  declare stageLabel: string;

  @Column({ type: DataType.JSON, allowNull: true, get(this: WorkOrderDpStage): string[] | null {
    const value: unknown = this.getDataValue('allowedSpecialties');
    return (typeof value === 'string' ? JSON.parse(value) : value ?? null) as string[] | null;
  } })
  declare allowedSpecialties: CreationOptional<string[] | null>;

  @ForeignKey(() => User)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  declare assignedUserId: number | null;

  @Column({
    type: DataType.STRING(180),
    allowNull: true,
  })
  declare assignedUserName: string | null;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: 'pendiente',
  })
  declare status: CreationOptional<DpStageStatus>;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare startedAt: Date | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare completedAt: Date | null;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare note: string | null;

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => WorkOrder)
  declare workOrder?: WorkOrder;

  @BelongsTo(() => WorkOrderItem)
  declare workOrderItem?: WorkOrderItem;

  @BelongsTo(() => User)
  declare assignedUser?: User | null;
}
