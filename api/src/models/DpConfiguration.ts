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

import type { DpConfiguration as DpConfigurationData } from '@unithor/shared';
import type {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
} from 'sequelize';

@Table({ tableName: 'dp_configurations', timestamps: true, underscored: true })
export class DpConfiguration extends Model<
  InferAttributes<DpConfiguration>,
  InferCreationAttributes<DpConfiguration>
> {
  @PrimaryKey
  @Column(DataType.INTEGER)
  declare id: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare revision: number;

  @Column({
    type: DataType.JSON,
    allowNull: false,
    get(this: DpConfiguration): DpConfigurationData {
      const value: unknown = this.getDataValue('configuration');
      return (typeof value === 'string' ? JSON.parse(value) : value) as DpConfigurationData;
    },
  })
  declare configuration: DpConfigurationData;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare updatedBy: CreationOptional<number | null>;

  @BelongsTo(() => User, 'updatedBy')
  declare lastEditor?: NonAttribute<User>;

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare updatedAt: CreationOptional<Date>;
}
