import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

const discounts = {
  descuento_tipo: { type: DataTypes.STRING(15), allowNull: true },
  descuento_valor: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
};
const additions = {
  quotations: {
    ...discounts,
    forma_pago: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'transferencia' },
    disponibilidad_trabajo: { type: DataTypes.STRING(200), allowNull: true },
    validez_dias: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
  },
  quotation_items: discounts,
};

export async function up(queryInterface: QueryInterface): Promise<void> {
  for (const [table, columns] of Object.entries(additions)) {
    const existing = await queryInterface.describeTable(table);
    for (const [column, definition] of Object.entries(columns)) {
      if (!existing[column]) await queryInterface.addColumn(table, column, definition);
    }
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  for (const [table, columns] of Object.entries(additions)) {
    const existing = await queryInterface.describeTable(table);
    for (const column of Object.keys(columns)) {
      if (existing[column]) await queryInterface.removeColumn(table, column);
    }
  }
}
