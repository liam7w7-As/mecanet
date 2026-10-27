import {
  WORK_ORDER_PRICE_SUGGESTION_SCOPES,
  WORK_ORDER_PRICE_SUGGESTION_STATUS,
  type WorkOrderPriceSuggestionScope,
  type WorkOrderPriceSuggestionStatus,
} from '@unithor/shared';
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
import { WorkOrder } from './WorkOrder.js';
import { WorkOrderItem } from './WorkOrderItem.js';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'work_order_price_suggestions',
  timestamps: true,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
  indexes: [
    { name: 'work_order_price_suggestions_order_status_idx', fields: ['work_order_id', 'estado'] },
  ],
})
export class WorkOrderPriceSuggestion extends Model<
  InferAttributes<WorkOrderPriceSuggestion>,
  InferCreationAttributes<WorkOrderPriceSuggestion>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @ForeignKey(() => WorkOrder)
  @Column({ type: DataType.INTEGER, allowNull: false, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  declare workOrderId: number;

  @ForeignKey(() => WorkOrderItem)
  @Column({ type: DataType.INTEGER, allowNull: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  declare workOrderItemId: number | null;

  @ForeignKey(() => CatalogItem)
  @Column({ type: DataType.INTEGER, allowNull: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  declare catalogItemId: number | null;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  declare createdBy: number | null;

  @Column({ type: DataType.STRING(180), allowNull: true })
  declare createdByName: string | null;

  @Column({ type: DataType.DECIMAL(6, 2), allowNull: true })
  declare horasEstimadas: number | null;

  @Column({ type: DataType.DECIMAL(6, 2), allowNull: true })
  declare horasReales: number | null;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: true })
  declare precioActualOt: number | null;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: true })
  declare precioActualCatalogo: number | null;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  declare precioSugerido: number;

  @Column({
    type: DataType.ENUM(...WORK_ORDER_PRICE_SUGGESTION_SCOPES),
    allowNull: false,
    defaultValue: 'catalogo',
  })
  declare alcance: CreationOptional<WorkOrderPriceSuggestionScope>;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare motivo: string;

  @Column({
    type: DataType.ENUM(...WORK_ORDER_PRICE_SUGGESTION_STATUS),
    allowNull: false,
    defaultValue: 'pendiente',
  })
  declare estado: CreationOptional<WorkOrderPriceSuggestionStatus>;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  declare reviewedBy: number | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare reviewNote: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare reviewedAt: Date | null;

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => WorkOrder)
  declare workOrder?: WorkOrder;

  @BelongsTo(() => WorkOrderItem)
  declare item?: WorkOrderItem;

  @BelongsTo(() => CatalogItem)
  declare catalogItem?: CatalogItem;

  @BelongsTo(() => User, 'createdBy')
  declare creator?: User;

  @BelongsTo(() => User, 'reviewedBy')
  declare reviewer?: User;
}
