import { updateWorkshopScheduleSchema } from '@unithor/shared';
import { Column, DataType, ForeignKey, Model, PrimaryKey, Table } from 'sequelize-typescript';

import { User } from './User.js';

import type { WorkshopWeeklyDay } from '@unithor/shared';
import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

/** Singleton id=1. An empty weekly array explicitly means unconfigured. */
@Table({ tableName: 'workshop_schedules', timestamps: true, underscored: true, charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' })
export class WorkshopSchedule extends Model<InferAttributes<WorkshopSchedule>, InferCreationAttributes<WorkshopSchedule>> {
  @PrimaryKey @Column(DataType.INTEGER) declare id: number;
  @Column({ type: DataType.STRING(64), allowNull: false }) declare timezone: string;
  @Column({
    type: DataType.JSON,
    allowNull: false,
    get(this: WorkshopSchedule): WorkshopWeeklyDay[] {
      const stored: unknown = this.getDataValue('weekly');
      let value: unknown = stored;
      if (typeof stored === 'string') {
        try { value = JSON.parse(stored); }
        catch { throw new Error('El horario semanal almacenado no contiene JSON válido'); }
      }
      // MariaDB may expose JSON as LONGTEXT. Never pass a string/object on to consumers.
      const parsed = updateWorkshopScheduleSchema.safeParse({ timezone: 'UTC', weekly: value });
      if (!parsed.success) throw new Error('El horario semanal almacenado es inválido');
      return parsed.data.weekly;
    },
  }) declare weekly: WorkshopWeeklyDay[];
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true }) declare updatedBy: number | null;
  @Column(DataType.DATE) declare createdAt: CreationOptional<Date>;
  @Column(DataType.DATE) declare updatedAt: CreationOptional<Date>;
}
