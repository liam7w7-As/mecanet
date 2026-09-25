import { CATALOG_TYPES, type CatalogType, type UnitMeasure } from '@unithor/shared';
import {
  AutoIncrement,
  Column,
  DataType,
  HasMany,
  Index,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

import { QuotationItem } from './QuotationItem.js';
import { WorkOrderItem } from './WorkOrderItem.js';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'catalog_items',
  timestamps: true,
  paranoid: true,
  underscored: true,
  deletedAt: 'deleted_at',
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
})
export class CatalogItem extends Model<
  InferAttributes<CatalogItem>,
  InferCreationAttributes<CatalogItem>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @Index
  @Column({
    type: DataType.ENUM(...CATALOG_TYPES),
    allowNull: false,
  })
  declare tipo: CatalogType;

  @Index
  @Column({
    type: DataType.STRING(50),
    allowNull: true,
  })
  declare codigo: string | null;

  @Column({
    type: DataType.STRING(180),
    allowNull: false,
  })
  declare nombre: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare descripcion: string | null;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: 'unidad',
  })
  declare unidadMedida: CreationOptional<UnitMeasure>;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  })
  declare precio: CreationOptional<number>;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  declare stock: CreationOptional<number>;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  declare stockMinimo: CreationOptional<number>;

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare updatedAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare deletedAt: CreationOptional<Date | null>;

  @HasMany(() => WorkOrderItem)
  declare workOrderItems?: WorkOrderItem[];

  @HasMany(() => QuotationItem)
  declare quotationItems?: QuotationItem[];
}
