import type { QueryInterface } from 'sequelize';

const ROLES_SEED = [
  {
    nombre: 'desarrollador',
    descripcion: 'Acceso total al sistema (bypass de permisos)',
  },
  {
    nombre: 'admin',
    descripcion: 'Administrador general',
  },
  {
    nombre: 'jefe',
    descripcion: 'Jefe de taller / supervisor',
  },
  {
    nombre: 'vendedor',
    descripcion: 'Vendedor / asesor comercial',
  },
  {
    nombre: 'bodeguero',
    descripcion: 'Encargado de bodega y repuestos',
  },
];

export async function up(queryInterface: QueryInterface): Promise<void> {
  const now = new Date();

  // Consultar roles ya existentes para asegurar idempotencia
  const [existingRows] = (await queryInterface.sequelize.query(
    'SELECT nombre FROM roles WHERE nombre IN (:nombres);',
    {
      replacements: { nombres: ROLES_SEED.map((r) => r.nombre) },
    },
  )) as [{ nombre: string }[], unknown];

  const existingNombres = new Set(existingRows.map((r) => r.nombre));
  const toInsert = ROLES_SEED.filter((r) => !existingNombres.has(r.nombre)).map((r) => ({
    ...r,
    created_at: now,
    updated_at: now,
  }));

  if (toInsert.length > 0) {
    await queryInterface.bulkInsert('roles', toInsert);
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const nombres = ROLES_SEED.map((r) => r.nombre);
  await queryInterface.bulkDelete('roles', {
    nombre: nombres,
  });
}
