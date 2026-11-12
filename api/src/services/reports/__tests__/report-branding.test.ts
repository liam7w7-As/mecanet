import { readFile } from 'node:fs/promises';

import ExcelJS from 'exceljs';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getCompanySettings, readCompanyLogo } from '../../settings.service.js';
import { applyReportWorkbookBranding, getReportBranding } from '../report-branding.js';

vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));
vi.mock('../../settings.service.js', () => ({ getCompanySettings: vi.fn(), readCompanyLogo: vi.fn() }));
vi.mock('../../../utils/logger.js', () => ({ logger: { warn: vi.fn() } }));

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#246789' } }).png().toBuffer();
const settings = (hasLogo = true) => ({
  nombreComercial: 'Empresa configurada', razonSocial: 'Empresa legal', rut: '77.374.788-1',
  direccion: 'Dirección de prueba', comuna: 'Comuna', region: 'Región',
  telefono: '123456', email: 'prueba@example.com', sitioWeb: '', logo: { tieneLogo: hasLogo },
}) as Awaited<ReturnType<typeof getCompanySettings>>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getCompanySettings).mockResolvedValue(settings());
  vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('Missing'), { code: 'ENOENT' }));
});

describe('Identidad de reportes sin BD ni almacenamiento real', () => {
  it('prioriza el logo configurado y lo convierte de WebP a PNG proporcional', async () => {
    const source = await sharp(await png(320, 80)).webp().toBuffer();
    vi.mocked(readCompanyLogo).mockResolvedValue({ bytes: source, mimeType: 'image/webp' });
    const branding = await getReportBranding();
    expect(branding.companyName).toBe('Empresa configurada');
    expect(branding.address).toBe('Dirección de prueba, Comuna, Región');
    expect(await sharp(branding.logoPng!).metadata()).toMatchObject({ format: 'png', width: 320, height: 80 });
    expect(readFile).not.toHaveBeenCalled();
  });

  it('usa el logo predeterminado si no hay uno configurado', async () => {
    vi.mocked(getCompanySettings).mockResolvedValue(settings(false));
    vi.mocked(readFile).mockResolvedValue(await png(60, 60));
    expect((await getReportBranding()).logoPng).not.toBeNull();
    expect(readCompanyLogo).not.toHaveBeenCalled();
  });

  it.each(['inexistente', 'inválido'])('usa fallback si el logo configurado está %s', async (reason) => {
    if (reason === 'inexistente') vi.mocked(readCompanyLogo).mockRejectedValue(new Error('Missing'));
    else vi.mocked(readCompanyLogo).mockResolvedValue({ bytes: Buffer.from('invalid image'), mimeType: 'image/png' });
    vi.mocked(readFile).mockResolvedValue(await png(120, 40));
    const branding = await getReportBranding();
    expect(await sharp(branding.logoPng!).metadata()).toMatchObject({ width: 120, height: 40 });
  });

  it('conserva el membrete de texto cuando tampoco existe el fallback', async () => {
    vi.mocked(getCompanySettings).mockResolvedValue(settings(false));
    const branding = await getReportBranding();
    expect(branding.logoPng).toBeNull();
    expect(branding.companyName).toBe('Empresa configurada');
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Reporte');
    sheet.getCell('A1').value = 'UNITHOR - REPORTE';
    await applyReportWorkbookBranding(book, branding);
    expect(sheet.getCell('A1').value).toBe('Empresa configurada - REPORTE');
    expect(sheet.getImages()).toHaveLength(0);
  });

  it.each([[320, 80], [80, 160], [8, 220], [720, 8]])('reserva la fila libre y conserva proporción %i x %i en todas las hojas', async (width, height) => {
    vi.mocked(readCompanyLogo).mockResolvedValue({ bytes: await png(width, height), mimeType: 'image/png' });
    const book = new ExcelJS.Workbook();
    for (const name of ['Resumen', 'Detalle']) {
      const sheet = book.addWorksheet(name);
      sheet.columns = [{ width: 15 }, { width: 10 }, { width: 8 }];
      sheet.mergeCells('A1:C1');
      sheet.getCell('A1').value = 'UNITHOR - REPORTE';
      sheet.getCell('A2').value = 'Filtros';
      sheet.getCell('A4').value = 'Total';
      sheet.getCell('A5').value = 41888;
      sheet.getCell('A6').value = { formula: 'SUM(A5:A5)' };
      sheet.autoFilter = 'A4:C4';
    }
    await applyReportWorkbookBranding(book, await getReportBranding());
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(await book.xlsx.writeBuffer());
    for (const sheet of loaded.worksheets) {
      expect(sheet.getCell('A1').value).toBe('Empresa configurada - REPORTE');
      expect(sheet.getCell('A2').value).toBe('Filtros');
      expect(sheet.getCell('A4').value).toBe('Total');
      expect(sheet.getCell('A5').value).toBe(41888);
      expect(sheet.getCell('A6').formula).toBe('SUM(A5:A5)');
      expect(sheet.autoFilter).toBe('A4:C4');
      const image = sheet.getImages()[0];
      expect(image.range.tl.nativeRow).toBe(2);
      const size = (image.range as ExcelJS.ImageRange & { ext: { width: number; height: number } }).ext;
      expect(size.width / size.height).toBeCloseTo(width / height);
      expect(size.height).toBeLessThanOrEqual(28);
      expect(sheet.getRow(3).height).toBeGreaterThanOrEqual(27);
    }
  });
});
