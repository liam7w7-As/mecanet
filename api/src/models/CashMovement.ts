import { PAYMENT_METHODS, CASH_MOVEMENT_CATEGORIES, CASH_MOVEMENT_TYPES } from '@unithor/shared';
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

import type {
  CashMovementCategory,
  CashMovementType,
  PaymentMethod,
} from '@unithor/shared';
import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'cash_movements',
  timestamps: true,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
})
export class CashMovement extends Model<
  InferAttributes<CashMovement>,
  InferCreationAttributes<CashMovement>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @Column({ type: DataType.ENUM(...CASH_MOVEMENT_TYPES), allowNull: false })
  declare tipo: CashMovementType;

  @Column({ type: DataType.ENUM(...CASH_MOVEMENT_CATEGORIES), allowNull: false })
  declare categoria: CashMovementCategory;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  declare monto: number;

  @Column({ type: DataType.ENUM(...PAYMENT_METHODS), allowNull: false })
  declare metodo: PaymentMethod;

  @Column({ type: DataType.STRING(255), allowNull: false })
  declare descripcion: string;

  @Column({ type: DataType.STRING(120), allowNull: true })
  declare referencia: CreationOptional<string | null>;

  @Column({ type: DataType.DATE, allowNull: false })
  declare fecha: Date;

  @ForeignKey(() => User)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  declare createdBy: number | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare voidedAt: CreationOptional<Date | null>;

  @ForeignKey(() => User)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  declare voidedBy: CreationOptional<number | null>;

  @Column({ type: DataType.STRING(500), allowNull: true })
  declare voidReason: CreationOptional<string | null>;

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => User, 'createdBy')
  declare creator?: User;

  @BelongsTo(() => User, 'voidedBy')
  declare voider?: User;
}
