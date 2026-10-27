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
import { WorkOrderObservation } from './WorkOrderObservation.js';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'work_order_observation_files',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
  indexes: [
    { name: 'work_order_observation_files_observation_idx', fields: ['observation_id'] },
    { name: 'work_order_observation_files_storage_key_uk', unique: true, fields: ['storage_key'] },
  ],
})
export class WorkOrderObservationFile extends Model<
  InferAttributes<WorkOrderObservationFile>,
  InferCreationAttributes<WorkOrderObservationFile>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @ForeignKey(() => WorkOrderObservation)
  @Column({ type: DataType.INTEGER, allowNull: false, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  declare observationId: number;

  @Column({ type: DataType.STRING(255), allowNull: false })
  declare storageKey: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  declare nombreOriginal: string;

  @Column({ type: DataType.STRING(100), allowNull: false })
  declare mimeType: string;

  @Column({ type: DataType.INTEGER.UNSIGNED, allowNull: false })
  declare sizeBytes: number;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  declare uploadedBy: number | null;

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  declare createdAt: CreationOptional<Date>;

  @BelongsTo(() => WorkOrderObservation)
  declare observation?: WorkOrderObservation;

  @BelongsTo(() => User, 'uploadedBy')
  declare uploader?: User;
}
