import { AutoIncrement, Column, DataType, ForeignKey, Model, PrimaryKey, Table } from 'sequelize-typescript';

import { Specialty } from './Specialty.js';
import { User } from './User.js';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

/** Skill membership is independent of the user's authorization role. */
@Table({ indexes: [{ name: 'worker_specialties_membership_unique', fields: ['user_id', 'specialty_id'], unique: true }], tableName: 'worker_specialties', timestamps: true, underscored: true, charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' })
export class WorkerSpecialty extends Model<InferAttributes<WorkerSpecialty>, InferCreationAttributes<WorkerSpecialty>> {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) declare id: CreationOptional<number>;
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false }) declare userId: number;
  @ForeignKey(() => Specialty)
  @Column({ type: DataType.INTEGER, allowNull: false }) declare specialtyId: number;
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false }) declare isPrincipal: boolean;
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true }) declare updatedBy: number | null;
  @Column(DataType.DATE) declare createdAt: CreationOptional<Date>;
  @Column(DataType.DATE) declare updatedAt: CreationOptional<Date>;
}
