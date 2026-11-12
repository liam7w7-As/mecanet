import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { logger } from '../../utils/logger.js';
import { getCompanySettings, readCompanyLogo } from '../settings.service.js';

import type ExcelJS from 'exceljs';

export interface ReportBranding {
  companyName: string;
  legalName: string;
  rut: string | null;
  address: string;
  contact: string;
  logoPng: Buffer | null;
}

const FALLBACK_LOGO_PATHS = [
  fileURLToPath(new URL('../../../../web/public/marca.webp', import.meta.url)),
  fileURLToPath(new URL('../../../../web/dist/marca.webp', import.meta.url)),
  path.resolve(process.cwd(), 'web/public/marca.webp'),
  path.resolve(process.cwd(), 'web/dist/marca.webp'),
  path.resolve(process.cwd(), '../web/public/marca.webp'),
  path.resolve(process.cwd(), '../web/dist/marca.webp'),
];

const readFallbackLogo = async (): Promise<Buffer | null> => {
  for (const candidate of FALLBACK_LOGO_PATHS) {
    try {
      return await readFile(candidate);
    } catch (error: unknown) {
      const fileError = error as NodeJS.ErrnoException;
      if (fileError.code !== 'ENOENT') {
        logger.warn({ err: error, candidate }, 'No se pudo leer el logo predeterminado');
      }
    }
  }
  return null;
};

const normalizeLogo = async (bytes: Buffer): Promise<Buffer> =>
  sharp(bytes, { density: 220 })
    .resize({ width: 720, height: 220, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

const loadLogo = async (hasConfiguredLogo: boolean): Promise<Buffer | null> => {
  if (hasConfiguredLogo) {
    try {
      return await normalizeLogo((await readCompanyLogo()).bytes);
    } catch (error: unknown) {
      logger.warn({ err: error }, 'No se pudo preparar el logo configurado para el reporte');
    }
  }
  try {
    const source = await readFallbackLogo();
    return source ? await normalizeLogo(source) : null;
  } catch (error: unknown) {
    logger.warn({ err: error }, 'No se pudo preparar el logo para el reporte');
    return null;
  }
};

const join = (values: Array<string | null | undefined>, separator: string): string =>
  values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)).join(separator);

export const getReportBranding = async (): Promise<ReportBranding> => {
  const settings = await getCompanySettings();
  return {
    companyName: settings.nombreComercial?.trim() || settings.razonSocial || 'UNITHOR',
    legalName: settings.razonSocial,
    rut: settings.rut ?? null,
    address: join([settings.direccion, settings.comuna, settings.region], ', '),
    contact: join([settings.telefono, settings.email, settings.sitioWeb], ' | '),
    logoPng: await loadLogo(settings.logo.tieneLogo),
  };
};

/** Reserva la fila libre del membrete, sin mover tablas, filtros ni fórmulas. */
export const applyReportWorkbookBranding = async (
  workbook: ExcelJS.Workbook,
  branding: ReportBranding,
  options: {
    sheets?: ExcelJS.Worksheet[];
    logoArea?: { column: number; row: number; width: number; height: number };
  } = {},
): Promise<void> => {
  workbook.creator = branding.companyName;
  workbook.company = branding.legalName || branding.companyName;
  const sheets = options.sheets ?? workbook.worksheets;
  const dimensions = branding.logoPng ? await sharp(branding.logoPng).metadata() : null;
  const imageId = branding.logoPng
    ? workbook.addImage({ base64: branding.logoPng.toString('base64'), extension: 'png' })
    : null;

  for (const sheet of sheets) {
    const title = sheet.getCell('A1');
    if (typeof title.value === 'string') {
      title.value = title.value.replace(/^UNITHOR(?= - )/, () => branding.companyName);
      title.alignment = { ...title.alignment, wrapText: true };
    }
    if (imageId === null || !dimensions?.width || !dimensions.height) continue;

    const column = Math.max(0, sheet.columnCount - 2);
    const columnPixels = (index: number): number =>
      Math.floor((sheet.getColumn(index + 1).width ?? 9) * 7 + 5);
    const area = options.logoArea ?? {
      column,
      row: 2,
      width: columnPixels(column) + (sheet.columnCount > 1 ? columnPixels(column + 1) : 0),
      height: Math.max(36, (sheet.getRow(3).height ?? 0) * 4 / 3),
    };
    const row = sheet.getRow(area.row + 1);
    row.height = Math.max(row.height ?? 0, area.height * 3 / 4);
    const scale = Math.min(140 / dimensions.width, (area.width - 8) / dimensions.width,
      (area.height - 8) / dimensions.height);
    const width = dimensions.width * scale;
    const height = dimensions.height * scale;
    sheet.addImage(imageId, {
      tl: { col: area.column + 4 / columnPixels(area.column), row: area.row + (area.height - height) / (2 * area.height) },
      ext: { width, height },
      editAs: 'oneCell',
    });
  }
};
