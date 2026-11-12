import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { generateListExportExcel, generateListExportPdf } from '../export-renderer.service.js';
import { collectExportPages, EXPORT_MAX_ROWS } from '../export-utils.js';

import type { ExportDataset } from '../export-types.js';

const branding = vi.hoisted(() => ({ companyName: 'UNITHOR', legalName: 'Empresa de prueba', rut: '77.374.788-1', address: '', contact: '', logoPng: null as Buffer | null }));
vi.mock('../../settings.service.js', () => ({}));
vi.mock('../../reports/report-branding.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../reports/report-branding.js')>(),
  getReportBranding: async () => branding,
}));
beforeEach(() => { branding.companyName = 'UNITHOR'; branding.logoPng = null; });

const dataset = (): ExportDataset => ({
  title: 'Clientes de prueba', filters: { tipo: 'empresa', activo: false },
  tables: [{ name: 'Clientes', columns: [
    { key: 'id', header: 'ID', kind: 'number' }, { key: 'nombre', header: 'Nombre', width: 38 },
    { key: 'rut', header: 'RUT' }, { key: 'saldo', header: 'Saldo', kind: 'money' },
    { key: 'fecha', header: 'Fecha', kind: 'date' },
  ], rows: [{ id: 1, nombre: '=NOMBRE LITERAL', rut: '00123456K', saldo: 12345.67, fecha: '2026-11-10' }] }],
});

describe('Archivos de exportación del listado', () => {
  it('coloca el logo proporcionado dentro del membrete de Resumen sin alterar Datos', async () => {
    branding.companyName = 'Empresa configurada';
    branding.logoPng = await sharp({ create: { width: 80, height: 160, channels: 3, background: '#123456' } }).png().toBuffer();
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await generateListExportExcel(dataset()) as unknown as ExcelJS.Buffer);
    const summary = book.getWorksheet('Resumen')!;
    const image = summary.getImages()[0];
    expect(book.creator).toBe(branding.companyName);
    expect(summary.getColumn(3).width).toBe(26);
    expect(summary.pageSetup.printArea).toMatch(/^A1:C\d+$/);
    expect(image.range.tl.nativeCol).toBe(2);
    expect(image.range.tl.nativeRow).toBe(0);
    const size = (image.range as ExcelJS.ImageRange & { ext: { width: number; height: number } }).ext;
    expect(size.width / size.height).toBeCloseTo(0.5);
    expect(book.getWorksheet('Datos')!.getCell('B2').value).toBe('=NOMBRE LITERAL');
    expect((await PDFDocument.load(await generateListExportPdf(dataset()))).getAuthor()).toBe(branding.companyName);
  });
  it('Excel contiene Datos reimportable desde fila 1, números reales y texto literal', async () => {
    const bytes = await generateListExportExcel(dataset());
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    const data = book.getWorksheet('Datos')!;
    expect(data.getRow(1).values).toEqual([undefined, 'ID', 'Nombre', 'RUT', 'Saldo', 'Fecha']);
    expect(data.getCell('B2').value).toBe('=NOMBRE LITERAL');
    expect(data.getCell('B2').formula).toBeUndefined();
    expect(data.getCell('C2').value).toBe('00123456K');
    expect(data.getCell('D2').value).toBe(12345.67);
    expect((data.getCell('E2').value as Date).toISOString().slice(0, 10)).toBe('2026-11-10');
    expect(book.getWorksheet('Resumen')!.getCell('B5').value).toContain('Activo: No');
    expect(data.autoFilter).toBeTruthy();
  });

  it('PDF pagina, repite encabezados y tolera nombres extensos o caracteres no soportados', async () => {
    const data = dataset();
    data.tables[0].rows = Array.from({ length: 130 }, (_, id) => ({ id, nombre: `Cliente ${id} 🚗 中文 ${'Nombre amplio '.repeat(12)}`, rut: '12345678K', saldo: 25000, fecha: '2026-11-10' }));
    const bytes = await generateListExportPdf(data);
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe('%PDF-');
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(2);
    expect(pdf.getTitle()).toBe(data.title);
  });

  it('exporta un listado vacío con estructura válida en ambos formatos', async () => {
    const data = dataset();
    data.tables[0].rows = [];
    const bytes = await generateListExportExcel(data);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    expect(book.getWorksheet('Datos')!.actualRowCount).toBe(1);
    expect((await PDFDocument.load(await generateListExportPdf(data))).getPageCount()).toBe(1);
  });

  it('reúne todas las páginas filtradas y no limita al tamaño del listado', async () => {
    const fetch = vi.fn(async (page: number) => ({ items: page === 1 ? [1, 2] : [3], total: 3, totalPages: 2 }));
    expect(await collectExportPages(fetch)).toEqual([1, 2, 3]);
    expect(fetch.mock.calls).toEqual([[1], [2]]);
  });

  it('rechaza exceder el máximo en vez de entregar datos incompletos', async () => {
    await expect(collectExportPages(async () => ({ items: [], total: EXPORT_MAX_ROWS + 1, totalPages: 101 })))
      .rejects.toMatchObject({ statusCode: 400 });
  });
});
