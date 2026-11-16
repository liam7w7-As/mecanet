import { AutoIncrement, BeforeBulkDestroy, BeforeBulkUpdate, BeforeDestroy, BeforeUpdate, Column, DataType, ForeignKey, Model, PrimaryKey, Table } from 'sequelize-typescript';

import { User } from './User.js';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

/** Every correction appends a version; the largest version is effective. */
@Table({ indexes: [{ name: 'workshop_exceptions_version_unique', fields: ['user_id', 'date', 'version'], unique: true }], tableName: 'workshop_schedule_exceptions', timestamps: true, updatedAt: false, underscored: true, charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' })
export class WorkshopScheduleException extends Model<InferAttributes<WorkshopScheduleException>, InferCreationAttributes<WorkshopScheduleException>> {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) declare id: CreationOptional<number>;
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false }) declare userId: number;
  @Column({ type: DataType.DATEONLY, allowNull: false }) declare date: string;
  @Column({ type: DataType.INTEGER, allowNull: false }) declare version: number;
  @Column({ type: DataType.BOOLEAN, allowNull: false }) declare dayOff: boolean;
  @Column({ type: DataType.STRING(5), allowNull: true }) declare start: string | null;
  @Column({ type: DataType.STRING(5), allowNull: true }) declare end: string | null;
  @Column({ type: DataType.STRING(1000), allowNull: false }) declare reason: string;
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true }) declare createdBy: number | null;
  @Column(DataType.DATE) declare createdAt: CreationOptional<Date>;

  @BeforeUpdate @BeforeBulkUpdate @BeforeDestroy @BeforeBulkDestroy
  static rejectHistoryRewrite(): never { throw new Error('Las excepciones son históricas: registra una nueva versión'); }
}
