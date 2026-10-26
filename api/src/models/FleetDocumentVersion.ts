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

import { FleetDocument } from './FleetDocument.js';
import { User } from './User.js';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'fleet_document_versions',
  timestamps: true,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
  indexes: [
    {
      name: 'fleet_document_versions_document_version_unique',
      unique: true,
      fields: ['fleet_document_id', 'version'],
    },
  ],
})
export class FleetDocumentVersion extends Model<
  InferAttributes<FleetDocumentVersion>,
  InferCreationAttributes<FleetDocumentVersion>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @ForeignKey(() => FleetDocument)
  @Column({ type: DataType.INTEGER, allowNull: false, onDelete: 'CASCADE' })
  declare fleetDocumentId: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare version: number;

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

  @Column({ type: DataType.STRING(255), allowNull: false })
  declare archivoNombre: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  declare storageKey: string;

  @Column({ type: DataType.STRING(100), allowNull: false })
  declare mimeType: string;

  @Column({ type: DataType.INTEGER.UNSIGNED, allowNull: false })
  declare sizeBytes: number;

  @Column({ type: DataType.STRING(64), allowNull: false })
  declare sha256: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare subidoPor: number | null;

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => FleetDocument)
  declare fleetDocument?: FleetDocument;

  @BelongsTo(() => User, 'subidoPor')
  declare uploader?: User;
}
