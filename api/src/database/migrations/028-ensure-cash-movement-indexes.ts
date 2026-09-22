import type { QueryInterface } from 'sequelize';

const indexExists = async (
  queryInterface: QueryInterface,
  indexName: string,
): Promise<boolean> => {
  const indexes = (await queryInterface.showIndex('cash_movements')) as unknown as Array<{
    name: string;
  }>;
  return indexes.some((index) => index.name === indexName);
};

export async function up(queryInterface: QueryInterface): Promise<void> {
  if (!(await indexExists(queryInterface, 'cash_movements_fecha_voided_idx'))) {
    await queryInterface.addIndex('cash_movements', ['fecha', 'voided_at'], {
      name: 'cash_movements_fecha_voided_idx',
    });
  }
  if (!(await indexExists(queryInterface, 'cash_movements_tipo_metodo_idx'))) {
    await queryInterface.addIndex('cash_movements', ['tipo', 'metodo'], {
      name: 'cash_movements_tipo_metodo_idx',
    });
  }
  if (!(await indexExists(queryInterface, 'cash_movements_created_by_idx'))) {
    await queryInterface.addIndex('cash_movements', ['created_by'], {
      name: 'cash_movements_created_by_idx',
    });
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  if (await indexExists(queryInterface, 'cash_movements_created_by_idx')) {
    await queryInterface.removeIndex('cash_movements', 'cash_movements_created_by_idx');
  }
  if (await indexExists(queryInterface, 'cash_movements_tipo_metodo_idx')) {
    await queryInterface.removeIndex('cash_movements', 'cash_movements_tipo_metodo_idx');
  }
  if (await indexExists(queryInterface, 'cash_movements_fecha_voided_idx')) {
    await queryInterface.removeIndex('cash_movements', 'cash_movements_fecha_voided_idx');
  }
}
