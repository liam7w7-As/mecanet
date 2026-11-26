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
import { Purchase } from './Purchase.js';
import { Warehouse } from './Warehouse.js';
import { WorkOrder } from './WorkOrder.js';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'purchase_items',
  timestamps: true,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
})
export class PurchaseItem extends Model<
  InferAttributes<PurchaseItem>,
  InferCreationAttributes<PurchaseItem>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @ForeignKey(() => Purchase)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  declare purchaseId: number;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare sourceRequestId: CreationOptional<number | null>;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare workOrderItemId: CreationOptional<number | null>;

  @ForeignKey(() => WorkOrder)
  @Column({ type: DataType.INTEGER, allowNull: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  declare workOrderId: CreationOptional<number | null>;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: true })
  declare ventaUnitario: CreationOptional<number | null>;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: true })
  declare previousSalePrice: CreationOptional<number | null>;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare expressCreatedItem: CreationOptional<boolean>;

  @Column({ type: DataType.DATE, allowNull: true })
  declare stockReturnedAt: CreationOptional<Date | null>;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare stockReturnedBy: CreationOptional<number | null>;

  @Column({ type: DataType.STRING(500), allowNull: true })
  declare stockReturnReason: CreationOptional<string | null>;

  @ForeignKey(() => CatalogItem)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  declare catalogItemId: number | null;

  @Column({ type: DataType.STRING(255), allowNull: false })
  declare descripcion: string;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  declare cantidad: number;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  declare precioUnitario: number;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  declare subtotal: number;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare afectaStock: CreationOptional<boolean>;

  @ForeignKey(() => Warehouse)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  declare warehouseId: number | null;

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => Purchase)
  declare purchase?: Purchase;

  @BelongsTo(() => CatalogItem)
  declare catalogItem?: CatalogItem;

  @BelongsTo(() => Warehouse)
  declare warehouse?: Warehouse;

  @BelongsTo(() => WorkOrder)
  declare workOrder?: WorkOrder;
}
