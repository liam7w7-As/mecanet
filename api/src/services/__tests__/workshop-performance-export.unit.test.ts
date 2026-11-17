import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';

import { buildWorkshopPerformanceDataset, generateWorkshopPerformanceExport } from '../workshop-performance-export.service.js';
import { workshopPerformanceFixture, commercialReviewFixture } from './fixtures/workshop-performance.js';

vi.mock('../reports/report-branding.js', () => ({
  getReportBranding: async () => ({ companyName: 'UNITHOR', legalName: 'UNITHOR SpA', rut: null, address: 'Taller', contact: 'contacto@unithor.cl', logoPng: null }),
  applyReportWorkbookBranding: vi.fn(),
}));

describe('Workshop performance exports use the same snapshot as the preview', () => {
  it('preserves period figures, filters and accumulated service equivalents without mutating the report', () => {
    const before = JSON.stringify(workshopPerformanceFixture);
    const dataset = buildWorkshopPerformanceDataset(workshopPerformanceFixture);
    expect(dataset.tables.find((table) => table.name === 'Indicadores del período')?.rows)
      .toContainEqual({ indicator: 'Horas extra', value: workshopPerformanceFixture.analysis.utilization.extraHours });
    expect(dataset.tables.find((table) => table.name === 'Comparación por servicio')?.rows[0])
      .toMatchObject({ actualHours: 10, hoursDifference: -2.5, quotedNet: 15000 });
    expect(dataset.notes?.join(' ')).toContain('No enviar a clientes');
    expect(JSON.stringify(workshopPerformanceFixture)).toBe(before);
  });
  it('keeps every immutable review and its captured figures even if repeated as latest review', () => {
    const report = structuredClone(workshopPerformanceFixture);
    report.analysis.commercial.reviews = [commercialReviewFixture];
    report.analysis.commercial.services[0].latestReview = commercialReviewFixture;
    const audit = buildWorkshopPerformanceDataset(report).tables.find((table) => table.name === 'Historial de análisis')!;
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({ note: 'Descuento autorizado', hoursDifference: -2.5 });
  });
  it('generates readable multipage PDF and an Excel workbook with every row', async () => {
    const report = structuredClone(workshopPerformanceFixture);
    report.analysis.commercial.services = Array.from({ length: 150 }, (_, index) => ({ ...report.analysis.commercial.services[0], workOrderItemId: index + 1, description: `Servicio ${index + 1} de diagnóstico del vehículo` }));
    const pdf = await generateWorkshopPerformanceExport(report, 'pdf');
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe('%PDF-');
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(1);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await generateWorkshopPerformanceExport(report, 'excel')) as unknown as ExcelJS.Buffer);
    expect(workbook.worksheets.some((sheet) => sheet.rowCount >= 150)).toBe(true);
  });
  it('exports empty results with valid PDF and Excel structure', async () => {
    const report = structuredClone(workshopPerformanceFixture);
    report.rows = [];
    report.analysis.periods = [];
    report.analysis.commercial.services = [];
    expect((await PDFDocument.load(await generateWorkshopPerformanceExport(report, 'pdf'))).getPageCount()).toBeGreaterThan(0);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await generateWorkshopPerformanceExport(report, 'excel')) as unknown as ExcelJS.Buffer);
    expect(workbook.worksheets.length).toBeGreaterThan(0);
  });
});
