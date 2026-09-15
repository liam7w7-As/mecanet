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

import { Quotation } from './Quotation.js';
import { Vehicle } from './Vehicle.js';
import { WorkOrder } from './WorkOrder.js';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'clients',
  timestamps: true,
  paranoid: true,
  underscored: true,
  deletedAt: 'deleted_at',
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
})
export class Client extends Model<InferAttributes<Client>, InferCreationAttributes<Client>> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @Index
  @Column({
    type: DataType.STRING(20),
    allowNull: true,
  })
  declare rut: string | null;

  @Index
  @Column({
    type: DataType.STRING(180),
    allowNull: false,
  })
  declare nombre: string;

  @Index
  @Column({
    type: DataType.ENUM('cliente', 'empresa'),
    allowNull: false,
    defaultValue: 'cliente',
  })
  declare tipo: CreationOptional<'cliente' | 'empresa'>;

  @Column({
    type: DataType.STRING(180),
    allowNull: true,
  })
  declare email: string | null;

  @Column({
    type: DataType.STRING(30),
    allowNull: true,
  })
  declare telefono: string | null;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  declare direccion: string | null;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  declare region: string | null;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  declare comuna: string | null;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  declare notas: string | null;

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare updatedAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare deletedAt: CreationOptional<Date | null>;

  @HasMany(() => Vehicle)
  declare vehicles?: Vehicle[];

  @HasMany(() => WorkOrder, 'clientId')
  declare workOrders?: WorkOrder[];

  @HasMany(() => Quotation)
  declare quotations?: Quotation[];
}
