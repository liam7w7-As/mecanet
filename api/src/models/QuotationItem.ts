import { ITEM_OPERATIONAL_STATUS, type CatalogType, type ItemOperationalStatus, type UnitMeasure } from '@unithor/shared';
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
import { Quotation } from './Quotation.js';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'quotation_items',
  timestamps: true,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
})
export class QuotationItem extends Model<
  InferAttributes<QuotationItem>,
  InferCreationAttributes<QuotationItem>
> {
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

  @ForeignKey(() => CatalogItem)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  declare catalogItemId: number | null;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: 'estandar',
  })
  declare tipoLinea: CreationOptional<CatalogType>;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: 'unidad',
  })
  declare unidadMedida: CreationOptional<UnitMeasure>;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  declare descripcion: string;

  @Column({
    type: DataType.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 1,
  })
  declare cantidad: CreationOptional<number>;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  })
  declare precioUnitario: CreationOptional<number>;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  })
  declare subtotal: CreationOptional<number>;

  @Column({
    type: DataType.ENUM(...ITEM_OPERATIONAL_STATUS),
    allowNull: false,
    defaultValue: 'pendiente',
  })
  declare estadoOperativo: CreationOptional<ItemOperationalStatus>;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare notasOperativas: string | null;

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => Quotation)
  declare quotation?: Quotation;

  @BelongsTo(() => CatalogItem)
  declare catalogItem?: CatalogItem;
}
