import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { env } from '../config/env.js';
import { sequelize } from '../config/database.js';
import { CompanySettings } from '../models/CompanySettings.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

import type {
  CompanyLogoPublic,
  CompanySettings as CompanySettingsInput,
  PublicBranding,
  UpdateCompanySettingsInput,
} from '@unithor/shared';
import type { Transaction } from 'sequelize';

interface DetectedImage {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/svg+xml';
  extension: 'jpg' | 'png' | 'webp' | 'svg';
}

export interface CompanySettingsPublic extends CompanySettingsInput {
  logo: CompanyLogoPublic;
  updatedAt: string;
  lastEditor: { id: number; nombre: string } | null;
}

export interface CompanyLogoFile {
  bytes: Buffer;
  mimeType: string;
}

const SINGLETON_ID = 1;
const LOGO_FOLDER = 'branding';
const uploadRoot = path.resolve(env.UPLOAD_DIR);

const isPng = (buffer: Buffer): boolean =>
  buffer.length >= 8 &&
  buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

/**
 * SVG solo si se declara como tal: puede contener scripts, así que se acepta
 * únicamente si el cliente lo declara Y el contenido arranca con <svg. El SVG
 * tampoco pasa por el renderizado de PDF, queda para la app web.
 */
const isSvg = (buffer: Buffer): boolean => {
  const head = buffer.subarray(0, 1024).toString('utf8').trimStart();
  return head.startsWith('<svg') || head.startsWith('<?xml');
};

const isJpeg = (buffer: Buffer): boolean =>
  buffer.length >= 5 &&
  buffer[0] === 0xff &&
  buffer[1] === 0xd8 &&
  buffer[2] === 0xff &&
  buffer[buffer.length - 2] === 0xff &&
  buffer[buffer.length - 1] === 0xd9;

const isWebp = (buffer: Buffer): boolean =>
  buffer.length >= 12 &&
  buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
  buffer.subarray(8, 12).toString('ascii') === 'WEBP' &&
  buffer.readUInt32LE(4) + 8 === buffer.length;

const detectImage = (buffer: Buffer): DetectedImage => {
  if (isJpeg(buffer)) return { mimeType: 'image/jpeg', extension: 'jpg' };
  if (isPng(buffer)) return { mimeType: 'image/png', extension: 'png' };
  if (isWebp(buffer)) return { mimeType: 'image/webp', extension: 'webp' };
  if (isSvg(buffer)) return { mimeType: 'image/svg+xml', extension: 'svg' };

  throw ApiError.badRequest(
    'El contenido del archivo no corresponde a una imagen válida (JPEG, PNG, WebP o SVG)',
  );
};

const resolveStoragePath = (storageKey: string): string => {
  const resolved = path.resolve(uploadRoot, ...storageKey.split('/'));
  const rootPrefix = uploadRoot.endsWith(path.sep) ? uploadRoot : `${uploadRoot}${path.sep}`;
  if (!resolved.startsWith(rootPrefix)) {
    throw ApiError.internal('Ruta de almacenamiento de marca inválida');
  }
  return resolved;
};

const removeStoredFile = async (storageKey: string): Promise<void> => {
  try {
    await unlink(resolveStoragePath(storageKey));
  } catch (error: unknown) {
    const fileError = error as NodeJS.ErrnoException;
    if (fileError.code !== 'ENOENT') {
      logger.warn({ err: error, storageKey }, 'No se pudo eliminar el logo de la empresa');
    }
  }
};

const getOrCreateRow = async (transaction?: Transaction): Promise<CompanySettings> => {
  const existing = await CompanySettings.findByPk(SINGLETON_ID, { transaction });
  if (existing) {
    return existing;
  }
  return CompanySettings.create(
    {
      id: SINGLETON_ID,
      razonSocial: 'UNITHOR SERVICIOS INTEGRALES SPA',
      nombreComercial: 'UNITHOR',
      rut: null,
      giro: null,
      direccion: null,
      region: null,
      comuna: null,
      telefono: null,
      email: null,
      sitioWeb: null,
    },
    { transaction },
  );
};

const toLogoPublic = (settings: CompanySettings): CompanyLogoPublic => {
  const tieneLogo = Boolean(settings.logoStorageKey);
  return {
    tieneLogo,
    logoUrl: tieneLogo ? '/api/settings/company/logo' : null,
    mimeType: settings.logoMimeType ?? null,
    sizeBytes: settings.logoSizeBytes ?? null,
    updatedAt: settings.logoUpdatedAt ? settings.logoUpdatedAt.toISOString() : null,
  };
};

export const getCompanySettings = async (): Promise<CompanySettingsPublic> => {
  const settings = await getOrCreateRow();
  const lastEditor = settings.updatedBy
    ? await User.findByPk(settings.updatedBy, { attributes: ['id', 'nombre'] })
    : null;

  return {
    razonSocial: settings.razonSocial,
    nombreComercial: settings.nombreComercial,
    rut: settings.rut,
    giro: settings.giro,
    direccion: settings.direccion,
    region: settings.region,
    comuna: settings.comuna,
    telefono: settings.telefono,
    email: settings.email,
    sitioWeb: settings.sitioWeb,
    logo: toLogoPublic(settings),
    updatedAt: settings.updatedAt.toISOString(),
    lastEditor: lastEditor ? { id: lastEditor.id, nombre: lastEditor.nombre } : null,
  };
};

export const getPublicBranding = async (): Promise<PublicBranding> => {
  const settings = await getOrCreateRow();
  const logo = toLogoPublic(settings);
  return {
    razonSocial: settings.razonSocial,
    nombreComercial: settings.nombreComercial,
    rut: settings.rut,
    direccion: settings.direccion,
    region: settings.region,
    comuna: settings.comuna,
    telefono: settings.telefono,
    email: settings.email,
    sitioWeb: settings.sitioWeb,
    tieneLogo: logo.tieneLogo,
    logoUrl: logo.logoUrl,
    logoUpdatedAt: settings.logoUpdatedAt ? settings.logoUpdatedAt.toISOString() : null,
  };
};

export const updateCompanySettings = async (
  data: UpdateCompanySettingsInput,
  userId: number,
): Promise<CompanySettingsPublic> => {
  await sequelize.transaction(async (transaction) => {
    const settings = await getOrCreateRow(transaction);
    await settings.update({ ...data, updatedBy: userId }, { transaction });
  });

  return getCompanySettings();
};

export const saveCompanyLogo = async (
  file: Express.Multer.File,
  userId: number,
): Promise<CompanySettingsPublic> => {
  const detected = detectImage(file.buffer);
  if (file.mimetype.toLowerCase() !== detected.mimeType) {
    throw ApiError.badRequest('El tipo declarado del logo no coincide con su contenido');
  }

  const storageKey = path.posix.join(LOGO_FOLDER, `logo-${randomUUID()}.${detected.extension}`);
  const finalPath = resolveStoragePath(storageKey);
  const temporaryPath = `${finalPath}.tmp`;

  await mkdir(path.dirname(finalPath), { recursive: true });
  await writeFile(temporaryPath, file.buffer, { flag: 'wx' });
  try {
    await rename(temporaryPath, finalPath);
  } catch (error) {
    await removeStoredFile(`${storageKey}.tmp`);
    throw error;
  }

  let previousStorageKey: string | null = null;
  try {
    await sequelize.transaction(async (transaction) => {
      const settings = await getOrCreateRow(transaction);
      previousStorageKey = settings.logoStorageKey;
      await settings.update(
        {
          logoStorageKey: storageKey,
          logoMimeType: detected.mimeType,
          logoSizeBytes: file.size,
          logoUpdatedAt: new Date(),
          updatedBy: userId,
        },
        { transaction },
      );
    });
  } catch (error) {
    await removeStoredFile(storageKey);
    throw error;
  }

  // Solo se borra el anterior cuando la transacción ya confirmó.
  if (previousStorageKey) {
    await removeStoredFile(previousStorageKey);
  }

  return getCompanySettings();
};

export const deleteCompanyLogo = async (userId: number): Promise<CompanySettingsPublic> => {
  let previousStorageKey: string | null = null;

  await sequelize.transaction(async (transaction) => {
    const settings = await getOrCreateRow(transaction);
    previousStorageKey = settings.logoStorageKey;
    await settings.update(
      {
        logoStorageKey: null,
        logoMimeType: null,
        logoSizeBytes: null,
        logoUpdatedAt: null,
        updatedBy: userId,
      },
      { transaction },
    );
  });

  if (previousStorageKey) {
    await removeStoredFile(previousStorageKey);
  }

  return getCompanySettings();
};

export const readCompanyLogo = async (): Promise<CompanyLogoFile> => {
  const settings = await CompanySettings.findByPk(SINGLETON_ID);
  if (!settings?.logoStorageKey) {
    throw ApiError.notFound('No hay un logo configurado');
  }

  try {
    return {
      bytes: await readFile(resolveStoragePath(settings.logoStorageKey)),
      mimeType: settings.logoMimeType ?? 'application/octet-stream',
    };
  } catch (error: unknown) {
    const fileError = error as NodeJS.ErrnoException;
    if (fileError.code === 'ENOENT') {
      throw ApiError.notFound('El archivo del logo no existe en el servidor');
    }
    throw error;
  }
};
