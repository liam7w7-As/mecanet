import { ROLES, type Role as RoleName } from '@unithor/shared';
import {
  AutoIncrement,
  BelongsToMany,
  Column,
  DataType,
  HasMany,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

import { Permission } from './Permission.js';
import { RolePermission } from './RolePermission.js';
import { User } from './User.js';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({
  tableName: 'roles',
  timestamps: true,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
})
export class Role extends Model<InferAttributes<Role>, InferCreationAttributes<Role>> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @Column({
    type: DataType.ENUM(...ROLES),
    allowNull: false,
    unique: true,
  })
  declare nombre: RoleName;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  declare descripcion: string | null;

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare updatedAt: CreationOptional<Date>;

  @HasMany(() => User)
  declare users?: User[];

  @BelongsToMany(() => Permission, () => RolePermission)
  declare permissions?: Permission[];
}
