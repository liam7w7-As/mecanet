import {
  FUEL_LEVELS,
  TIRE_CONDITIONS,
  type FuelLevel,
  type TireCondition,
  type VehicleInventoryItem,
} from '@unithor/shared';
import {
  AutoIncrement,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Index,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

import { User } from './User.js';
import { WorkOrder } from './WorkOrder.js';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'work_order_inspections',
  timestamps: true,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
})
export class WorkOrderInspection extends Model<
  InferAttributes<WorkOrderInspection>,
  InferCreationAttributes<WorkOrderInspection>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @Index({ unique: true })
  @ForeignKey(() => WorkOrder)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare workOrderId: number;

  @Column({ type: DataType.ENUM(...FUEL_LEVELS), allowNull: true })
  declare nivelCombustible: FuelLevel | null;

  @Column({ type: DataType.ENUM(...TIRE_CONDITIONS), allowNull: true })
  declare llantaDelanteraIzquierda: TireCondition | null;

  @Column({ type: DataType.ENUM(...TIRE_CONDITIONS), allowNull: true })
  declare llantaDelanteraDerecha: TireCondition | null;

  @Column({ type: DataType.ENUM(...TIRE_CONDITIONS), allowNull: true })
  declare llantaTraseraIzquierda: TireCondition | null;

  @Column({ type: DataType.ENUM(...TIRE_CONDITIONS), allowNull: true })
  declare llantaTraseraDerecha: TireCondition | null;

  @Column({ type: DataType.JSON, allowNull: false })
  declare inventario: VehicleInventoryItem[];

  @Column({ type: DataType.TEXT, allowNull: true })
  declare objetosValor: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare observaciones: string | null;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare inspectedBy: number | null;

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => WorkOrder)
  declare workOrder?: WorkOrder;

  @BelongsTo(() => User, 'inspectedBy')
  declare inspector?: User;
}
