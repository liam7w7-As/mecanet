import { NOTIFICATION_LEVELS, NOTIFICATION_TYPES } from '@unithor/shared';
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

import { Payment } from './Payment.js';
import { Quotation } from './Quotation.js';
import { User } from './User.js';
import { WorkOrder } from './WorkOrder.js';

import type { NotificationLevel, NotificationType } from '@unithor/shared';
import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'notifications',
  timestamps: true,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
  indexes: [
    { name: 'notifications_user_unread_created_idx', fields: ['user_id', 'leida_at', 'created_at'] },
    { name: 'notifications_user_created_idx', fields: ['user_id', 'created_at'] },
  ],
})
export class Notification extends Model<
  InferAttributes<Notification>,
  InferCreationAttributes<Notification>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare userId: number;

  @Column({ type: DataType.ENUM(...NOTIFICATION_TYPES), allowNull: false })
  declare tipo: NotificationType;

  @Column({
    type: DataType.ENUM(...NOTIFICATION_LEVELS),
    allowNull: false,
    defaultValue: 'info',
  })
  declare nivel: CreationOptional<NotificationLevel>;

  @Column({ type: DataType.STRING(160), allowNull: false })
  declare titulo: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare mensaje: string;

  /** Ruta interna a la que navega la notificación al hacer clic. */
  @Column({ type: DataType.STRING(200), allowNull: false })
  declare href: string;

  @ForeignKey(() => WorkOrder)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare workOrderId: CreationOptional<number | null>;

  @ForeignKey(() => Quotation)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare quotationId: CreationOptional<number | null>;

  @ForeignKey(() => Payment)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare paymentId: CreationOptional<number | null>;

  /** Autor del evento. Si es null, la notificación la generó el sistema. */
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare actorId: CreationOptional<number | null>;

  /** Clave de deduplicación para barridos (ej. fecha_entrega_vencida por día). */
  @Column({ type: DataType.STRING(120), allowNull: true })
  declare dedupeKey: CreationOptional<string | null>;

  @Column({ type: DataType.DATE, allowNull: true })
  declare leidaAt: CreationOptional<Date | null>;

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => User)
  declare user?: User;

  @BelongsTo(() => User, 'actorId')
  declare actor?: User;

  @BelongsTo(() => WorkOrder)
  declare workOrder?: WorkOrder;

  @BelongsTo(() => Quotation)
  declare quotation?: Quotation;

  @BelongsTo(() => Payment)
  declare payment?: Payment;
}
