import { env } from '../config/env.js';
import { createFileStorage, StoredFileNotFoundError } from '../storage/file-storage.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

const storage = createFileStorage(env);

// Do not log SDK errors: signed requests can contain credentials or headers.
const storageFailure = (operation: string): ApiError => {
  logger.error(
    { operation, driver: env.STORAGE_DRIVER },
    'El almacenamiento de archivos no esta disponible',
  );
  return new ApiError(
    503,
    'STORAGE_UNAVAILABLE',
    'No se pudo acceder al almacenamiento de archivos. Intenta nuevamente.',
  );
};

export const initializeFileStorage = async (): Promise<void> => {
  try {
    await storage.check();
    logger.info({ driver: env.STORAGE_DRIVER }, 'Almacenamiento de archivos verificado');
  } catch {
    throw storageFailure('check');
  }
};

export const storeFile = async (key: string, bytes: Buffer, mimeType: string): Promise<void> => {
  try {
    await storage.put(key, bytes, mimeType);
  } catch {
    throw storageFailure('put');
  }
};

export const readStoredFile = async (key: string, missingMessage: string): Promise<Buffer> => {
  try {
    return await storage.read(key);
  } catch (error) {
    if (error instanceof StoredFileNotFoundError) throw ApiError.notFound(missingMessage);
    throw storageFailure('read');
  }
};

export const removeStoredFile = async (key: string, retain = true): Promise<void> => {
  try {
    await storage.remove(key, retain);
  } catch {
    // Cleanup must not turn an already committed database operation into a failure.
    logger.warn(
      { driver: env.STORAGE_DRIVER, storageKey: key },
      'No se pudo retirar un archivo del almacenamiento',
    );
  }
};
