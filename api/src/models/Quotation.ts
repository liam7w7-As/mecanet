import { QUOTATION_STATUS, type QuotationStatus } from '@unithor/shared';
import {
  AutoIncrement,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Index,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

import { Client } from './Client.js';
import { Payment } from './Payment.js';
import { QuotationItem } from './QuotationItem.js';
import { User } from './User.js';
import { Vehicle } from './Vehicle.js';
import { WorkOrder } from './WorkOrder.js';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'quotations',
  timestamps: true,
  paranoid: true,
  underscored: true,
  deletedAt: 'deleted_at',
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
})
export class Quotation extends Model<
  InferAttributes<Quotation>,
  InferCreationAttributes<Quotation>
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

  @ForeignKey(() => WorkOrder)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  declare workOrderId: number | null;

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

  @ForeignKey(() => User)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  declare asesorId: number | null;

  @Column({
    type: DataType.ENUM(...QUOTATION_STATUS),
    allowNull: false,
    defaultValue: 'por_pagar',
  })
  declare estadoPago: CreationOptional<QuotationStatus>;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  })
  declare subtotal: CreationOptional<number>;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  })
  declare total: CreationOptional<number>;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  })
  declare pagado: CreationOptional<number>;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare notas: string | null;

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare updatedAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare deletedAt: CreationOptional<Date | null>;

  @BelongsTo(() => WorkOrder)
  declare workOrder?: WorkOrder;

  @BelongsTo(() => Client)
  declare client?: Client;

  @BelongsTo(() => Vehicle)
  declare vehicle?: Vehicle;

  @BelongsTo(() => User, 'asesorId')
  declare asesor?: User;

  @HasMany(() => QuotationItem)
  declare items?: QuotationItem[];

  @HasMany(() => Payment)
  declare payments?: Payment[];
}
