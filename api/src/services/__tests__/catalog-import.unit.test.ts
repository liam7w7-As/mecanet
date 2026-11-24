import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { importCatalog } from '../import/catalog-import.service.js';

import type { ImportContext, ImportPlanRow } from '../import/import-plan.service.js';
import type { SpreadsheetData } from '../import/spreadsheet.service.js';
import type { Transaction } from 'sequelize';

const mocks = vi.hoisted(() => ({
  items: [] as Record<string, unknown>[],
  balances: [] as Record<string, unknown>[],
  create: vi.fn(), update: vi.fn(), notify: vi.fn(), movement: vi.fn(),
}));
vi.mock('../../models/CatalogItem.js', () => ({ CatalogItem: {
  findAll: async () => mocks.items, create: mocks.create,
} }));
vi.mock('../../models/StockBalance.js', () => ({ StockBalance: { findAll: async () => mocks.balances } }));
vi.mock('../../models/Warehouse.js', () => ({ Warehouse: { findByPk: async () => null } }));
vi.mock('../warehouse.service.js', () => ({ registerMovement: mocks.movement }));
vi.mock('../catalog-events.service.js', () => ({ publishCatalogChange: mocks.notify }));
vi.mock('../import/import-plan.service.js', () => ({
  getImportAccess: async () => ({}),
  applyImportAccess: (row: ImportPlanRow) => row,
  importContext: (actor?: ImportContext) => actor ?? {},
  importCell: (value: unknown) => value instanceof Date ? value.toISOString() : value,
  hasCell: (value: unknown) => value !== undefined && value !== null && value !== '',
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
    let created = 0;
    let updated = 0;
    if (!dryRun) for (const row of rows) {
      if (row.apply && ['valid', 'update'].includes(row.status)) {
        await row.apply({} as Transaction);
        if (row.status === 'valid') created++;
        else updated++;
      }
    }
    return { rows, created, updated };
  },
}));

const spreadsheet = async (values: Record<string, string | number | undefined>): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Datos');
  sheet.addRow(Object.keys(values));
  sheet.addRow(Object.values(values));
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

describe('catalog division import, without application database', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.items = [];
    mocks.balances = [];
    mocks.create.mockImplementation(async (data: object) => ({ ...data, id: 50 }));
  });

  it.each([
    { division: 'D&P', subtipo: 'servicio_dp', expectedDivision: 'DP', expectedType: 'estandar' },
    { division: 'ACC', subtipo: 'a pedido', expectedDivision: 'ACC', expectedType: 'parte' },
    { division: 'MEC', subtipo: 'específico', expectedDivision: 'MEC', expectedType: 'especifico' },
  ])('persists and previews normalized $division/$subtipo classification', async ({ division, subtipo, expectedDivision, expectedType }) => {
    const file = await spreadsheet({ Nombre: 'Trabajo especial', División: division, Subtipo: subtipo, Precio: 0, 'Horas hombre estándar': 3.5 });
    const preview = await importCatalog(file, 'catalogo.xlsx', true);
    expect(preview.rows[0]).toMatchObject({ status: 'valid', values: {
      division: expectedDivision, tipo: expectedType, precio: 0, horasHombreEstandar: 3.5,
    } });
    expect(mocks.notify).not.toHaveBeenCalled();
    const result = await importCatalog(file, 'catalogo.xlsx', false);
    expect(result.created).toBe(1);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      division: expectedDivision, tipo: expectedType, precio: 0, horasHombreEstandar: 3.5,
      subtipo: expectedDivision === 'DP' ? 'servicio_dp' : expectedDivision === 'ACC' ? 'a_pedido' : 'especifico',
    }), expect.anything());
    expect(mocks.notify).toHaveBeenCalledOnce();
  });

  it('legacy code-based parts inherit ACC/en_stock rather than model MEC defaults', async () => {
    await importCatalog(await spreadsheet({ Código: 'abc123', Nombre: 'Filtro' }), 'legacy.xlsx', false);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'parte', division: 'ACC', subtipo: 'en_stock', codigo: 'ABC123' }), expect.anything());
  });

  const existing = (overrides: Record<string, unknown> = {}) => ({
    id: 7, codigo: 'PIEZA-7', nombre: 'Puerta', descripcion: null,
    tipo: 'estandar', division: 'DP', subtipo: 'servicio_dp', unidadMedida: 'servicio',
    precio: 90000, stock: 0, stockMinimo: 0, horasHombreEstandar: 3.5,
    deletedAt: null, updatedAt: new Date('2026-11-01T12:00:00Z'), update: mocks.update,
    ...overrides,
  });

  it('keeps DP classification and estimated hours when an old template changes only its price', async () => {
    mocks.items = [existing()];
    const result = await importCatalog(await spreadsheet({ ID: 7, Nombre: 'Puerta', Precio: 95000 }), 'legacy.xlsx', false);
    expect(result.rows[0]).toMatchObject({ status: 'update', values: { division: 'DP', subtipo: 'servicio_dp', horasHombreEstandar: 3.5 } });
    expect(mocks.update).toHaveBeenCalledWith({ precio: 95000 }, expect.anything());
  });

  it('previews and persists a subtype-only change against the current ACC record', async () => {
    mocks.items = [existing({ tipo: 'parte', division: 'ACC', subtipo: 'en_stock' })];
    const result = await importCatalog(await spreadsheet({ ID: 7, Nombre: 'Puerta', Subtipo: 'a_pedido' }), 'catalog.xlsx', false);
    expect(result.rows[0].changes).toContainEqual(expect.objectContaining({ field: 'subtipo', before: 'en_stock', after: 'a_pedido' }));
    expect(mocks.update).toHaveBeenCalledWith({ subtipo: 'a_pedido' }, expect.anything());
  });

  it.each([
    { Nombre: 'Puerta', División: 'DP', Subtipo: 'a_pedido' },
    { Nombre: 'Puerta', División: 'otra' },
    { Nombre: 'Puerta', División: 'ACC', Subtipo: 'a_pedido', Stock: 5 },
  ])('does not persist invalid classification or a_pedido initial stock', async (row) => {
    const result = await importCatalog(await spreadsheet(row), 'catalog.xlsx', false);
    expect(result.rows[0].status).toBe('error');
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('blocks conversion to a_pedido while physical stock exists', async () => {
    mocks.items = [existing({ tipo: 'parte', division: 'ACC', subtipo: 'en_stock', stock: 2 })];
    const result = await importCatalog(await spreadsheet({ ID: 7, Nombre: 'Puerta', Subtipo: 'a_pedido' }), 'catalog.xlsx', false);
    expect(result.rows[0].status).toBe('conflict');
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.movement).not.toHaveBeenCalled();
  });
});
