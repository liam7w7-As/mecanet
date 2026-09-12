import { ACTIONS, MODULES, type Action, type Module } from '@unithor/shared';
import {
  AutoIncrement,
  BelongsToMany,
  Column,
  DataType,
  Index,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

import { Role } from './Role.js';
import { RolePermission } from './RolePermission.js';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'permissions',
  timestamps: true,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
  indexes: [
    {
      unique: true,
      fields: ['modulo', 'accion'],
    },
  ],
})
export class Permission extends Model<
  InferAttributes<Permission>,
  InferCreationAttributes<Permission>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @Index
  @Column({
    type: DataType.ENUM(...MODULES),
    allowNull: false,
  })
  declare modulo: Module;

  @Index
  @Column({
    type: DataType.ENUM(...ACTIONS),
    allowNull: false,
  })
  declare accion: Action;

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare updatedAt: CreationOptional<Date>;

  @BelongsToMany(() => Role, () => RolePermission)
  declare roles?: Role[];
}
