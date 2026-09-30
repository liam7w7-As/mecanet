import { readFile } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import { logger } from '../../utils/logger.js';
import { getCompanySettings, readCompanyLogo } from '../settings.service.js';

export interface ReportBranding {
  companyName: string;
  legalName: string;
  rut: string | null;
  address: string;
  contact: string;
  logoPng: Buffer | null;
}

const FALLBACK_LOGO_PATHS = [
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
  try {
    const source = hasConfiguredLogo
      ? (await readCompanyLogo()).bytes
      : await readFallbackLogo();
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
