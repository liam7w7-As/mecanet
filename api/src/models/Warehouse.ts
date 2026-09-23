import {
  AutoIncrement,
  Column,
  DataType,
  HasMany,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

import { StockBalance } from './StockBalance.js';
import { StockMovement } from './StockMovement.js';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'warehouses',
  timestamps: true,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
})
export class Warehouse extends Model<InferAttributes<Warehouse>, InferCreationAttributes<Warehouse>> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @Column({ type: DataType.STRING(20), allowNull: false, unique: true })
  declare codigo: string;

  @Column({ type: DataType.STRING(120), allowNull: false })
  declare nombre: string;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare direccion: string | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare activo: CreationOptional<boolean>;

  @HasMany(() => StockBalance)
  declare balances?: StockBalance[];

  @HasMany(() => StockMovement)
  declare movements?: StockMovement[];
}
