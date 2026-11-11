import { SALES_ACCESS_SCOPE_TYPES } from '@unithor/shared';
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

import { User } from './User.js';

import type { SalesAccessScopeType } from '@unithor/shared';
import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

/**
 * Concesión puntual de acceso a una OT/COT ajena para una vendedora.
 * No cambia la propiedad del registro (`created_by` / `asesor_id`): la amplía.
 */
@Table({
  tableName: 'sales_access_grants',
  timestamps: true,
  underscored: true,
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci',
  indexes: [
    {
      name: 'sales_access_grants_unique',
      fields: ['user_id', 'scope_type', 'target_id'],
      unique: true,
    },
    { name: 'sales_access_grants_user_expiry', fields: ['user_id', 'expires_at'] },
  ],
})
export class SalesAccessGrant extends Model<
  InferAttributes<SalesAccessGrant>,
  InferCreationAttributes<SalesAccessGrant>
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: CreationOptional<number>;

  /** Vendedora que recibe el acceso. */
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare userId: number;

  @Column({ type: DataType.ENUM(...SALES_ACCESS_SCOPE_TYPES), allowNull: false })
  declare scopeType: SalesAccessScopeType;

  /** ID de la OT o COT compartida, según `scopeType`. */
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare targetId: number;

  /** Administrador que otorgó el acceso (auditoría). */
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare grantedBy: CreationOptional<number | null>;

  @Column({ type: DataType.DATE, allowNull: true })
  declare expiresAt: CreationOptional<Date | null>;

  @Column(DataType.DATE)
  declare createdAt: CreationOptional<Date>;

  @Column(DataType.DATE)
  declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => User, 'userId')
  declare user?: User;

  @BelongsTo(() => User, 'grantedBy')
  declare grantedByUser?: User;
}
