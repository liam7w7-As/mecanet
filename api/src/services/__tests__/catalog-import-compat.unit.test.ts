import { resolveCatalogClassification } from '@unithor/shared';
import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { importCatalog } from '../import/catalog-import.service.js';

import type { ImportContext, ImportPlanRow } from '../import/import-plan.service.js';
import type { SpreadsheetData } from '../import/spreadsheet.service.js';
import type { Transaction } from 'sequelize';

const mocks = vi.hoisted(() => ({
  items: [] as Record<string, unknown>[],
  balances: [] as Record<string, unknown>[],
  warehouse: null as Record<string, unknown> | null,
  canStock: true,
  update: vi.fn(), create: vi.fn(), movement: vi.fn(),
}));

// Every model, inventory operation and import executor is replaced: this suite
// never imports the application database, main.ts or API global setup.
vi.mock('../../models/CatalogItem.js', () => ({ CatalogItem: {
  findAll: async () => mocks.items, create: mocks.create,
} }));
vi.mock('../../models/StockBalance.js', () => ({ StockBalance: { findAll: async () => mocks.balances } }));
vi.mock('../../models/Warehouse.js', () => ({ Warehouse: { findByPk: async () => mocks.warehouse } }));
vi.mock('../warehouse.service.js', () => ({ registerMovement: mocks.movement }));
vi.mock('../catalog-events.service.js', () => ({ publishCatalogChange: vi.fn() }));
vi.mock('../import/import-plan.service.js', () => ({
  getImportAccess: async () => ({ canStock: mocks.canStock }),
  applyImportAccess: (row: ImportPlanRow) => row,
  importContext: (actor?: ImportContext) => actor ?? {},
  importCell: (value: unknown) => value instanceof Date ? value.toISOString() : value ?? null,
  hasCell: (value: unknown) => value !== undefined && value !== null && String(value).trim() !== '',
  importRecordId: (row: { values: { id?: unknown } }) => row.values.id ? Number(row.values.id) : null,
  changesBetween: (before: Record<string, unknown>, after: Record<string, unknown>) =>
    Object.entries(after).filter(([key, value]) => value !== before[key])
      .map(([field, value]) => ({ field, before: before[field], after: value })),
  executePlannedImport: async (
    _module: string, _buffer: Buffer, _file: string, dryRun: boolean,
    _sheet: SpreadsheetData, _context: ImportContext,
    prepare: (transaction?: Transaction) => Promise<ImportPlanRow[]>,
  ) => {
    const rows = await prepare();
    if (!dryRun) for (const row of rows) {
      if (row.apply && ['valid', 'update'].includes(row.status)) await row.apply({} as Transaction);
    }
    return { rows };
  },
}));

const workbook = async (values: Record<string, string | number | null | undefined>): Promise<Buffer> => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Datos');
  sheet.addRow(Object.keys(values));
  sheet.addRow(Object.values(values));
  return Buffer.from(await book.xlsx.writeBuffer());
};

const existing = (overrides: Record<string, unknown> = {}) => ({
  id: 7, tipo: 'parte', division: 'MEC', subtipo: 'estandar', codigo: 'LEG-7',
  nombre: 'Filtro original', descripcion: 'Detalle conservado', unidadMedida: 'juego',
  precio: 123.45, stock: 0, stockMinimo: 3, horasHombreEstandar: null,
  deletedAt: null, updatedAt: new Date('2026-11-01T12:00:00Z'), update: mocks.update,
  ...overrides,
});

const balance = (warehouseId: number, cantidad: number) => ({
  id: warehouseId, catalogItemId: 7, warehouseId, cantidad,
  get: () => new Date('2026-11-01T12:00:00Z'),
});
const actor = { userId: 10, role: 'admin', warehouseId: 1 };

describe('catalog import legacy compatibility, without database', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.items = [existing()];
    mocks.balances = [];
    mocks.warehouse = { id: 1, codigo: 'W1', nombre: 'Principal', activo: true };
    mocks.canStock = true;
    mocks.create.mockImplementation(async (data: object) => ({ ...data, id: 50 }));
  });

  it.each(['parte', 'especifico'] as const)('normalizes legacy current %s before merging empty/unchanged-type PATCHes', (tipo) => {
    const current = { tipo, division: 'MEC' as const, subtipo: 'estandar' as const };
    const expected = { tipo, division: tipo === 'parte' ? 'ACC' : 'MEC', subtipo: tipo === 'parte' ? 'en_stock' : 'especifico' };
    expect(resolveCatalogClassification({}, current)).toEqual(expected);
    expect(resolveCatalogClassification({ tipo }, current)).toEqual(expected);
    expect(current).toEqual({ tipo, division: 'MEC', subtipo: 'estandar' });
  });

  it('merges a subtype-only PATCH against normalized legacy parts', () => {
    expect(resolveCatalogClassification({ subtipo: 'a_pedido' }, { tipo: 'parte', division: 'MEC', subtipo: 'estandar' }))
      .toEqual({ tipo: 'parte', division: 'ACC', subtipo: 'a_pedido' });
  });

  it('allows explicit classification changes from normalized legacy parts', () => {
    const current = { tipo: 'parte' as const, division: 'MEC' as const, subtipo: 'estandar' as const };
    expect(resolveCatalogClassification({ division: 'DP' }, current)).toEqual({ tipo: 'estandar', division: 'DP', subtipo: 'servicio_dp' });
    expect(resolveCatalogClassification({ tipo: 'estandar' }, current)).toEqual({ tipo: 'estandar', division: 'MEC', subtipo: 'estandar' });
  });

  it.each([{}, { División: null, Subtipo: ' ' }])('preserves legacy part identity with absent/blank new columns: %j', async (columns) => {
    const file = await workbook({ Tipo: 'Repuesto', Nombre: 'Filtro original', Precio: 123.45, Stock: null, ...columns });
    const result = await importCatalog(file, 'legacy.xlsx', false);
    expect(result.rows[0]).toMatchObject({ status: 'unchanged', existingId: 7, changes: [], values: { tipo: 'parte', division: 'ACC', subtipo: 'en_stock' } });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.movement).not.toHaveBeenCalled();
  });

  it('updates only supplied metadata and preserves explicit zero on a legacy part', async () => {
    const result = await importCatalog(await workbook({ Código: 'LEG-7', Nombre: null, Tipo: null, Precio: 0, 'Stock mínimo': 0, División: ' ', Subtipo: null }), 'legacy.xlsx', false);
    expect(result.rows[0]).toMatchObject({ status: 'update', values: { tipo: 'parte', division: 'ACC', descripcion: 'Detalle conservado' } });
    expect(mocks.update).toHaveBeenCalledWith({ precio: 0, stockMinimo: 0 }, expect.anything());
  });

  it('keeps a legacy specific service and does not invent a type change', async () => {
    mocks.items = [existing({ tipo: 'especifico', codigo: null, nombre: 'Diagnóstico', stock: 0, horasHombreEstandar: 2.5 })];
    const result = await importCatalog(await workbook({ Tipo: 'Servicio específico', Nombre: 'Diagnóstico', Horas: 0, Stock: 99 }), 'legacy.xlsx', false);
    expect(result.rows[0]).toMatchObject({ status: 'update', values: { tipo: 'especifico', division: 'MEC', subtipo: 'especifico', stock: 0 } });
    expect(mocks.update).toHaveBeenCalledWith({ horasHombreEstandar: 0 }, expect.anything());
    expect(mocks.movement).not.toHaveBeenCalled();
  });

  it.each([5, 12, 4, 0])('uses stock %i as the selected warehouse final balance, preserving the legacy part', async (stock) => {
    mocks.items = [existing({ stock: 12 })];
    mocks.balances = [balance(1, 5), balance(2, 7)];
    const result = await importCatalog(await workbook({ Código: 'LEG-7', Nombre: null, Stock: stock }), 'legacy.xlsx', false, actor);
    expect(result.rows[0]).toMatchObject({ status: stock === 5 ? 'unchanged' : 'update', values: { stock, stockGlobal: 12, stockTotalAlmacenes: 12, stockAlmacenActual: 5, tipo: 'parte' } });
    expect(mocks.update).not.toHaveBeenCalled();
    if (stock === 5) expect(mocks.movement).not.toHaveBeenCalled();
    else expect(mocks.movement).toHaveBeenCalledWith(expect.objectContaining({ warehouseId: 1, tipo: stock === 0 ? 'salida' : 'ajuste', cantidad: stock === 0 ? 5 : stock }), 10, expect.anything());
  });

  it.each([-1, 1.5, 'inválido', 2147483648])('reports invalid stock %s as an error without inventory conflicts', async (stock) => {
    mocks.items = [existing({ stock: 30 })];
    mocks.balances = [balance(1, 5)];
    mocks.warehouse = null;
    mocks.canStock = false;
    const result = await importCatalog(await workbook({ Código: 'LEG-7', Nombre: 'No guardar', Precio: 999, Stock: stock }), 'legacy.xlsx', false, actor);
    expect(result.rows[0].status).toBe('error');
    expect(result.rows[0].messages.join(' ')).not.toMatch(/conciliación|Selecciona un almacén|Necesitas permisos/);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.movement).not.toHaveBeenCalled();
  });

  it('still requires reconciliation for valid stock and permits metadata-only imports', async () => {
    mocks.items = [existing({ stock: 30 })];
    mocks.balances = [balance(1, 5)];
    const blocked = await importCatalog(await workbook({ Código: 'LEG-7', Nombre: null, Stock: 5 }), 'legacy.xlsx', false, actor);
    expect(blocked.rows[0]).toMatchObject({ status: 'conflict', messages: expect.arrayContaining([expect.stringContaining('conciliación')]) });
    const metadata = await importCatalog(await workbook({ Código: 'LEG-7', Nombre: null, Precio: 99, Stock: null }), 'legacy.xlsx', false, actor);
    expect(metadata.rows[0].status).toBe('update');
    expect(mocks.update).toHaveBeenCalledWith({ precio: 99 }, expect.anything());
    expect(mocks.movement).not.toHaveBeenCalled();
  });

  it('still requires stock permissions on legacy parts', async () => {
    mocks.canStock = false;
    const result = await importCatalog(await workbook({ Código: 'LEG-7', Nombre: null, Stock: 2 }), 'legacy.xlsx', false, actor);
    expect(result.rows[0]).toMatchObject({ status: 'conflict', messages: expect.arrayContaining([expect.stringContaining('almacen.read y almacen.create')]) });
    expect(mocks.movement).not.toHaveBeenCalled();
  });

  it.each(['parte', 'especifico'])('round-trips exported legacy %s defaults without changes', async (tipo) => {
    mocks.items = [existing({ tipo })];
    const file = await workbook({ ID: 7, Tipo: tipo, División: 'MEC', Subtipo: 'estandar', Código: 'LEG-7', Nombre: 'Filtro original', Precio: 123.45, Stock: null });
    const result = await importCatalog(file, 'roundtrip.xlsx', false);
    expect(result.rows[0]).toMatchObject({ status: 'unchanged', changes: [] });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.movement).not.toHaveBeenCalled();
  });

  it.each([
    { tipo: 'estandar', division: 'DP', subtipo: 'servicio_dp' },
    { tipo: 'parte', division: 'ACC', subtipo: 'a_pedido' },
    { tipo: 'especifico', division: 'MEC', subtipo: 'especifico' },
  ])('round-trips valid new classification $division/$subtipo without changes', async (classification) => {
    mocks.items = [existing(classification)];
    const file = await workbook({ ID: 7, Tipo: classification.tipo, División: classification.division, Subtipo: classification.subtipo, Nombre: 'Filtro original', Precio: 123.45, Stock: null });
    expect((await importCatalog(file, 'roundtrip.xlsx', false)).rows[0]).toMatchObject({ status: 'unchanged', changes: [] });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('does not accept contradictory classification on a new row as legacy defaults', async () => {
    mocks.items = [];
    const file = await workbook({ Tipo: 'parte', División: 'MEC', Subtipo: 'estandar', Nombre: 'Repuesto nuevo' });
    expect((await importCatalog(file, 'new.xlsx', false)).rows[0].status).toBe('error');
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
