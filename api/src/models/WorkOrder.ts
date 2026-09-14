import { WORK_ORDER_STATUS, type WorkOrderStatus } from '@unithor/shared';
import {
  AutoIncrement,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  HasOne,
  Index,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

import { Client } from './Client.js';
import { Quotation } from './Quotation.js';
import { User } from './User.js';
import { Vehicle } from './Vehicle.js';
import { WorkOrderItem } from './WorkOrderItem.js';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'work_orders',
  timestamps: true,
  paranoid: true,
  underscored: true,
  deletedAt: 'deleted_at',
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
})
export class WorkOrder extends Model<
  InferAttributes<WorkOrder>,
  InferCreationAttributes<WorkOrder>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @Index
  @Column({
    type: DataType.STRING(30),
    allowNull: false,
    unique: true,
  })
  declare codigo: string;

  @ForeignKey(() => Client)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  declare clientId: number | null;

  @ForeignKey(() => Vehicle)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  declare vehicleId: number | null;

  @Index
  @Column({
    type: DataType.ENUM(...WORK_ORDER_STATUS),
    allowNull: false,
    defaultValue: 'borrador',
  })
  declare estado: CreationOptional<WorkOrderStatus>;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare descripcion: string | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  declare kilometrajeIngreso: number | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare fechaIngreso: Date | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare fechaEntrega: Date | null;

  @ForeignKey(() => User)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  declare createdBy: number | null;

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare updatedAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare deletedAt: CreationOptional<Date | null>;

  @BelongsTo(() => Client)
  declare client?: Client;

  @BelongsTo(() => Vehicle)
  declare vehicle?: Vehicle;

  @BelongsTo(() => User, 'createdBy')
  declare creator?: User;

  @HasMany(() => WorkOrderItem)
  declare items?: WorkOrderItem[];

  @HasOne(() => Quotation)
  declare quotation?: Quotation;
}
