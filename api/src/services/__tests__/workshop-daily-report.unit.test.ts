import ExcelJS from 'exceljs';
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream } from 'pdf-lib';
import { Op } from 'sequelize';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { User } from '../../models/User.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { WorkOrderItemProgressEvent } from '../../models/WorkOrderItemProgressEvent.js';
import { WorkOrderItemSession } from '../../models/WorkOrderItemSession.js';
import { generateListExportExcel, generateListExportPdf } from '../exports/export-renderer.service.js';
import { buildLaborExport } from '../exports/labor-export.service.js';
import { generateWorkshopDailyReportPdf } from '../work-order-daily-report-pdf.service.js';
import { getWorkshopDailyReport } from '../work-order-labor.service.js';
import { getWorkshopDayRange } from '../workshop-personnel.service.js';

// Isolated synthetic records: no DB configuration, connection, migration or setup.
vi.mock('../../config/database.js', () => ({ sequelize: {} }));
vi.mock('../settings.service.js', () => ({}));
vi.mock('../work-order.service.js', () => ({}));
vi.mock('../work-order-commercial.service.js', () => ({
  listPriceSuggestions: vi.fn(), createPriceSuggestion: vi.fn(), reviewPriceSuggestion: vi.fn(),
}));
vi.mock('../workshop-personnel.service.js', () => ({ getWorkshopDayRange: vi.fn(), getWorkerShift: vi.fn() }));
vi.mock('../reports/report-branding.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../reports/report-branding.js')>(),
  getReportBranding: async () => ({ companyName: 'Taller de prueba', legalName: 'Taller de prueba', rut: null, address: '', contact: '', logoPng: null }),
}));

const session = (patch: object = {}): WorkOrderItemSession => ({
  id: 1, workOrderId: 12, workOrderItemId: 20, userId: 9, userName: 'Mecánico Uno',
  kind: 'manual', status: 'cerrada', overtime: false, supersededAt: null, scheduledEndAt: null,
  startedAt: new Date('2026-11-13T13:00:00Z'), endedAt: new Date('2026-11-13T14:00:00Z'),
  durationMinutes: 60, note: 'Diagnóstico ordinario', workOrder: { id: 12, codigo: 'OT-12' }, item: { id: 20, descripcion: 'Diagnóstico' },
  ...patch,
}) as unknown as WorkOrderItemSession;

const overtime = (patch: object = {}): WorkOrderItemSession => session({
  id: 2, overtime: true, startedAt: new Date('2026-11-14T03:30:00Z'), endedAt: new Date('2026-11-14T04:30:00Z'),
  note: 'Diagnóstico urgente al cierre', ...patch,
});

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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-16T19:00:00Z'));
  vi.spyOn(User, 'findByPk').mockResolvedValue({ id: 1, role: { nombre: 'jefe' } } as User);
  vi.spyOn(User, 'findAll').mockResolvedValue([
    { id: 9, nombre: 'Mecánico Uno', activo: true, deletedAt: null, role: { nombre: 'mecanico' } },
    { id: 10, nombre: 'Mecánico Dos', activo: true, deletedAt: null, role: { nombre: 'mecanico' } },
  ] as User[]);
  vi.spyOn(WorkOrderItemSession, 'findAll').mockResolvedValue([session(), overtime(), overtime({ id: 3, supersededAt: new Date() })]);
  vi.spyOn(WorkOrderItemProgressEvent, 'findAll').mockResolvedValue([]);
  vi.spyOn(WorkOrder, 'findAll').mockResolvedValue([{ id: 12, codigo: 'OT-12', estado: 'en_progreso', vehicle: { patente: 'ABC123' } }] as WorkOrder[]);
  vi.mocked(getWorkshopDayRange).mockImplementation(async (date) => ({
    start: new Date(`${date}T04:00:00Z`), end: new Date(new Date(`${date}T04:00:00Z`).getTime() + 86_400_000),
  }));
});

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('Operational overtime in the daily report without a database', () => {
  it('includes declared hours by date and exports date/quantity without a fictitious interval', async () => {
    vi.mocked(WorkOrderItemSession.findAll).mockResolvedValue([session({
      reportedDate: '2026-11-13', startedAt: new Date('2026-11-13T04:00:00Z'), endedAt: new Date('2026-11-13T04:00:00Z'),
      durationMinutes: 90, note: 'Horas declaradas del diagnóstico',
    })]);
    const report = await getWorkshopDailyReport('2026-11-13', 1);
    expect(report).toMatchObject({ totalHoras: 1.5, totalSesiones: 1, totalHorasExtra: 0 });
    expect(report.usuarios[0].detalle[0]).toMatchObject({ reportedDate: '2026-11-13', minutos: 90 });
    expect(report.ordenes[0].horas).toBe(1.5);
    const where = vi.mocked(WorkOrderItemSession.findAll).mock.calls[0][0]?.where;
    expect(where).toMatchObject({ [Op.or]: expect.arrayContaining([{ reportedDate: '2026-11-13' }]) });
    const dataset = await buildLaborExport('workshop-daily', { fecha: '2026-11-13' }, { id: 1, role: 'jefe' });
    const details = dataset!.tables.find((table) => table.name === 'Detalle por trabajo')!;
    expect(details.rows[0]).toMatchObject({ registro: 'Horas declaradas · 2026-11-13', minutos: 90, inicio: null, fin: null });
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await generateListExportExcel(dataset!) as unknown as ExcelJS.Buffer);
    const values: unknown[] = [];
    book.getWorksheet('Detalle por trabajo')!.eachRow((row) => row.eachCell((cell) => values.push(cell.value)));
    expect(values).toContain('Horas declaradas · 2026-11-13');
    expect(values.some((value) => value instanceof Date)).toBe(false);
    const content = pdfText(await PDFDocument.load(await generateWorkshopDailyReportPdf(report)));
    expect(content).toContain('DETALLE DE HORAS DECLARADAS');
    expect(content).toContain('Fecha: 2026-11-13 | Horas declaradas: 90 min');
    expect(content).not.toContain('Inicio:');
  });

  it('keeps historical hours for inactive/deleted workers using session names, without including idle former workers', async () => {
    vi.mocked(User.findAll).mockResolvedValue([
      { id: 9, nombre: 'Nombre cambiado', activo: false, deletedAt: new Date(), role: { nombre: 'mecanico' } },
      { id: 10, nombre: 'Inactivo sin actividad', activo: false, deletedAt: null, role: { nombre: 'mecanico' } },
    ] as User[]);
    const report = await getWorkshopDailyReport('2026-11-13', 1);
    expect(report.usuarios).toHaveLength(1);
    expect(report.usuarios[0]).toMatchObject({ id: 9, nombre: 'Mecánico Uno', horas: 1.5, horasExtra: 0.5 });
    expect(User.findAll).toHaveBeenCalledWith(expect.objectContaining({ paranoid: false, attributes: ['id', 'nombre', 'activo', 'deletedAt'] }));
  });
  it('counts extra time once in technical hours, clips it to the workshop day and excludes superseded details', async () => {
    const report = await getWorkshopDailyReport('2026-11-13', 1);
    expect(report).toMatchObject({ totalHoras: 1.5, totalHorasExtra: 0.5, totalSesiones: 2 });
    expect(report.usuarios[0]).toMatchObject({ minutos: 90, horas: 1.5, horasExtra: 0.5, sesiones: 2 });
    expect(report.usuarios[1]).toMatchObject({ horas: 0, horasExtra: 0, detalle: [] });
    expect(report.usuarios[0].detalle).toHaveLength(2);
    expect(report.usuarios[0].detalle[1]).toMatchObject({ overtime: true, minutos: 30, workOrderCodigo: 'OT-12', itemDescripcion: 'Diagnóstico',
      startedAt: '2026-11-14T03:30:00.000Z', endedAt: '2026-11-14T04:30:00.000Z', note: 'Diagnóstico urgente al cierre' });
    expect(report.ordenes[0].horas).toBe(1.5);
    expect(WorkOrderItemSession.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      supersededAt: null, startedAt: { [Op.lt]: new Date('2026-11-14T04:00:00Z') },
    }) }));
    expect(JSON.stringify(report)).not.toMatch(/precio|costHourly|saleHourly|pago|salario|nómina/i);
  });

  it('preserves fractional canonical time and uses false for legacy fixtures without a flag', async () => {
    vi.mocked(WorkOrderItemSession.findAll).mockResolvedValue([
      session({ overtime: undefined, kind: 'cronometro', endedAt: new Date('2026-11-13T13:00:44Z'), durationMinutes: 0 }),
      overtime({ kind: 'cronometro', startedAt: new Date('2026-11-13T22:00:00Z'), endedAt: new Date('2026-11-13T22:00:45Z'), durationMinutes: 0 }),
    ]);
    const report = await getWorkshopDailyReport('2026-11-13', 1);
    expect(report.usuarios[0].minutos).toBeCloseTo(89 / 60);
    expect(report.usuarios[0].detalle[0]).toMatchObject({ overtime: false });
    expect(report.totalHoras).toBe(0.02);
    expect(report.totalHorasExtra).toBe(0.01);
  });

  it('never infers extra time from a late timestamp and enforces supervisor access', async () => {
    vi.mocked(WorkOrderItemSession.findAll).mockResolvedValue([overtime({ overtime: false })]);
    expect((await getWorkshopDailyReport('2026-11-13', 1)).totalHorasExtra).toBe(0);
    vi.mocked(User.findByPk).mockResolvedValue({ id: 9, role: { nombre: 'mecanico' } } as User);
    await expect(getWorkshopDailyReport('2026-11-13', 9)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('exports totals and complete details in Excel and the existing shared PDF', async () => {
    const dataset = await buildLaborExport('workshop-daily', { fecha: '2026-11-13' }, { id: 1, role: 'jefe' });
    expect(dataset).not.toBeNull();
    const people = dataset!.tables.find((table) => table.name === 'Avance por persona')!;
    const details = dataset!.tables.find((table) => table.name === 'Detalle por trabajo')!;
    expect(people.rows[0]).toMatchObject({ horas: 1.5, horasExtra: 0.5 });
    expect(details.rows[1]).toMatchObject({ overtime: true, minutos: 30, codigo: 'OT-12', motivo: 'Diagnóstico urgente al cierre' });
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await generateListExportExcel(dataset!) as unknown as ExcelJS.Buffer);
    const values: unknown[] = [];
    book.getWorksheet('Detalle por trabajo')!.eachRow((row) => row.eachCell((cell) => values.push(cell.value)));
    expect(values).toContain('Horas extra');
    expect(values).toContain('Sí');
    expect(values).toContain('Diagnóstico urgente al cierre');
    expect(values.filter((value) => value instanceof Date)).toHaveLength(4);
    const content = pdfText(await PDFDocument.load(await generateListExportPdf(dataset!)));
    expect(content).toContain('Horas extra');
    expect(content).toContain('Diagnóstico urgente al cierre');
    expect(content).toContain('OT-12');
  });

  it('retains branding/footer and prints every extra interval in the original daily PDF, beyond eight entries', async () => {
    vi.mocked(WorkOrderItemSession.findAll).mockResolvedValue(Array.from({ length: 10 }, (_, index) => overtime({ id: index + 1,
      note: `Motivo completo ${index + 1}`, item: { id: 20, descripcion: `Servicio ${index + 1}` } })));
    const report = await getWorkshopDailyReport('2026-11-13', 1);
    const content = pdfText(await PDFDocument.load(await generateWorkshopDailyReportPdf(report)));
    expect(content).toContain('Taller de prueba');
    expect(content).toContain('Detalle de horas extra'.toUpperCase());
    expect(content).toContain('Motivo completo 10');
    expect(content).toContain('Servicio 10');
    expect(content).toContain('America/Santiago');
    expect(content).toContain(new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' }).format(new Date('2026-11-14T03:30:00.000Z')));
    expect(content).toContain('Documento interno de control de horas. No incluye precios.');
  });
});
