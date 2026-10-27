import {
  PAYMENT_METHODS,
  PURCHASE_DOCUMENT_TYPES,
  PURCHASE_PAYMENT_TYPES,
  PURCHASE_STATUSES,
  PURCHASE_VEHICLE_ORIGINS,
} from '@unithor/shared';
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

import { CashMovement } from './CashMovement.js';
import { FleetVehicle } from './FleetVehicle.js';
import { PurchaseItem } from './PurchaseItem.js';
import { Supplier } from './Supplier.js';
import { User } from './User.js';
import { Vehicle } from './Vehicle.js';
import { WorkOrder } from './WorkOrder.js';

import type {
  PaymentMethod,
  PurchaseDocumentType,
  PurchasePaymentType,
  PurchaseStatus,
  PurchaseVehicleOrigin,
} from '@unithor/shared';
import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'purchases',
  timestamps: true,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
})
export class Purchase extends Model<InferAttributes<Purchase>, InferCreationAttributes<Purchase>> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @Index
  @Column({ type: DataType.STRING(30), allowNull: false, unique: true })
  declare codigo: string;

  @ForeignKey(() => Supplier)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  declare supplierId: number;

  @ForeignKey(() => Vehicle)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  declare vehicleId: number | null;

  @ForeignKey(() => FleetVehicle)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  declare fleetVehicleId: number | null;

  @ForeignKey(() => WorkOrder)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  declare workOrderId: number | null;

  @Column({
    type: DataType.ENUM(...PURCHASE_VEHICLE_ORIGINS),
    allowNull: true,
  })
  declare origenVehiculo: PurchaseVehicleOrigin | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare conIva: CreationOptional<boolean>;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 })
  declare neto: CreationOptional<number>;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 })
  declare iva: CreationOptional<number>;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 })
  declare total: CreationOptional<number>;

  @Column({
    type: DataType.ENUM(...PURCHASE_PAYMENT_TYPES),
    allowNull: false,
    defaultValue: 'contado',
  })
  declare formaPago: CreationOptional<PurchasePaymentType>;

  @Column({
    type: DataType.ENUM(...PAYMENT_METHODS),
    allowNull: false,
    defaultValue: 'efectivo',
  })
  declare metodoPago: CreationOptional<PaymentMethod>;

  @Index
  @Column({
    type: DataType.ENUM(...PURCHASE_STATUSES),
    allowNull: false,
    defaultValue: 'registrada',
  })
  declare estado: CreationOptional<PurchaseStatus>;

  @Column({ type: DataType.ENUM(...PURCHASE_DOCUMENT_TYPES), allowNull: false })
  declare tipoDocumento: PurchaseDocumentType;

  @Column({ type: DataType.STRING(50), allowNull: false })
  declare folio: string;

  @Column({ type: DataType.DATEONLY, allowNull: false })
  declare fechaEmision: string;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  declare montoComprobante: number;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare numeroOperacion: string;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare banco: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  declare comprobanteNombre: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  declare comprobanteStorageKey: string;

  @Column({ type: DataType.STRING(100), allowNull: false })
  declare comprobanteMimeType: string;

  @Column({ type: DataType.INTEGER.UNSIGNED, allowNull: false })
  declare comprobanteSizeBytes: number;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare observaciones: string | null;

  @ForeignKey(() => CashMovement)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  declare cashMovementId: number | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare pagadoAt: CreationOptional<Date | null>;

  @ForeignKey(() => User)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  declare createdBy: number | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare voidedAt: CreationOptional<Date | null>;

  @ForeignKey(() => User)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  declare voidedBy: CreationOptional<number | null>;

  @Column({ type: DataType.STRING(500), allowNull: true })
  declare voidReason: CreationOptional<string | null>;

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => Supplier)
  declare supplier?: Supplier;

  @BelongsTo(() => Vehicle)
  declare vehicle?: Vehicle;

  @BelongsTo(() => FleetVehicle)
  declare fleetVehicle?: FleetVehicle;

  @BelongsTo(() => WorkOrder)
  declare workOrder?: WorkOrder;

  @BelongsTo(() => CashMovement)
  declare cashMovement?: CashMovement;

  @BelongsTo(() => User, 'createdBy')
  declare creator?: User;

  @BelongsTo(() => User, 'voidedBy')
  declare voider?: User;

  @HasMany(() => PurchaseItem)
  declare items?: PurchaseItem[];
}
