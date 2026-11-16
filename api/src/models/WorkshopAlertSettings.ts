import { Column, DataType, ForeignKey, Model, PrimaryKey, Table } from 'sequelize-typescript';

import { User } from './User.js';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

/** Singleton id=1. No row means both tolerance percentages are zero. */
@Table({
  tableName: 'workshop_alert_settings',
  timestamps: true,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
})
export class WorkshopAlertSettings extends Model<
  InferAttributes<WorkshopAlertSettings>,
  InferCreationAttributes<WorkshopAlertSettings>
> {
  @PrimaryKey @Column({ type: DataType.INTEGER, validate: { isIn: [[1]] } }) declare id: number;
  @Column({
    type: DataType.DECIMAL(7, 2),
    allowNull: false,
    defaultValue: 0,
    validate: { min: 0, max: 1000 },
  })
  declare timeTolerancePercent: CreationOptional<number>;
  @Column({
    type: DataType.DECIMAL(7, 2),
    allowNull: false,
    defaultValue: 0,
    validate: { min: 0, max: 1000 },
  })
  declare commercialTolerancePercent: CreationOptional<number>;
  @ForeignKey(() => User) @Column({ type: DataType.INTEGER, allowNull: true }) declare updatedBy:
    number | null;
  @Column(DataType.DATE) declare createdAt: CreationOptional<Date>;
  @Column(DataType.DATE) declare updatedAt: CreationOptional<Date>;
}
