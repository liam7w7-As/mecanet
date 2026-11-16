import { AutoIncrement, BeforeBulkDestroy, BeforeBulkUpdate, BeforeDestroy, BeforeUpdate, Column, DataType, ForeignKey, Model, PrimaryKey, Table } from 'sequelize-typescript';

import { Specialty } from './Specialty.js';
import { User } from './User.js';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

/** Historical rows are immutable; corrections require a later validity date. */
@Table({ indexes: [{ name: 'specialty_rates_validity_unique', fields: ['specialty_id', 'validity_from'], unique: true }], tableName: 'specialty_rates', timestamps: true, updatedAt: false, underscored: true, charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' })
export class SpecialtyRate extends Model<InferAttributes<SpecialtyRate>, InferCreationAttributes<SpecialtyRate>> {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @ForeignKey(() => Specialty)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare specialtyId: number;

  @Column({ type: DataType.DATEONLY, allowNull: false })
  declare validityFrom: string;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false }) declare costHourly: number;
  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false }) declare saleHourly: number;
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true }) declare createdBy: number | null;
  @Column(DataType.DATE) declare createdAt: CreationOptional<Date>;

  @BeforeUpdate @BeforeBulkUpdate @BeforeDestroy @BeforeBulkDestroy
  static rejectHistoryRewrite(): never { throw new Error('Las tarifas son históricas: registra una nueva vigencia'); }
}
