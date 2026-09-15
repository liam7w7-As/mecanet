import {
  AutoIncrement,
  BeforeBulkCreate,
  BeforeValidate,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Index,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

import { RefreshToken } from './RefreshToken.js';
import { Role } from './Role.js';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'users',
  timestamps: true,
  paranoid: true,
  underscored: true,
  deletedAt: 'deleted_at',
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
})
export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @Column({
    type: DataType.STRING(120),
    allowNull: false,
  })
  declare nombre: string;

  @Index({ name: 'users_username_unique', unique: true })
  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  declare username: CreationOptional<string>;

  @Index
  @Column({
    type: DataType.STRING(180),
    allowNull: false,
    unique: true,
  })
  declare email: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  declare passwordHash: string;

  @ForeignKey(() => Role)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  declare roleId: number;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  declare activo: CreationOptional<boolean>;

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare updatedAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare deletedAt: CreationOptional<Date | null>;

  @BelongsTo(() => Role)
  declare role?: Role;

  @HasMany(() => RefreshToken)
  declare refreshTokens?: RefreshToken[];

  @BeforeValidate
  static normalizeUsername(user: User): void {
    const fallback = user.email?.split('@')[0] ?? '';
    user.username = (user.username || fallback).trim().toLowerCase();
  }

  @BeforeBulkCreate
  static normalizeBulkUsernames(users: User[]): void {
    users.forEach((user) => User.normalizeUsername(user));
  }
}
