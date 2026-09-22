import {
  AutoIncrement,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
  Unique,
} from 'sequelize-typescript';

import { User } from './User.js';

import type { PaymentMethod } from '@unithor/shared';
import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

export type PaymentMethodTotals = Record<PaymentMethod, number>;

@Table({
  tableName: 'daily_cash_closures',
  timestamps: true,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
})
export class CashClosure extends Model<
  InferAttributes<CashClosure>,
  InferCreationAttributes<CashClosure>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @Unique
  @Column({ type: DataType.DATEONLY, allowNull: false })
  declare fecha: string;

  @Column({ type: DataType.JSON, allowNull: false })
  declare totalesPorMetodo: PaymentMethodTotals;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  declare totalConfirmado: number;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 })
  declare totalIngresosManuales: CreationOptional<number>;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 })
  declare totalEgresos: CreationOptional<number>;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 })
  declare totalNeto: CreationOptional<number>;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  declare efectivoEsperado: number;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  declare efectivoDeclarado: number;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  declare diferenciaEfectivo: number;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare observaciones: CreationOptional<string | null>;

  @ForeignKey(() => User)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  declare closedBy: number | null;

  @Column({ type: DataType.DATE, allowNull: false })
  declare closedAt: Date;

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => User, 'closedBy')
  declare closer?: User;
}
