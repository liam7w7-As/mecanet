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

import { Purchase } from './Purchase.js';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'suppliers',
  timestamps: true,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
})
export class Supplier extends Model<
  InferAttributes<Supplier>,
  InferCreationAttributes<Supplier>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @Index
  @Column({ type: DataType.STRING(180), allowNull: false })
  declare nombre: string;

  @Index
  @Column({ type: DataType.STRING(20), allowNull: true, unique: true })
  declare rut: string | null;

  @Column({ type: DataType.STRING(30), allowNull: true })
  declare telefono: string | null;

  @Column({ type: DataType.STRING(180), allowNull: true })
  declare email: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare direccion: string | null;

  @Column({ type: DataType.STRING(180), allowNull: true })
  declare contactoNombre: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare notas: string | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare datosCompletos: CreationOptional<boolean>;

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare updatedAt: CreationOptional<Date>;

  @HasMany(() => Purchase)
  declare purchases?: Purchase[];
}
