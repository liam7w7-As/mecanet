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
import { WorkOrder } from './WorkOrder.js';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'vehicles',
  timestamps: true,
  paranoid: true,
  underscored: true,
  deletedAt: 'deleted_at',
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
})
export class Vehicle extends Model<InferAttributes<Vehicle>, InferCreationAttributes<Vehicle>> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @Index
  @Column({
    type: DataType.STRING(15),
    allowNull: false,
    unique: true,
  })
  declare patente: string;

  @Column({
    type: DataType.STRING(80),
    allowNull: true,
  })
  declare marca: string | null;

  @Column({
    type: DataType.STRING(80),
    allowNull: true,
  })
  declare modelo: string | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  declare ano: number | null;

  @Column({
    type: DataType.STRING(40),
    allowNull: true,
  })
  declare color: string | null;

  @Column({
    type: DataType.STRING(50),
    allowNull: true,
  })
  declare vinChasis: string | null;

  @Column({
    type: DataType.STRING(50),
    allowNull: true,
  })
  declare motor: string | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  declare kilometraje: number | null;

  @Column({
    type: DataType.STRING(30),
    allowNull: true,
  })
  declare combustible: string | null;

  @Column({
    type: DataType.STRING(30),
    allowNull: true,
  })
  declare transmision: string | null;

  @Index
  @ForeignKey(() => Client)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  declare clientId: number | null;

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare updatedAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare deletedAt: CreationOptional<Date | null>;

  @BelongsTo(() => Client)
  declare client?: Client;

  @HasMany(() => WorkOrder)
  declare workOrders?: WorkOrder[];
}
