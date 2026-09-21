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

import { User } from './User.js';
import { WorkOrder } from './WorkOrder.js';

import type { WorkOrderDeliveryChecklistItem } from '@unithor/shared';
import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'work_order_deliveries',
  timestamps: true,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
  indexes: [
    {
      name: 'work_order_deliveries_work_order_id_unique',
      unique: true,
      fields: ['work_order_id'],
    },
  ],
})
export class WorkOrderDelivery extends Model<
  InferAttributes<WorkOrderDelivery>,
  InferCreationAttributes<WorkOrderDelivery>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @ForeignKey(() => WorkOrder)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare workOrderId: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare kilometrajeSalida: number;

  @Column({ type: DataType.STRING(180), allowNull: false })
  declare receptorNombre: string;

  @Column({ type: DataType.STRING(20), allowNull: true })
  declare receptorRut: string | null;

  @Column({ type: DataType.STRING(30), allowNull: true })
  declare receptorTelefono: string | null;

  @Column({ type: DataType.JSON, allowNull: false })
  declare checklist: WorkOrderDeliveryChecklistItem[];

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare conformidad: CreationOptional<boolean>;

  @Column({ type: DataType.STRING(180), allowNull: false })
  declare firmaRecepcion: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare observaciones: string | null;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare deliveredBy: number | null;

  @Column({ type: DataType.DATE, allowNull: false })
  declare deliveredAt: Date;

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => WorkOrder)
  declare workOrder?: WorkOrder;

  @BelongsTo(() => User, 'deliveredBy')
  declare deliverer?: User;
}
