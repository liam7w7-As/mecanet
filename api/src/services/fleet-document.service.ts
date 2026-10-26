import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

import { getFleetExpiryInfo } from '@unithor/shared';
import { Transaction } from 'sequelize';

import { readStoredFile, removeStoredFile, storeFile } from './file-storage.service.js';
import { sequelize } from '../config/database.js';
import { FleetDocument } from '../models/FleetDocument.js';
import { FleetDocumentVersion } from '../models/FleetDocumentVersion.js';
import { FleetVehicle } from '../models/FleetVehicle.js';
import { ApiError } from '../utils/ApiError.js';

import type {
  CreateFleetDocumentInput,
  FleetDocumentVersionInput,
  UpdateFleetDocumentInput,
} from '@unithor/shared';
import type { FleetExpiryInfo } from '@unithor/shared';

interface DetectedDocument {
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';
  extension: 'pdf' | 'jpg' | 'png' | 'webp';
}

interface PreparedDocumentFile {
  archivoNombre: string;
  storageKey: string;
  mimeType: DetectedDocument['mimeType'];
  sizeBytes: number;
  sha256: string;
}

export interface FleetDocumentPublic {
  id: number;
  fleetVehicleId: number;
  nombre: string;
  referencia: string | null;
  notas: string | null;
  fechaEmision: string | null;
  fechaVencimiento: string | null;
  archivoNombre: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  version: number;
  tieneArchivo: boolean;
  subidoPor: number | null;
  expiry: FleetExpiryInfo;
  createdAt: Date;
  updatedAt: Date;
}

export interface FleetDocumentVersionPublic {
  id: number;
  version: number;
  archivoNombre: string;
  mimeType: string;
  sizeBytes: number;
  fechaEmision: string | null;
  fechaVencimiento: string | null;
  referencia: string | null;
  notas: string | null;
  subidoPor: number | null;
  createdAt: Date;
  esActual: false;
}

export interface FleetDocumentVersionsResult {
  current: FleetDocumentPublic;
  versions: FleetDocumentVersionPublic[];
}

export interface FleetDocumentFile {
  bytes: Buffer;
  fileName: string;
  mimeType: string;
}

const isPdf = (buffer: Buffer): boolean =>
  buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';

const isPng = (buffer: Buffer): boolean =>
  buffer.length >= 20 &&
  buffer
    .subarray(0, 8)
    .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) &&
  buffer.subarray(-8).equals(Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]));

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

const detectDocumentFile = (buffer: Buffer): DetectedDocument => {
  if (isPdf(buffer)) {
    return { mimeType: 'application/pdf', extension: 'pdf' };
  }
  if (isJpeg(buffer)) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }
  if (isPng(buffer)) {
    return { mimeType: 'image/png', extension: 'png' };
  }
  if (isWebp(buffer)) {
    return { mimeType: 'image/webp', extension: 'webp' };
  }

  throw ApiError.badRequest(
    'El contenido del archivo no corresponde a un PDF, JPG, PNG o WebP válido',
  );
};

const sanitizeFileName = (originalName: string, extension: string): string => {
  const baseName = path
    .basename(originalName.replace(/\\/g, '/'))
    .trim();
  const cleanName = Array.from(baseName)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('');

  if (!cleanName) {
    return `documento.${extension}`;
  }

  return cleanName.slice(0, 255);
};

const prepareFile = (
  vehicleId: number,
  file: Express.Multer.File,
): PreparedDocumentFile => {
  const detected = detectDocumentFile(file.buffer);
  if (file.mimetype.toLowerCase() !== detected.mimeType) {
    throw ApiError.badRequest('El tipo declarado del archivo no coincide con su contenido');
  }

  return {
    archivoNombre: sanitizeFileName(file.originalname, detected.extension),
    storageKey: `fleet-documents/${vehicleId}/${randomUUID()}.${detected.extension}`,
    mimeType: detected.mimeType,
    sizeBytes: file.buffer.length,
    sha256: createHash('sha256').update(file.buffer).digest('hex'),
  };
};

const assertValidExpiryRange = (
  fechaEmision: string | null,
  fechaVencimiento: string | null,
): void => {
  if (fechaEmision && fechaVencimiento && fechaVencimiento < fechaEmision) {
    throw ApiError.badRequest('El vencimiento no puede ser anterior a la emisión');
  }
};

const orderDocuments = (documents: FleetDocument[]): FleetDocument[] =>
  [...documents].sort((left, right) => {
    if (!left.fechaVencimiento && !right.fechaVencimiento) {
      return right.id - left.id;
    }
    if (!left.fechaVencimiento) {
      return 1;
    }
    if (!right.fechaVencimiento) {
      return -1;
    }
    return left.fechaVencimiento.localeCompare(right.fechaVencimiento);
  });

export const toFleetDocumentPublic = (document: FleetDocument): FleetDocumentPublic => ({
  id: document.id,
  fleetVehicleId: document.fleetVehicleId,
  nombre: document.nombre,
  referencia: document.referencia,
  notas: document.notas,
  fechaEmision: document.fechaEmision,
  fechaVencimiento: document.fechaVencimiento,
  archivoNombre: document.archivoNombre,
  mimeType: document.mimeType,
  sizeBytes: document.sizeBytes,
  version: document.version,
  tieneArchivo: Boolean(document.storageKey),
  subidoPor: document.subidoPor,
  expiry: getFleetExpiryInfo(document.fechaVencimiento),
  createdAt: document.createdAt,
  updatedAt: document.updatedAt,
});

const toVersionPublic = (version: FleetDocumentVersion): FleetDocumentVersionPublic => ({
  id: version.id,
  version: version.version,
  archivoNombre: version.archivoNombre,
  mimeType: version.mimeType,
  sizeBytes: version.sizeBytes,
  fechaEmision: version.fechaEmision,
  fechaVencimiento: version.fechaVencimiento,
  referencia: version.referencia,
  notas: version.notas,
  subidoPor: version.subidoPor,
  createdAt: version.createdAt,
  esActual: false,
});

const assertVehicleExists = async (vehicleId: number): Promise<void> => {
  const vehicle = await FleetVehicle.findByPk(vehicleId, { attributes: ['id'] });
  if (!vehicle) {
    throw ApiError.notFound('Vehículo de flota no encontrado');
  }
};

const findDocument = async (
  vehicleId: number,
  documentId: number,
): Promise<FleetDocument> => {
  const document = await FleetDocument.findOne({
    where: { id: documentId, fleetVehicleId: vehicleId },
  });

  if (!document) {
    throw ApiError.notFound('Documento de flota no encontrado');
  }

  return document;
};

export const listFleetDocuments = async (vehicleId: number): Promise<FleetDocumentPublic[]> => {
  await assertVehicleExists(vehicleId);
  const documents = await FleetDocument.findAll({ where: { fleetVehicleId: vehicleId } });
  return orderDocuments(documents).map(toFleetDocumentPublic);
};

export const createFleetDocument = async (
  vehicleId: number,
  data: CreateFleetDocumentInput,
  file: Express.Multer.File | undefined,
  userId: number,
): Promise<FleetDocumentPublic> => {
  await assertVehicleExists(vehicleId);
  assertValidExpiryRange(data.fechaEmision ?? null, data.fechaVencimiento ?? null);

  const prepared = file ? prepareFile(vehicleId, file) : null;
  if (prepared) {
    await storeFile(prepared.storageKey, file!.buffer, prepared.mimeType);
  }

  try {
    const document = await FleetDocument.create({
      fleetVehicleId: vehicleId,
      nombre: data.nombre,
      referencia: data.referencia ?? null,
      notas: data.notas ?? null,
      fechaEmision: data.fechaEmision ?? null,
      fechaVencimiento: data.fechaVencimiento ?? null,
      archivoNombre: prepared?.archivoNombre ?? null,
      storageKey: prepared?.storageKey ?? null,
      mimeType: prepared?.mimeType ?? null,
      sizeBytes: prepared?.sizeBytes ?? null,
      sha256: prepared?.sha256 ?? null,
      version: prepared ? 1 : 0,
      subidoPor: prepared ? userId : null,
    });

    return toFleetDocumentPublic(document);
  } catch (error: unknown) {
    if (prepared) {
      await removeStoredFile(prepared.storageKey, false);
    }
    throw error;
  }
};

export const updateFleetDocument = async (
  vehicleId: number,
  documentId: number,
  data: UpdateFleetDocumentInput,
): Promise<FleetDocumentPublic> => {
  const document = await findDocument(vehicleId, documentId);
  assertValidExpiryRange(
    data.fechaEmision !== undefined ? data.fechaEmision : document.fechaEmision,
    data.fechaVencimiento !== undefined
      ? data.fechaVencimiento
      : document.fechaVencimiento,
  );

  const payload: {
    nombre?: string;
    referencia?: string | null;
    notas?: string | null;
    fechaEmision?: string | null;
    fechaVencimiento?: string | null;
  } = {};

  if (data.nombre !== undefined) payload.nombre = data.nombre;
  if (data.referencia !== undefined) payload.referencia = data.referencia;
  if (data.notas !== undefined) payload.notas = data.notas;
  if (data.fechaEmision !== undefined) payload.fechaEmision = data.fechaEmision;
  if (data.fechaVencimiento !== undefined) {
    payload.fechaVencimiento = data.fechaVencimiento;
  }

  await document.update(payload);
  return toFleetDocumentPublic(document);
};

export const deleteFleetDocument = async (
  vehicleId: number,
  documentId: number,
): Promise<void> => {
  const document = await findDocument(vehicleId, documentId);
  await document.destroy();
};

export const addFleetDocumentVersion = async (
  vehicleId: number,
  documentId: number,
  data: FleetDocumentVersionInput,
  file: Express.Multer.File,
  userId: number,
): Promise<FleetDocumentPublic> => {
  const prepared = prepareFile(vehicleId, file);
  await storeFile(prepared.storageKey, file.buffer, prepared.mimeType);

  try {
    const document = await sequelizeTransaction(async (transaction) => {
      const current = await FleetDocument.findOne({
        where: { id: documentId, fleetVehicleId: vehicleId },
        transaction,
        lock: Transaction.LOCK.UPDATE,
      });

      if (!current) {
        throw ApiError.notFound('Documento de flota no encontrado');
      }

      assertValidExpiryRange(
        data.fechaEmision !== undefined ? data.fechaEmision : current.fechaEmision,
        data.fechaVencimiento !== undefined
          ? data.fechaVencimiento
          : current.fechaVencimiento,
      );

      const hasCurrentFile =
        current.version > 0 &&
        current.storageKey !== null &&
        current.archivoNombre !== null &&
        current.mimeType !== null &&
        current.sizeBytes !== null &&
        current.sha256 !== null;

      if (hasCurrentFile) {
        await FleetDocumentVersion.create(
          {
            fleetDocumentId: current.id,
            version: current.version,
            nombre: current.nombre,
            referencia: current.referencia,
            notas: current.notas,
            fechaEmision: current.fechaEmision,
            fechaVencimiento: current.fechaVencimiento,
            archivoNombre: current.archivoNombre!,
            storageKey: current.storageKey!,
            mimeType: current.mimeType!,
            sizeBytes: current.sizeBytes!,
            sha256: current.sha256!,
            subidoPor: current.subidoPor,
          },
          { transaction },
        );
      }

      const payload: {
        archivoNombre: string;
        storageKey: string;
        mimeType: string;
        sizeBytes: number;
        sha256: string;
        version: number;
        subidoPor: number;
        nombre?: string;
        referencia?: string | null;
        notas?: string | null;
        fechaEmision?: string | null;
        fechaVencimiento?: string | null;
      } = {
        archivoNombre: prepared.archivoNombre,
        storageKey: prepared.storageKey,
        mimeType: prepared.mimeType,
        sizeBytes: prepared.sizeBytes,
        sha256: prepared.sha256,
        version: current.version + 1,
        subidoPor: userId,
      };

      if (data.nombre !== undefined) payload.nombre = data.nombre;
      if (data.referencia !== undefined) payload.referencia = data.referencia;
      if (data.notas !== undefined) payload.notas = data.notas;
      if (data.fechaEmision !== undefined) payload.fechaEmision = data.fechaEmision;
      if (data.fechaVencimiento !== undefined) {
        payload.fechaVencimiento = data.fechaVencimiento;
      }

      await current.update(payload, { transaction });
      return current;
    });

    return toFleetDocumentPublic(document);
  } catch (error: unknown) {
    await removeStoredFile(prepared.storageKey, false);
    throw error;
  }
};

const sequelizeTransaction = <T>(
  callback: (transaction: Transaction) => Promise<T>,
): Promise<T> => sequelize.transaction(callback);

export const getFleetDocumentVersions = async (
  vehicleId: number,
  documentId: number,
): Promise<FleetDocumentVersionsResult> => {
  const document = await findDocument(vehicleId, documentId);
  const versions = await FleetDocumentVersion.findAll({
    where: { fleetDocumentId: document.id },
    order: [['version', 'DESC']],
  });

  return {
    current: toFleetDocumentPublic(document),
    versions: versions.map(toVersionPublic),
  };
};

export const readFleetDocumentFile = async (
  vehicleId: number,
  documentId: number,
  versionId?: number,
): Promise<FleetDocumentFile> => {
  const document = await findDocument(vehicleId, documentId);

  if (versionId !== undefined) {
    const version = await FleetDocumentVersion.findOne({
      where: { id: versionId, fleetDocumentId: document.id },
    });

    if (!version) {
      throw ApiError.notFound('Versión del documento no encontrada');
    }

    return {
      bytes: await readStoredFile(
        version.storageKey,
        'Archivo de la versión del documento no encontrado',
      ),
      fileName: version.archivoNombre,
      mimeType: version.mimeType,
    };
  }

  if (!document.storageKey || !document.archivoNombre || !document.mimeType) {
    throw ApiError.notFound('El documento no tiene un archivo adjunto');
  }

  return {
    bytes: await readStoredFile(document.storageKey, 'Archivo del documento no encontrado'),
    fileName: document.archivoNombre,
    mimeType: document.mimeType,
  };
};
