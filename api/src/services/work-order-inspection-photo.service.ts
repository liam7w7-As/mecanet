import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Transaction } from 'sequelize';

import { sequelize } from '../config/database.js';
import { env } from '../config/env.js';
import { WorkOrder } from '../models/WorkOrder.js';
import { WorkOrderInspection } from '../models/WorkOrderInspection.js';
import { WorkOrderInspectionPhoto } from '../models/WorkOrderInspectionPhoto.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

import type { WorkOrderInspectionPhotoSlot } from '@unithor/shared';

interface DetectedImage {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  extension: 'jpg' | 'png' | 'webp';
}

export interface InspectionPhotoPublic {
  id: number;
  slot: WorkOrderInspectionPhotoSlot;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: number | null;
  createdAt: Date;
  updatedAt: Date;
  url: string;
}

export interface InspectionPhotoFile {
  photo: InspectionPhotoPublic;
  bytes: Buffer;
}

const uploadRoot = path.resolve(env.UPLOAD_DIR);

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

const detectImage = (buffer: Buffer): DetectedImage => {
  if (isJpeg(buffer)) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }
  if (isPng(buffer)) {
    return { mimeType: 'image/png', extension: 'png' };
  }
  if (isWebp(buffer)) {
    return { mimeType: 'image/webp', extension: 'webp' };
  }

  throw ApiError.badRequest('El contenido del archivo no corresponde a una imagen válida');
};

const toPublic = (
  photo: WorkOrderInspectionPhoto,
  workOrderId: number,
): InspectionPhotoPublic => ({
  id: photo.id,
  slot: photo.slot,
  mimeType: photo.mimeType,
  sizeBytes: photo.sizeBytes,
  uploadedBy: photo.uploadedBy,
  createdAt: photo.createdAt,
  updatedAt: photo.updatedAt,
  url: `/api/work-orders/${workOrderId}/inspection/photos/${photo.slot}`,
});

const resolveStoragePath = (storageKey: string): string => {
  const resolved = path.resolve(uploadRoot, ...storageKey.split('/'));
  const rootPrefix = uploadRoot.endsWith(path.sep) ? uploadRoot : `${uploadRoot}${path.sep}`;

  if (!resolved.startsWith(rootPrefix)) {
    throw ApiError.internal('Ruta de almacenamiento de inspección inválida');
  }

  return resolved;
};

const removeStoredFile = async (storageKey: string): Promise<void> => {
  try {
    await unlink(resolveStoragePath(storageKey));
  } catch (error: unknown) {
    const fileError = error as NodeJS.ErrnoException;
    if (fileError.code !== 'ENOENT') {
      logger.warn({ err: error, storageKey }, 'No se pudo eliminar un archivo de inspección');
    }
  }
};

const assertEditable = (workOrder: WorkOrder): void => {
  if (workOrder.estado === 'entregada' || workOrder.estado === 'cancelada') {
    throw ApiError.badRequest('No se puede modificar la inspección de una orden cerrada');
  }
};

const getOrCreateInspection = async (
  workOrderId: number,
  userId: number,
  transaction: Transaction,
): Promise<WorkOrderInspection> => {
  const existing = await WorkOrderInspection.findOne({ where: { workOrderId }, transaction });
  if (existing) {
    return existing;
  }

  return WorkOrderInspection.create(
    {
      workOrderId,
      nivelCombustible: null,
      llantaDelanteraIzquierda: null,
      llantaDelanteraDerecha: null,
      llantaTraseraIzquierda: null,
      llantaTraseraDerecha: null,
      inventario: [],
      objetosValor: null,
      observaciones: null,
      inspectedBy: userId,
    },
    { transaction },
  );
};

export const saveInspectionPhoto = async (
  workOrderId: number,
  slot: WorkOrderInspectionPhotoSlot,
  file: Express.Multer.File,
  userId: number,
): Promise<InspectionPhotoPublic> => {
  const detected = detectImage(file.buffer);
  if (file.mimetype.toLowerCase() !== detected.mimeType) {
    throw ApiError.badRequest('El tipo declarado de la foto no coincide con su contenido');
  }

  const storageKey = path.posix.join(
    'work-orders',
    String(workOrderId),
    `${slot}-${randomUUID()}.${detected.extension}`,
  );
  const finalPath = resolveStoragePath(storageKey);
  const temporaryPath = `${finalPath}.tmp`;
  await mkdir(path.dirname(finalPath), { recursive: true });
  await writeFile(temporaryPath, file.buffer, { flag: 'wx' });

  try {
    await rename(temporaryPath, finalPath);
  } catch (error: unknown) {
    await removeStoredFile(`${storageKey}.tmp`);
    throw error;
  }

  let previousStorageKey: string | null = null;
  let savedPhoto: WorkOrderInspectionPhoto;

  try {
    savedPhoto = await sequelize.transaction(async (transaction) => {
      const workOrder = await WorkOrder.findByPk(workOrderId, {
        transaction,
        lock: Transaction.LOCK.UPDATE,
      });
      if (!workOrder) {
        throw ApiError.notFound('Orden de trabajo no encontrada');
      }
      assertEditable(workOrder);

      const inspection = await getOrCreateInspection(workOrderId, userId, transaction);
      const existingPhoto = await WorkOrderInspectionPhoto.findOne({
        where: { inspectionId: inspection.id, slot },
        transaction,
        lock: Transaction.LOCK.UPDATE,
      });
      const payload = {
        storageKey,
        mimeType: detected.mimeType,
        sizeBytes: file.size,
        sha256: createHash('sha256').update(file.buffer).digest('hex'),
        uploadedBy: userId,
      };

      if (existingPhoto) {
        previousStorageKey = existingPhoto.storageKey;
        await existingPhoto.update(payload, { transaction });
        return existingPhoto;
      }

      return WorkOrderInspectionPhoto.create(
        { inspectionId: inspection.id, slot, ...payload },
        { transaction },
      );
    });
  } catch (error: unknown) {
    await removeStoredFile(storageKey);
    throw error;
  }

  if (previousStorageKey) {
    await removeStoredFile(previousStorageKey);
  }

  return toPublic(savedPhoto, workOrderId);
};

const findPhoto = async (
  workOrderId: number,
  slot: WorkOrderInspectionPhotoSlot,
): Promise<WorkOrderInspectionPhoto> => {
  const workOrder = await WorkOrder.findByPk(workOrderId, {
    attributes: ['id'],
    include: [
      {
        model: WorkOrderInspection,
        as: 'inspection',
        attributes: ['id'],
        required: true,
        include: [
          {
            model: WorkOrderInspectionPhoto,
            as: 'photos',
            where: { slot },
            required: true,
          },
        ],
      },
    ],
  });

  const photo = workOrder?.inspection?.photos?.[0];
  if (!photo) {
    throw ApiError.notFound('Foto de inspección no encontrada');
  }

  return photo;
};

export const getInspectionPhoto = async (
  workOrderId: number,
  slot: WorkOrderInspectionPhotoSlot,
): Promise<InspectionPhotoFile> => {
  const photo = await findPhoto(workOrderId, slot);

  try {
    return {
      photo: toPublic(photo, workOrderId),
      bytes: await readFile(resolveStoragePath(photo.storageKey)),
    };
  } catch (error: unknown) {
    const fileError = error as NodeJS.ErrnoException;
    if (fileError.code === 'ENOENT') {
      throw ApiError.notFound('Archivo de inspección no encontrado');
    }
    throw error;
  }
};

export const deleteInspectionPhoto = async (
  workOrderId: number,
  slot: WorkOrderInspectionPhotoSlot,
): Promise<void> => {
  const storageKey = await sequelize.transaction(async (transaction) => {
    const workOrder = await WorkOrder.findByPk(workOrderId, {
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });
    if (!workOrder) {
      throw ApiError.notFound('Orden de trabajo no encontrada');
    }
    assertEditable(workOrder);

    const inspection = await WorkOrderInspection.findOne({
      where: { workOrderId },
      transaction,
    });
    if (!inspection) {
      throw ApiError.notFound('Foto de inspección no encontrada');
    }

    const photo = await WorkOrderInspectionPhoto.findOne({
      where: { inspectionId: inspection.id, slot },
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });
    if (!photo) {
      throw ApiError.notFound('Foto de inspección no encontrada');
    }

    const key = photo.storageKey;
    await photo.destroy({ transaction });
    return key;
  });

  await removeStoredFile(storageKey);
};
