import {
  FLEET_VEHICLE_STATUSES,
  type FleetVehicleStatus,
} from '@unithor/shared';
import {
  AutoIncrement,
  Column,
  DataType,
  HasMany,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

import { FleetDocument } from './FleetDocument.js';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'fleet_vehicles',
  timestamps: true,
  paranoid: true,
  underscored: true,
  deletedAt: 'deleted_at',
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
})
export class FleetVehicle extends Model<
  InferAttributes<FleetVehicle>,
  InferCreationAttributes<FleetVehicle>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @Column({ type: DataType.STRING(15), allowNull: false, unique: true })
  declare patente: string;

  @Column({ type: DataType.STRING(30), allowNull: true, unique: true })
  declare codigoInterno: string | null;

  @Column({ type: DataType.STRING(80), allowNull: true })
  declare marca: string | null;

  @Column({ type: DataType.STRING(80), allowNull: true })
  declare modelo: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare ano: number | null;

  @Column({ type: DataType.STRING(40), allowNull: true })
  declare color: string | null;

  @Column({ type: DataType.STRING(50), allowNull: true })
  declare vinChasis: string | null;

  @Column({ type: DataType.STRING(50), allowNull: true })
  declare motor: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare kilometraje: number | null;

  @Column({ type: DataType.STRING(30), allowNull: true })
  declare combustible: string | null;

  @Column({ type: DataType.STRING(30), allowNull: true })
  declare transmision: string | null;

  @Column({
    type: DataType.ENUM(...FLEET_VEHICLE_STATUSES),
    allowNull: false,
    defaultValue: 'disponible',
  })
  declare estadoOperativo: FleetVehicleStatus;

  @Column({ type: DataType.STRING(120), allowNull: true })
  declare sucursal: string | null;

  @Column({ type: DataType.STRING(120), allowNull: true })
  declare responsable: string | null;

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare updatedAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare deletedAt: CreationOptional<Date | null>;

  @HasMany(() => FleetDocument, { as: 'documents' })
  declare documents?: FleetDocument[];
}
