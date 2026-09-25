import { DataTypes } from 'sequelize';

import type { QueryInterface, Transaction } from 'sequelize';

const addStringColumn = async (
  queryInterface: QueryInterface,
  tableName: string,
  columnName: string,
  defaultValue: string,
  transaction: Transaction,
): Promise<void> => {
  const columns = await queryInterface.describeTable(tableName);
  if (!columns[columnName]) {
    await queryInterface.addColumn(
      tableName,
      columnName,
      { type: DataTypes.STRING(20), allowNull: false, defaultValue },
      { transaction },
    );
  }
};

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await addStringColumn(queryInterface, 'catalog_items', 'unidad_medida', 'unidad', transaction);
    await addStringColumn(queryInterface, 'work_order_items', 'tipo_linea', 'estandar', transaction);
    await addStringColumn(queryInterface, 'work_order_items', 'unidad_medida', 'unidad', transaction);
    await addStringColumn(queryInterface, 'quotation_items', 'tipo_linea', 'estandar', transaction);
    await addStringColumn(queryInterface, 'quotation_items', 'unidad_medida', 'unidad', transaction);
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    for (const [tableName, columnName] of [
      ['quotation_items', 'unidad_medida'],
      ['quotation_items', 'tipo_linea'],
      ['work_order_items', 'unidad_medida'],
      ['work_order_items', 'tipo_linea'],
      ['catalog_items', 'unidad_medida'],
    ]) {
      const columns = await queryInterface.describeTable(tableName);
      if (columns[columnName]) {
        await queryInterface.removeColumn(tableName, columnName, { transaction });
      }
    }
  });
}
