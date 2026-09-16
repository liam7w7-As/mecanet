import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

const statusColumn = {
  type: DataTypes.ENUM('pendiente', 'en_proceso', 'completado', 'omitido'),
  allowNull: false,
  defaultValue: 'pendiente',
};

const notesColumn = {
  type: DataTypes.TEXT,
  allowNull: true,
};

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.addColumn('work_order_items', 'estado_operativo', statusColumn, {
      transaction,
    });
    await queryInterface.addColumn('work_order_items', 'notas_operativas', notesColumn, {
      transaction,
    });
    await queryInterface.addColumn('quotation_items', 'estado_operativo', statusColumn, {
      transaction,
    });
    await queryInterface.addColumn('quotation_items', 'notas_operativas', notesColumn, {
      transaction,
    });
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.removeColumn('quotation_items', 'notas_operativas', { transaction });
    await queryInterface.removeColumn('quotation_items', 'estado_operativo', { transaction });
    await queryInterface.removeColumn('work_order_items', 'notas_operativas', { transaction });
    await queryInterface.removeColumn('work_order_items', 'estado_operativo', { transaction });
  });
}
