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

import { FleetDocumentVersion } from './FleetDocumentVersion.js';
import { FleetVehicle } from './FleetVehicle.js';
import { User } from './User.js';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'fleet_documents',
  timestamps: true,
  paranoid: true,
  underscored: true,
  deletedAt: 'deleted_at',
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
})
export class FleetDocument extends Model<
  InferAttributes<FleetDocument>,
  InferCreationAttributes<FleetDocument>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @ForeignKey(() => FleetVehicle)
  @Column({ type: DataType.INTEGER, allowNull: false, onDelete: 'CASCADE' })
  declare fleetVehicleId: number;

  @Column({ type: DataType.STRING(120), allowNull: false })
  declare nombre: string;

  @Column({ type: DataType.STRING(80), allowNull: true })
  declare referencia: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare notas: string | null;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  declare fechaEmision: string | null;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  declare fechaVencimiento: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare archivoNombre: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare storageKey: string | null;

  @Column({ type: DataType.STRING(100), allowNull: true })
  declare mimeType: string | null;

  @Column({ type: DataType.INTEGER.UNSIGNED, allowNull: true })
  declare sizeBytes: number | null;

  @Column({ type: DataType.STRING(64), allowNull: true })
  declare sha256: string | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare version: CreationOptional<number>;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare subidoPor: number | null;

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare updatedAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare deletedAt: CreationOptional<Date | null>;

  @BelongsTo(() => FleetVehicle)
  declare fleetVehicle?: FleetVehicle;

  @BelongsTo(() => User, 'subidoPor')
  declare uploader?: User;

  @HasMany(() => FleetDocumentVersion, { as: 'versions' })
  declare versions?: FleetDocumentVersion[];
}
