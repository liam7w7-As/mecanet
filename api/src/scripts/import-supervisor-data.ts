/**
 * Importación de datos del supervisor (catálogo, vehículos y clientes).
 * Fuentes: prudctos.xlsx (inventario UNITHOR) y Vehiculos_Clientes.xlsx.
 *
 * - Repuestos: filas con CODIGO (UNT...) -> tipo 'parte', con stock.
 * - Servicios: filas sin código -> 'especifico' si es mano de obra
 *   (instalación, pintura, cambio, mantención...), si no 'estandar'.
 * - Vehículos: PATENTE + MARCA; clientes desde PROPIETARIO (sin RUT
 *   en el excel, se crean solo con nombre + tipo heurístico).
 * - Idempotente: salta lo ya existente (código / nombre / patente).
 * - Genera snapshot JSON en database/seeders/data/ para replicar en
 *   producción (Hostinger) con el seeder 006.
 *
 * Uso: npx tsx src/scripts/import-supervisor-data.ts [productos.xlsx] [vehiculos.xlsx]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

import { sequelize } from '../config/database.js';
import { CatalogItem } from '../models/CatalogItem.js';
import { Client } from '../models/Client.js';
import { Vehicle } from '../models/Vehicle.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_PRODUCTS = 'C:\\Users\\UnseR\\Desktop\\prudctos.xlsx';
const DEFAULT_VEHICLES = 'C:\\Users\\UnseR\\Desktop\\Vehiculos_Clientes.xlsx';

const SKIP_NAMES = new Set(['producto de prueba']);

const ESPECIFICO_PATTERNS = [
  /INSTAL/i, /SERVICIO/i, /CAMBIO/i, /MANTEN/i, /PINTURA/i, /PINTA/i,
  /REPARA/i, /DIAGNOST/i, /REVISI/i, /MANO DE OBRA/i, /PULID/i, /DESABOLL/i,
  /ALINEA/i, /BALANCEO/i, /SCANNER/i, /TAPIZ/i, /POLARIZ/i, /RECTIFIC/i,
  /SOLDAD/i, /DESMONT/i, /MONTAJE/i, /CALIBR/i, /PROGRAMA/i, /ACTUALIZA/i,
  /UP GRADE/i, /CONVERSION/i, /REGENERACI/i, /LIMPIEZA/i, /GRABADO/i,
];

const EMPRESA_PATTERNS =
  /S\.?\s?A\.?|SPA\b|LTDA|E\.?I\.?R\.?L|FUNDACI[OÓ]N|ASOC|SOC\.|CORP|HOLDING|MINER[AO]S|COLEGIO|TRANSPORTES|COSEDUCAM|GOBIERNO|MUNICIPAL/i;

const normalizeName = (value: string): string =>
  value.trim().replace(/\s+/g, ' ').replace(/[.]+$/g, '').trim();

const normalizeKey = (value: string): string => normalizeName(value).toLowerCase();

const classifyService = (descripcion: string): 'especifico' | 'estandar' =>
  ESPECIFICO_PATTERNS.some((pattern) => pattern.test(descripcion)) ? 'especifico' : 'estandar';

const clientTypeOf = (nombre: string): 'cliente' | 'empresa' =>
  EMPRESA_PATTERNS.test(nombre) ? 'empresa' : 'cliente';

const capitalize = (value: string): string =>
  value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

interface CatalogRow {
  tipo: 'parte' | 'estandar' | 'especifico';
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  precio: number;
  stock: number;
}

interface VehicleRow {
  patente: string;
  marca: string | null;
  propietario: string;
}

const readCatalog = async (filePath: string): Promise<CatalogRow[]> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet(1);
  if (!sheet) throw new Error(`Sin hojas en ${filePath}`);

  const rows: CatalogRow[] = [];
  const seenKeys = new Set<string>();

  for (let r = 6; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const codigo = String(row.getCell(1).value ?? '').trim().toUpperCase();
    const descripcion = String(row.getCell(2).value ?? '').trim();
    const stock = Number(row.getCell(6).value ?? 0);
    if (!descripcion || SKIP_NAMES.has(normalizeKey(descripcion))) continue;

    if (codigo) {
      const key = `code:${codigo}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      rows.push({
        tipo: 'parte',
        codigo,
        nombre: normalizeName(descripcion).slice(0, 180),
        descripcion: descripcion.slice(0, 500),
        precio: 0,
        stock: Number.isFinite(stock) && stock > 0 ? Math.trunc(stock) : 0,
      });
    } else {
      const nombre = normalizeName(descripcion).slice(0, 180);
      const key = `name:${normalizeKey(nombre)}`;
      if (!nombre || seenKeys.has(key)) continue;
      seenKeys.add(key);
      rows.push({
        tipo: classifyService(nombre),
        codigo: null,
        nombre,
        descripcion: null,
        precio: 0,
        stock: 0,
      });
    }
  }

  return rows;
};

const readVehicles = async (filePath: string): Promise<VehicleRow[]> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet(1);
  if (!sheet) throw new Error(`Sin hojas en ${filePath}`);

  const rows: VehicleRow[] = [];
  const seenPatents = new Set<string>();

  for (let r = 6; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const patente = String(row.getCell(2).value ?? '').trim().toUpperCase();
    const propietario = String(row.getCell(3).value ?? '').trim();
    const marcaRaw = String(row.getCell(4).value ?? '').trim();
    if (!patente || !propietario || seenPatents.has(patente)) continue;
    seenPatents.add(patente);
    rows.push({ patente, marca: marcaRaw ? capitalize(marcaRaw) : null, propietario });
  }

  return rows;
};

const main = async (): Promise<void> => {
  const productsPath = process.argv[2] ?? DEFAULT_PRODUCTS;
  const vehiclesPath = process.argv[3] ?? DEFAULT_VEHICLES;

  const catalogRows = await readCatalog(productsPath);
  const vehicleRows = await readVehicles(vehiclesPath);

  const partes = catalogRows.filter((item) => item.tipo === 'parte').length;
  const especificos = catalogRows.filter((item) => item.tipo === 'especifico').length;
  const estandar = catalogRows.filter((item) => item.tipo === 'estandar').length;
  console.log(`Excel: ${catalogRows.length} catálogo (parte=${partes} especifico=${especificos} estandar=${estandar}), ${vehicleRows.length} vehículos`);

  await sequelize.authenticate();

  // --- Catálogo idempotente ---
  const existingCatalog = await CatalogItem.findAll({ attributes: ['codigo', 'nombre'] });
  const existingCodes = new Set(existingCatalog.map((item) => item.codigo).filter(Boolean) as string[]);
  const existingNames = new Set(existingCatalog.map((item) => item.nombre));
  let catalogInserted = 0;
  for (const item of catalogRows) {
    if ((item.codigo && existingCodes.has(item.codigo)) || existingNames.has(item.nombre)) continue;
    await CatalogItem.create({ ...item });
    catalogInserted += 1;
    if (item.codigo) existingCodes.add(item.codigo);
    existingNames.add(item.nombre);
  }

  // --- Clientes idempotentes (por nombre exacto) ---
  const ownerNames = [...new Set(vehicleRows.map((row) => row.propietario))];
  const existingClients = await Client.findAll({ attributes: ['id', 'nombre'] });
  const clientByName = new Map(existingClients.map((client) => [client.nombre, client.id]));
  let clientsInserted = 0;
  for (const nombre of ownerNames) {
    if (clientByName.has(nombre)) continue;
    const client = await Client.create({ nombre, tipo: clientTypeOf(nombre) });
    clientByName.set(nombre, client.id);
    clientsInserted += 1;
  }

  // --- Vehículos idempotentes (por patente) ---
  const existingVehicles = await Vehicle.findAll({ attributes: ['patente'] });
  const existingPatents = new Set(existingVehicles.map((vehicle) => vehicle.patente.toUpperCase()));
  let vehiclesInserted = 0;
  for (const row of vehicleRows) {
    if (existingPatents.has(row.patente)) continue;
    await Vehicle.create({ patente: row.patente, marca: row.marca, clientId: clientByName.get(row.propietario) ?? null });
    vehiclesInserted += 1;
    existingPatents.add(row.patente);
  }

  // --- Snapshot para el seeder de producción ---
  const snapshotDir = path.resolve(__dirname, '../database/seeders/data');
  fs.mkdirSync(snapshotDir, { recursive: true });
  fs.writeFileSync(
    path.join(snapshotDir, 'supervisor-import.json'),
    JSON.stringify({ catalog: catalogRows, vehicles: vehicleRows }, null, 1),
  );

  console.log(`Insertado: catálogo=${catalogInserted} clientes=${clientsInserted} vehículos=${vehiclesInserted}`);
  console.log('Snapshot guardado en database/seeders/data/supervisor-import.json');
  await sequelize.close();
};

main().catch((error) => {
  console.error('Importación fallida:', error);
  process.exit(1);
});
