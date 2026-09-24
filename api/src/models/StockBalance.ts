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
import { Warehouse } from './Warehouse.js';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'stock_balances',
  timestamps: true,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
  indexes: [
    {
      name: 'stock_balances_warehouse_item_unique',
      unique: true,
      fields: ['warehouse_id', 'catalog_item_id'],
    },
  ],
})
export class StockBalance extends Model<
  InferAttributes<StockBalance>,
  InferCreationAttributes<StockBalance>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @ForeignKey(() => Warehouse)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    field: 'warehouse_id',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  declare warehouseId: number;

  @ForeignKey(() => CatalogItem)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    field: 'catalog_item_id',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  declare catalogItemId: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare cantidad: number;

  @BelongsTo(() => Warehouse)
  declare warehouse?: Warehouse;

  @BelongsTo(() => CatalogItem)
  declare catalogItem?: CatalogItem;
}
