import { Column, DataType, Model, Table, PrimaryKey, AutoIncrement } from 'sequelize-typescript';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

export type CustomerEmailKind = 'quotation' | 'work_order';
export type CustomerEmailStatus =
  | 'disabled'
  | 'missing_recipient'
  | 'waiting_photos'
  | 'pending'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'cancelled';
export interface CustomerEmailPayload {
  expectedPhotoSlots?: string[];
  includeQuotation?: boolean;
  message?: string;
}

@Table({
  tableName: 'customer_emails',
  timestamps: true,
  underscored: true,
  indexes: [
    { name: 'customer_emails_queue_idx', fields: ['status', 'next_attempt_at'] },
    { name: 'customer_emails_document_idx', fields: ['kind', 'entity_id', 'created_at'] },
  ],
})
export class CustomerEmail extends Model<
  InferAttributes<CustomerEmail>,
  InferCreationAttributes<CustomerEmail>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @Column({ type: DataType.STRING(160), allowNull: false, unique: true })
  declare dedupeKey: string;

  @Column({ type: DataType.STRING(20), allowNull: false })
  declare kind: CustomerEmailKind;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare entityId: number;

  @Column({ type: DataType.STRING(20), allowNull: false })
  declare category: 'document' | 'progress';

  @Column({ type: DataType.STRING(180), allowNull: true })
  declare recipient: string | null;

  @Column({ type: DataType.STRING(180), allowNull: false })
  declare recipientName: string;

  @Column({ type: DataType.STRING(200), allowNull: false })
  declare subject: string;

  @Column({
    type: DataType.JSON,
    allowNull: false,
    get(this: CustomerEmail): CustomerEmailPayload {
      const value: unknown = this.getDataValue('payload');
      return typeof value === 'string'
        ? (JSON.parse(value) as CustomerEmailPayload)
        : (value as CustomerEmailPayload);
    },
  })
  declare payload: CustomerEmailPayload;

  @Column({ type: DataType.STRING(24), allowNull: false })
  declare status: CustomerEmailStatus;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare attempts: CreationOptional<number>;

  @Column({ type: DataType.DATE, allowNull: false })
  declare nextAttemptAt: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  declare lockedAt: CreationOptional<Date | null>;

  @Column({ type: DataType.STRING(36), allowNull: true })
  declare lockToken: CreationOptional<string | null>;

  @Column({ type: DataType.DATE, allowNull: true })
  declare acceptedAt: CreationOptional<Date | null>;

  @Column({ type: DataType.STRING(80), allowNull: true })
  declare lastError: CreationOptional<string | null>;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare requestedBy: number | null;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
