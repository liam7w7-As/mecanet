import type { QueryInterface } from 'sequelize';

const MODULES = ['taller', 'comercial', 'finanzas', 'flota', 'admin'] as const;
type Module = (typeof MODULES)[number];

const ACTIONS = ['read', 'create', 'update', 'delete', 'export', 'import'] as const;
type Action = (typeof ACTIONS)[number];

export async function up(queryInterface: QueryInterface): Promise<void> {
  const now = new Date();

  // Generar los pares módulo/acción del catálogo RBAC.
  const allPermissions: { modulo: Module; accion: Action }[] = [];
  for (const modulo of MODULES) {
    for (const accion of ACTIONS) {
      allPermissions.push({ modulo, accion });
    }
  }

  // Consultar permisos existentes para idempotencia
  const [existingRows] = (await queryInterface.sequelize.query(
    'SELECT modulo, accion FROM permissions;',
  )) as [{ modulo: string; accion: string }[], unknown];

  const existingSet = new Set(existingRows.map((r) => `${r.modulo}:${r.accion}`));

  const toInsert = allPermissions
    .filter((p) => !existingSet.has(`${p.modulo}:${p.accion}`))
    .map((p) => ({
      modulo: p.modulo,
      accion: p.accion,
      created_at: now,
      updated_at: now,
    }));

  if (toInsert.length > 0) {
    await queryInterface.bulkInsert('permissions', toInsert);
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.bulkDelete('permissions', {
    modulo: [...MODULES],
    accion: [...ACTIONS],
  });
}
