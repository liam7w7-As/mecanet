import { STOCK_MOVEMENT_TYPES } from '@unithor/shared';
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

import { CatalogItem } from './CatalogItem.js';
import { User } from './User.js';
import { Warehouse } from './Warehouse.js';

import type { StockMovementType } from '@unithor/shared';
import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'stock_movements',
  timestamps: true,
  updatedAt: false,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
})
export class StockMovement extends Model<
  InferAttributes<StockMovement>,
  InferCreationAttributes<StockMovement>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @ForeignKey(() => CatalogItem)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    field: 'catalog_item_id',
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  declare catalogItemId: number;

  @ForeignKey(() => Warehouse)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    field: 'warehouse_id',
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  declare warehouseId: number;

  @Column({ type: DataType.ENUM(...STOCK_MOVEMENT_TYPES), allowNull: false })
  declare tipo: StockMovementType;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare cantidad: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare saldoResultante: number;

  @Column({ type: DataType.STRING(255), allowNull: false })
  declare motivo: string;

  @Column({ type: DataType.STRING(120), allowNull: true })
  declare referencia: CreationOptional<string | null>;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  declare createdBy: number | null;

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  declare fecha: CreationOptional<Date>;

  @BelongsTo(() => CatalogItem)
  declare catalogItem?: CatalogItem;

  @BelongsTo(() => Warehouse)
  declare warehouse?: Warehouse;

  @BelongsTo(() => User)
  declare creator?: User;
}
