import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { QueryInterface } from 'sequelize';

/**
 * Datos del supervisor (inventario UNITHOR + vehículos/clientes).
 * Snapshot generado por src/scripts/import-supervisor-data.ts
 * desde prudctos.xlsx y Vehiculos_Clientes.xlsx.
 * Idempotente: salta códigos, nombres y patentes ya existentes.
 */

interface SnapshotCatalogRow {
  tipo: 'parte' | 'estandar' | 'especifico';
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  precio: number;
  stock: number;
}

interface SnapshotVehicleRow {
  patente: string;
  marca: string | null;
  propietario: string;
}

const EMPRESA_PATTERN =
  /S\.?\s?A\.?|SPA\b|LTDA|E\.?I\.?R\.?L|FUNDACI[OÓ]N|ASOC|SOC\.|CORP|HOLDING|MINER[AO]S|COLEGIO|TRANSPORTES|COSEDUCAM|GOBIERNO|MUNICIPAL/i;

const loadSnapshot = (): { catalog: SnapshotCatalogRow[]; vehicles: SnapshotVehicleRow[] } => {
  const snapshotPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    'data/supervisor-import.json',
  );
  return JSON.parse(fs.readFileSync(snapshotPath, 'utf-8')) as {
    catalog: SnapshotCatalogRow[];
    vehicles: SnapshotVehicleRow[];
  };
};

export async function up(queryInterface: QueryInterface): Promise<void> {
  const now = new Date();
  const { catalog, vehicles } = loadSnapshot();
  const sequelize = queryInterface.sequelize;

  // --- Catálogo ---
  const [existingItems] = (await sequelize.query(
    'SELECT codigo, nombre FROM catalog_items;',
  )) as [{ codigo: string | null; nombre: string }[], unknown];
  const existingCodes = new Set(existingItems.filter((i) => i.codigo).map((i) => i.codigo));
  const existingNames = new Set(existingItems.map((i) => i.nombre));

  const catalogToInsert = catalog
    .filter((item) => {
      if (item.codigo && existingCodes.has(item.codigo)) return false;
      if (existingNames.has(item.nombre)) return false;
      existingNames.add(item.nombre);
      if (item.codigo) existingCodes.add(item.codigo);
      return true;
    })
    .map((item) => ({ ...item, created_at: now, updated_at: now, deleted_at: null }));

  if (catalogToInsert.length > 0) {
    await queryInterface.bulkInsert('catalog_items', catalogToInsert);
  }

  // --- Clientes (desde propietarios, sin RUT en el excel) ---
  const [existingClients] = (await sequelize.query('SELECT id, nombre FROM clients;')) as [
    { id: number; nombre: string }[],
    unknown,
  ];
  const clientIdByName = new Map(existingClients.map((c) => [c.nombre, c.id]));
  const owners = [...new Set(vehicles.map((v) => v.propietario))];
  for (const nombre of owners) {
    if (clientIdByName.has(nombre)) continue;
    await queryInterface.bulkInsert('clients', [
      {
        nombre,
        tipo: EMPRESA_PATTERN.test(nombre) ? 'empresa' : 'cliente',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
    ]);
    const [rows] = (await sequelize.query('SELECT id FROM clients WHERE nombre = ? LIMIT 1;', {
      replacements: [nombre],
    })) as [{ id: number }[], unknown];
    if (rows[0]) clientIdByName.set(nombre, rows[0].id);
  }

  // --- Vehículos ---
  const [existingVehicles] = (await sequelize.query('SELECT patente FROM vehicles;')) as [
    { patente: string }[],
    unknown,
  ];
  const existingPatents = new Set(existingVehicles.map((v) => v.patente.toUpperCase()));
  const vehiclesToInsert = vehicles
    .filter((v) => {
      if (existingPatents.has(v.patente)) return false;
      existingPatents.add(v.patente);
      return true;
    })
    .map((v) => ({
      patente: v.patente,
      marca: v.marca,
      client_id: clientIdByName.get(v.propietario) ?? null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }));

  if (vehiclesToInsert.length > 0) {
    await queryInterface.bulkInsert('vehicles', vehiclesToInsert);
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const { catalog, vehicles } = loadSnapshot();
  const sequelize = queryInterface.sequelize;
  const codigos = catalog.map((i) => i.codigo).filter(Boolean) as string[];
  const nombres = catalog.map((i) => i.nombre);
  const patentes = vehicles.map((v) => v.patente);

  if (codigos.length > 0 || nombres.length > 0) {
    await sequelize.query('DELETE FROM catalog_items WHERE codigo IN (:codigos) OR nombre IN (:nombres);', {
      replacements: { codigos: codigos.length > 0 ? codigos : ['__none__'], nombres },
    });
  }
  if (patentes.length > 0) {
    await sequelize.query('DELETE FROM vehicles WHERE patente IN (:patentes);', {
      replacements: { patentes },
    });
  }
}
