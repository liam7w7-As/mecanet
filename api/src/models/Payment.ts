import { PAYMENT_STATUS } from '@unithor/shared';
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

import { Quotation } from './Quotation.js';
import { User } from './User.js';

import type { PaymentStatus } from '@unithor/shared';
import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'payments',
  timestamps: true,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
})
export class Payment extends Model<InferAttributes<Payment>, InferCreationAttributes<Payment>> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @ForeignKey(() => Quotation)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  declare quotationId: number;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
  })
  declare monto: number;

  @Column({
    type: DataType.STRING(50),
    allowNull: true,
  })
  declare metodo: string | null;

  @Column({
    type: DataType.ENUM(...PAYMENT_STATUS),
    allowNull: false,
    defaultValue: 'confirmado',
  })
  declare estado: CreationOptional<PaymentStatus>;

  @Column({
    type: DataType.STRING(120),
    allowNull: true,
  })
  declare referencia: CreationOptional<string | null>;

  @Column({
    type: DataType.STRING(80),
    allowNull: true,
  })
  declare bancoOrigen: CreationOptional<string | null>;

  @Column({
    type: DataType.STRING(80),
    allowNull: true,
  })
  declare numeroTransaccion: CreationOptional<string | null>;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  declare comprobantePago: CreationOptional<string | null>;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  declare fecha: Date;

  @ForeignKey(() => User)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  declare createdBy: number | null;

  @ForeignKey(() => User)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  declare reviewedBy: CreationOptional<number | null>;

  @Column({ type: DataType.DATE, allowNull: true })
  declare reviewedAt: CreationOptional<Date | null>;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare reviewNote: CreationOptional<string | null>;

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => Quotation)
  declare quotation?: Quotation;

  @BelongsTo(() => User, 'createdBy')
  declare creator?: User;

  @BelongsTo(() => User, 'reviewedBy')
  declare reviewer?: User;
}
