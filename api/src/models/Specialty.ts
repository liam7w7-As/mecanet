import { AutoIncrement, Column, DataType, Index, Model, PrimaryKey, Table } from 'sequelize-typescript';

import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

@Table({ tableName: 'specialties', timestamps: true, underscored: true, charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' })
export class Specialty extends Model<InferAttributes<Specialty>, InferCreationAttributes<Specialty>> {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  @Index({ name: 'specialties_name_unique', unique: true })
  @Column({ type: DataType.STRING(100), allowNull: false })
  declare name: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare active: CreationOptional<boolean>;

  @Column(DataType.DATE) declare createdAt: CreationOptional<Date>;
  @Column(DataType.DATE) declare updatedAt: CreationOptional<Date>;
}
