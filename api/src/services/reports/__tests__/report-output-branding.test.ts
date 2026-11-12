import { administrationReportQuerySchema, catalogReportQuerySchema, financialReportQuerySchema, fleetReportQuerySchema, inventoryReportQuerySchema } from '@unithor/shared';
import ExcelJS from 'exceljs';
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogItem } from '../../../models/CatalogItem.js';
import { Client } from '../../../models/Client.js';
import { Payment } from '../../../models/Payment.js';
import { Quotation } from '../../../models/Quotation.js';
import { QuotationItem } from '../../../models/QuotationItem.js';
import { RefreshToken } from '../../../models/RefreshToken.js';
import { Role } from '../../../models/Role.js';
import { StockBalance } from '../../../models/StockBalance.js';
import { StockMovement } from '../../../models/StockMovement.js';
import { User } from '../../../models/User.js';
import { Vehicle } from '../../../models/Vehicle.js';
import { Warehouse } from '../../../models/Warehouse.js';
import { WorkOrder } from '../../../models/WorkOrder.js';
import { WorkOrderItem } from '../../../models/WorkOrderItem.js';
import { generateCommercialReportExcel } from '../../commercial-report.service.js';
import { getFinancialReportData } from '../../financial-analytics.service.js';
import { generateFinancialReportExcel, generateFinancialReportPdf } from '../../financial-report.service.js';
import * as reports from '../../operational-report.service.js';
import { generatePurchaseReportExcel, generatePurchaseReportPdf } from '../../purchase-report.service.js';
import { generateWorkshopDailyReportPdf } from '../../work-order-daily-report-pdf.service.js';

import type { FinancialReportData } from '../../financial-analytics.service.js';
import type { WorkshopDailyReport } from '../../work-order-labor.service.js';

const branding = vi.hoisted(() => ({ companyName: 'Empresa configurada', legalName: 'Empresa legal', rut: null, address: '', contact: '', logoPng: null as Buffer | null }));
// Ninguna consulta, conexión, setup global ni almacenamiento real en estas pruebas.
vi.mock('../../../config/database.js', () => ({ sequelize: {} }));
vi.mock('../../settings.service.js', () => ({}));
vi.mock('../../purchase.service.js', () => ({ getPurchasesForReport: async () => [] }));
vi.mock('../../financial-analytics.service.js', () => ({ getFinancialReportData: vi.fn() }));
vi.mock('../report-branding.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../report-branding.js')>(),
  getReportBranding: async () => branding,
}));

const filters = { fechaDesde: '2026-11-01', fechaHasta: '2026-11-12' };
const dailyReport = (): WorkshopDailyReport => ({
  fecha: filters.fechaHasta, generadoEn: new Date(), totalHoras: 0, totalItemsCompletados: 0,
  totalSesiones: 0, usuarios: [], ordenes: [],
});
const financialData = (): FinancialReportData => ({
  analytics: {
    period: { ...filters, previousFechaDesde: null, previousFechaHasta: null, days: 12, agruparPor: 'dia' },
    kpis: { grossSales: 41888, collected: 0, manualIncome: 0, expenses: 0, netCash: 0, receivable: 41888,
      averageTicket: 41888, quotationCount: 1, paidQuotationCount: 0, workOrderConversionCount: 0, collectionRate: 0, conversionRate: 0 },
    comparison: null, topSellers: [], topItems: [], topClients: [], paymentMethods: [],
    quotationStatuses: [], movementCategories: [], trend: [], filterOptions: { advisors: [], clients: [] },
  },
  quotations: [], payments: [], movements: [], items: [],
});

beforeEach(async () => {
  branding.logoPng = await sharp({ create: { width: 120, height: 60, channels: 3, background: '#246789' } }).png().toBuffer();
  for (const model of [CatalogItem, Client, Payment, Quotation, QuotationItem, RefreshToken, Role,
    StockBalance, StockMovement, User, Vehicle, Warehouse, WorkOrder, WorkOrderItem]) {
    vi.spyOn(model, 'findAll').mockResolvedValue([]);
  }
  vi.mocked(getFinancialReportData).mockResolvedValue(financialData());
});
afterEach(() => vi.restoreAllMocks());

const pdfText = (doc: PDFDocument): string => doc.getPages().flatMap((page) => {
  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray
    ? Array.from({ length: contents.size() }, (_, i) => contents.lookup(i, PDFRawStream))
    : contents instanceof PDFRawStream ? [contents] : [];
  return streams.flatMap((stream) => Array.from(
    Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1').matchAll(/<([0-9a-f]+)>\s*Tj/gi),
    (match) => Buffer.from(match[1], 'hex').toString('latin1'),
  ));
}).join('\n');

const expectLogoOnEveryPage = (doc: PDFDocument): void => {
  for (const page of doc.getPages()) {
    const objects = page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    expect(objects?.keys().some((key) => objects.lookup(key) instanceof PDFRawStream)).toBe(true);
  }
};

describe('Membretes en salidas de reportes con datos sintéticos', () => {
  it.each([
    ['comercial', () => reports.generateDetailedCommercialReportExcel(filters), () => reports.generateCommercialReportPdf(filters)],
    ['taller', () => reports.generateWorkshopReportExcel(filters), () => reports.generateWorkshopReportPdf(filters)],
    ['inventario', () => reports.generateInventoryReportExcel(inventoryReportQuerySchema.parse(filters)), () => reports.generateInventoryReportPdf(inventoryReportQuerySchema.parse(filters))],
    ['catálogo', () => reports.generateCatalogReportExcel(catalogReportQuerySchema.parse(filters)), () => reports.generateCatalogReportPdf(catalogReportQuerySchema.parse(filters))],
    ['clientes', () => reports.generateFleetReportExcel(fleetReportQuerySchema.parse(filters)), () => reports.generateFleetReportPdf(fleetReportQuerySchema.parse(filters))],
    ['cuentas', () => reports.generateAdministrationReportExcel(administrationReportQuerySchema.parse(filters)), () => reports.generateAdministrationReportPdf(administrationReportQuerySchema.parse(filters))],
    ['compras', () => generatePurchaseReportExcel(filters), () => generatePurchaseReportPdf(filters)],
    ['finanzas', () => generateFinancialReportExcel(financialReportQuerySchema.parse(filters)), () => generateFinancialReportPdf(financialReportQuerySchema.parse(filters))],
  ] as const)('incluye identidad configurada y logo en PDF y todas las hojas Excel: %s', async (_name, excel, pdf) => {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await excel() as unknown as ExcelJS.Buffer);
    expect(book.creator).toBe(branding.companyName);
    for (const sheet of book.worksheets) {
      expect(sheet.getCell('A1').value).toContain(branding.companyName);
      expect(sheet.getImages()).toHaveLength(1);
      expect(sheet.getImages()[0].range.tl.nativeRow).toBe(2);
    }
    const doc = await PDFDocument.load(await pdf());
    expectLogoOnEveryPage(doc);
    expect(pdfText(doc)).toContain(branding.companyName);
  });

  it('también incorpora la identidad en el Excel comercial anterior y mantiene el total con IVA', async () => {
    vi.mocked(Quotation.findAll).mockResolvedValue([{ id: 1, codigo: 'COT-IVA', total: 35200, pagado: 0,
      createdAt: new Date('2026-11-12T12:00:00Z'), estadoPago: 'por_pagar', items: [] }] as unknown as Quotation[]);
    for (const generate of [generateCommercialReportExcel, reports.generateDetailedCommercialReportExcel]) {
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(await generate(filters) as unknown as ExcelJS.Buffer);
      expect(book.worksheets[0].getImages()).toHaveLength(1);
      const values: unknown[] = [];
      book.worksheets[0].eachRow((row) => row.eachCell((cell) => values.push(cell.value)));
      expect(values).toContain(41888);
    }
    const doc = await PDFDocument.load(await reports.generateCommercialReportPdf(filters));
    expect(pdfText(doc)).toContain('$41.888');
  });

  it('repite logo y membrete del reporte diario al paginar', async () => {
    const report = dailyReport();
    report.ordenes = Array.from({ length: 100 }, (_, i) => ({ id: i, codigo: `OT-${i}`, patente: null,
      estado: 'en_progreso', horas: 1, completados: 0, enProceso: 1, mecanicos: ['Persona de prueba'] }));
    const doc = await PDFDocument.load(await generateWorkshopDailyReportPdf(report));
    expect(doc.getPageCount()).toBeGreaterThan(1);
    expectLogoOnEveryPage(doc);
    expect(pdfText(doc).split(branding.companyName)).toHaveLength(doc.getPageCount() + 1);
  });

  it('mantiene logo y total con IVA en las páginas siguientes del reporte comercial', async () => {
    vi.mocked(Quotation.findAll).mockResolvedValue(Array.from({ length: 90 }, (_, i) => ({
      id: i + 1, codigo: `COT-${i + 1}`, total: 35200, pagado: 0, estadoPago: 'por_pagar',
      createdAt: new Date('2026-11-12T12:00:00Z'), items: [],
    })) as unknown as Quotation[]);
    const doc = await PDFDocument.load(await reports.generateCommercialReportPdf(filters));
    expect(doc.getPageCount()).toBeGreaterThan(1);
    expectLogoOnEveryPage(doc);
    expect(pdfText(doc).match(/\$41\.888/g)).toHaveLength(90);
  });

  it('genera el reporte diario con membrete de texto si no hay ningún logo', async () => {
    branding.logoPng = null;
    const doc = await PDFDocument.load(await generateWorkshopDailyReportPdf(dailyReport()));
    expect(pdfText(doc)).toContain(branding.companyName);
    expect(pdfText(doc)).toContain('Reporte diario de taller');
  });

  it('mantiene la foto protegida en el DTO de vehículos de la vista previa', async () => {
    vi.mocked(Vehicle.findAll).mockResolvedValue([
      { id: 7, fotoStorageKey: 'private/vehicle-photo.png' }, { id: 8, fotoStorageKey: null },
    ] as unknown as Vehicle[]);
    const preview = await reports.getFleetReportPreview(fleetReportQuerySchema.parse(filters));
    expect(preview.vehicles.items.map(({ fotoUrl }) => fotoUrl)).toEqual(['/api/vehicles/7/foto?v=vehicle-photo.png', null]);
    expect(JSON.stringify(preview)).not.toContain('private/vehicle-photo.png');
  });
});
