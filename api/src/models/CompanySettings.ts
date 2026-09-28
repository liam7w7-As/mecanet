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

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

/**
 * Fila única (id = 1) con la identidad de la empresa. Alimenta el logo, el
 * login y los encabezados de los documentos imprimibles.
 */
@Table({
  tableName: 'company_settings',
  timestamps: true,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
})
export class CompanySettings extends Model<
  InferAttributes<CompanySettings>,
  InferCreationAttributes<CompanySettings>
> {
  /** Identificador fijo: siempre 1. */
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @Column({ type: DataType.STRING(180), allowNull: false })
  declare razonSocial: string;

  @Column({ type: DataType.STRING(120), allowNull: true })
  declare nombreComercial: string | null;

  @Column({ type: DataType.STRING(20), allowNull: true })
  declare rut: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare giro: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare direccion: string | null;

  @Column({ type: DataType.STRING(100), allowNull: true })
  declare region: string | null;

  @Column({ type: DataType.STRING(100), allowNull: true })
  declare comuna: string | null;

  @Column({ type: DataType.STRING(30), allowNull: true })
  declare telefono: string | null;

  @Column({ type: DataType.STRING(120), allowNull: true })
  declare email: string | null;

  @Column({ type: DataType.STRING(200), allowNull: true })
  declare sitioWeb: string | null;

  /** Clave relativa dentro de UPLOAD_DIR. Nunca se expone la ruta de disco. */
  @Column({ type: DataType.STRING(200), allowNull: true })
  declare logoStorageKey: CreationOptional<string | null>;

  @Column({ type: DataType.STRING(60), allowNull: true })
  declare logoMimeType: CreationOptional<string | null>;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare logoSizeBytes: CreationOptional<number | null>;

  @Column({ type: DataType.DATE, allowNull: true })
  declare logoUpdatedAt: CreationOptional<Date | null>;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare updatedBy: CreationOptional<number | null>;

  @BelongsTo(() => User, 'updatedBy')
  declare lastEditor?: User;
}
