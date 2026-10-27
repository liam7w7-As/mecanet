import { ITEM_OPERATIONAL_STATUS, type ItemOperationalStatus, type UnitMeasure, type CatalogType } from '@unithor/shared';
import {
  AutoIncrement,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

import { CatalogItem } from './CatalogItem.js';
import { User } from './User.js';
import { Warehouse } from './Warehouse.js';
import { WorkOrder } from './WorkOrder.js';
import { WorkOrderItemProgressEvent } from './WorkOrderItemProgressEvent.js';
import { WorkOrderItemSession } from './WorkOrderItemSession.js';
import { WorkOrderObservation } from './WorkOrderObservation.js';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'work_order_items',
  timestamps: true,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
})
export class WorkOrderItem extends Model<
  InferAttributes<WorkOrderItem>,
  InferCreationAttributes<WorkOrderItem>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @ForeignKey(() => WorkOrder)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  declare workOrderId: number;

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

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  declare stockConsumido: CreationOptional<boolean>;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  declare stockConsumidoCantidad: CreationOptional<number>;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare stockConsumidoAt: Date | null;

  @ForeignKey(() => Warehouse)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  declare stockConsumidoWarehouseId: number | null;

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare updatedAt: CreationOptional<Date>;

  @Column({ type: DataType.DECIMAL(6, 2), allowNull: true })
  declare horasHombreEstimadas: number | null;

  @Column({ type: DataType.DECIMAL(6, 2), allowNull: true })
  declare horasHombreReales: number | null;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  declare assignedUserId: number | null;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  declare laborValidatedBy: number | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare laborValidatedAt: Date | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare laborValidationNote: string | null;

  @BelongsTo(() => WorkOrder)
  declare workOrder?: WorkOrder;

  @BelongsTo(() => CatalogItem)
  declare catalogItem?: CatalogItem;

  @BelongsTo(() => Warehouse)
  declare consumedWarehouse?: Warehouse;

  @BelongsTo(() => User, 'assignedUserId')
  declare assignedUser?: User;

  @BelongsTo(() => User, 'laborValidatedBy')
  declare validator?: User;

  @HasMany(() => WorkOrderItemSession)
  declare sessions?: WorkOrderItemSession[];

  @HasMany(() => WorkOrderItemProgressEvent)
  declare progressEvents?: WorkOrderItemProgressEvent[];

  @HasMany(() => WorkOrderObservation)
  declare observations?: WorkOrderObservation[];
}
