import type { QueryInterface } from 'sequelize';

/**
 * La bodega CENTRAL es la que `getDefaultWarehouse` busca por codigo para
 * descontar stock, y antes de este seeder no la creaba nadie: vivia en la base
 * de tests desde un origen pasado y `work-order-mechanic.test.ts` dependia de
 * ella sin crearla. Con la bodega garantizada por el seed, la linea base de la
 * base ya no depende de que otro archivo haya pasado antes.
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  const [existing] = (await queryInterface.sequelize.query(
    "SELECT id FROM warehouses WHERE codigo = 'CENTRAL' LIMIT 1;",
  )) as [{ id: number }[], unknown];

  if (existing.length > 0) return;

  const now = new Date();

  await queryInterface.bulkInsert('warehouses', [
    {
      codigo: 'CENTRAL',
      nombre: 'Bodega Central',
      direccion: 'Casa Matriz',
      activo: true,
      created_at: now,
      updated_at: now,
    },
  ]);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.bulkDelete('warehouses', { codigo: 'CENTRAL' });
}
