import {
  WORK_ORDER_INSPECTION_PHOTO_SLOTS,
  type WorkOrderInspectionPhotoSlot,
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
import { WorkOrderInspection } from './WorkOrderInspection.js';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'work_order_inspection_photos',
  timestamps: true,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
})
export class WorkOrderInspectionPhoto extends Model<
  InferAttributes<WorkOrderInspectionPhoto>,
  InferCreationAttributes<WorkOrderInspectionPhoto>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @ForeignKey(() => WorkOrderInspection)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare inspectionId: number;

  @Column({ type: DataType.ENUM(...WORK_ORDER_INSPECTION_PHOTO_SLOTS), allowNull: false })
  declare slot: WorkOrderInspectionPhotoSlot;

  @Index({ unique: true })
  @Column({ type: DataType.STRING(255), allowNull: false })
  declare storageKey: string;

  @Column({ type: DataType.STRING(50), allowNull: false })
  declare mimeType: string;

  @Column({ type: DataType.INTEGER.UNSIGNED, allowNull: false })
  declare sizeBytes: number;

  @Column({ type: DataType.STRING(64), allowNull: false })
  declare sha256: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare uploadedBy: number | null;

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => WorkOrderInspection)
  declare inspection?: WorkOrderInspection;

  @BelongsTo(() => User, 'uploadedBy')
  declare uploader?: User;
}
