import {
  WORK_ORDER_ENTRY_TYPES,
  WORK_ORDER_STATUS,
  type WorkOrderEntryType,
  type WorkOrderStatus,
} from '@unithor/shared';
import {
  AutoIncrement,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  HasOne,
  Index,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

import { Client } from './Client.js';
import { Quotation } from './Quotation.js';
import { User } from './User.js';
import { Vehicle } from './Vehicle.js';
import { WorkOrderDelivery } from './WorkOrderDelivery.js';
import { WorkOrderInspection } from './WorkOrderInspection.js';
import { WorkOrderItem } from './WorkOrderItem.js';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'work_orders',
  timestamps: true,
  paranoid: true,
  underscored: true,
  deletedAt: 'deleted_at',
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
})
export class WorkOrder extends Model<
  InferAttributes<WorkOrder>,
  InferCreationAttributes<WorkOrder>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @Index
  @Column({
    type: DataType.STRING(30),
    allowNull: false,
    unique: true,
  })
  declare codigo: string;

  @Column({
    type: DataType.ENUM(...WORK_ORDER_ENTRY_TYPES),
    allowNull: false,
    defaultValue: 'normal',
  })
  declare tipoIngreso: CreationOptional<WorkOrderEntryType>;

  @ForeignKey(() => WorkOrder)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  declare sourceWorkOrderId: number | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare coberturaGarantia: CreationOptional<boolean>;

  @ForeignKey(() => Client)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  declare clientId: number | null;

  @ForeignKey(() => Client)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  declare contactClientId: number | null;

  @ForeignKey(() => Client)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  declare billingClientId: number | null;

  @Column({ type: DataType.STRING(180), allowNull: true })
  declare contactName: string | null;

  @Column({ type: DataType.STRING(20), allowNull: true })
  declare contactRut: string | null;

  @Column({ type: DataType.STRING(30), allowNull: true })
  declare contactPhone: string | null;

  @Column({ type: DataType.STRING(180), allowNull: true })
  declare contactEmail: string | null;

  @Column({ type: DataType.STRING(180), allowNull: true })
  declare billingName: string | null;

  @Column({ type: DataType.STRING(20), allowNull: true })
  declare billingRut: string | null;

  @Column({ type: DataType.STRING(20), allowNull: true })
  declare billingType: 'cliente' | 'empresa' | null;

  @Column({ type: DataType.STRING(30), allowNull: true })
  declare billingPhone: string | null;

  @Column({ type: DataType.STRING(180), allowNull: true })
  declare billingEmail: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare billingAddress: string | null;

  @Column({ type: DataType.STRING(100), allowNull: true })
  declare billingRegion: string | null;

  @Column({ type: DataType.STRING(100), allowNull: true })
  declare billingComuna: string | null;

  @ForeignKey(() => Vehicle)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  declare vehicleId: number | null;

  @Index
  @Column({
    type: DataType.ENUM(...WORK_ORDER_STATUS),
    allowNull: false,
    defaultValue: 'borrador',
  })
  declare estado: CreationOptional<WorkOrderStatus>;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare descripcion: string | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  declare kilometrajeIngreso: number | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare fechaIngreso: Date | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare fechaEntrega: Date | null;

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

  @Column(DataType.DATE)
  declare deletedAt: CreationOptional<Date | null>;

  @BelongsTo(() => Client, 'clientId')
  declare client?: Client;

  @BelongsTo(() => Client, 'contactClientId')
  declare contactClient?: Client;

  @BelongsTo(() => Client, 'billingClientId')
  declare billingClient?: Client;

  @BelongsTo(() => Vehicle)
  declare vehicle?: Vehicle;

  @BelongsTo(() => User, 'createdBy')
  declare creator?: User;

  @BelongsTo(() => WorkOrder, 'sourceWorkOrderId')
  declare sourceWorkOrder?: WorkOrder;

  @HasMany(() => WorkOrder, 'sourceWorkOrderId')
  declare relatedWorkOrders?: WorkOrder[];

  @HasMany(() => WorkOrderItem)
  declare items?: WorkOrderItem[];

  @HasOne(() => WorkOrderInspection)
  declare inspection?: WorkOrderInspection;

  @HasOne(() => WorkOrderDelivery)
  declare delivery?: WorkOrderDelivery;

  @HasOne(() => Quotation)
  declare quotation?: Quotation;
}
