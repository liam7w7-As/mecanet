import { NOTIFICATION_TYPES } from '@unithor/shared';
import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

/** Tipos vigentes antes de incorporar `acceso_compartido`. */
const LEGACY_NOTIFICATION_TYPES = NOTIFICATION_TYPES.filter(
  (type) => type !== 'acceso_compartido',
);

const getTipoColumn = async (
  queryInterface: QueryInterface,
): Promise<{ columnType: string } | null> => {
  const rows = (await queryInterface.sequelize.query(
    `SELECT COLUMN_TYPE AS columnType
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'notifications'
        AND COLUMN_NAME = 'tipo'`,
    { type: 'SELECT' },
  )) as unknown as Array<{ columnType: string }>;
  return rows[0] ?? null;
};

export async function up(queryInterface: QueryInterface): Promise<void> {
  const column = await getTipoColumn(queryInterface);
  if (!column) return;
  if (column.columnType.includes('acceso_compartido')) return;

  await queryInterface.changeColumn('notifications', 'tipo', {
    type: DataTypes.ENUM(...NOTIFICATION_TYPES),
    allowNull: false,
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const column = await getTipoColumn(queryInterface);
  if (!column || !column.columnType.includes('acceso_compartido')) return;

  // Sin filas con el tipo retirado, el ALTER inverso no pierde datos.
  await queryInterface.sequelize.query(
    "DELETE FROM notifications WHERE tipo = 'acceso_compartido'",
  );
  await queryInterface.changeColumn('notifications', 'tipo', {
    type: DataTypes.ENUM(...LEGACY_NOTIFICATION_TYPES),
    allowNull: false,
  });
}
