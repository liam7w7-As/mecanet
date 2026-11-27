import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

export async function up(qi: QueryInterface): Promise<void> {
  const purchases = await qi.describeTable('purchases');
  if (!purchases.express_destination)
    await qi.addColumn('purchases', 'express_destination', {
      type: DataTypes.STRING(12),
      allowNull: true,
    });
  if (!purchases.express_completed_at)
    await qi.addColumn('purchases', 'express_completed_at', {
      type: DataTypes.DATE,
      allowNull: true,
    });
  if (!purchases.confirmed_at)
    await qi.addColumn('purchases', 'confirmed_at', { type: DataTypes.DATE, allowNull: true });
  if (!purchases.confirmed_by)
    await qi.addColumn('purchases', 'confirmed_by', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });

  const movements = await qi.describeTable('cash_movements');
  if (!movements.ledger)
    await qi.addColumn('cash_movements', 'ledger', {
      type: DataTypes.STRING(12),
      allowNull: false,
      defaultValue: 'taller',
    });
  const indexes = (await qi.showIndex('cash_movements')) as unknown as Array<{ name: string }>;
  if (!indexes.some((index) => index.name === 'cash_movements_ledger_fecha_idx')) {
    await qi.addIndex('cash_movements', ['ledger', 'fecha'], {
      name: 'cash_movements_ledger_fecha_idx',
    });
  }
}
