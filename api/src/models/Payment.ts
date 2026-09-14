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

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => Quotation)
  declare quotation?: Quotation;

  @BelongsTo(() => User, 'createdBy')
  declare creator?: User;
}
