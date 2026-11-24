import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

import { User } from './User.js';

import type { DpConfiguration } from '@unithor/shared';
import type {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
} from 'sequelize';

@Table({
  tableName: 'dp_configuration_revisions',
  timestamps: true,
  updatedAt: false,
  underscored: true,
})
export class DpConfigurationRevision extends Model<
  InferAttributes<DpConfigurationRevision>,
  InferCreationAttributes<DpConfigurationRevision>
> {
  @PrimaryKey
  @Column(DataType.INTEGER)
  declare revision: number;

  @Column({
    type: DataType.JSON,
    allowNull: false,
    get(this: DpConfigurationRevision): DpConfiguration {
      const value: unknown = this.getDataValue('configuration');
      return (typeof value === 'string' ? JSON.parse(value) : value) as DpConfiguration;
    },
  })
  declare configuration: DpConfiguration;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare createdBy: CreationOptional<number | null>;

  @BelongsTo(() => User, 'createdBy')
  declare editor?: NonAttribute<User>;

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;
}
