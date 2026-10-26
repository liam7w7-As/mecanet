import multer, { MulterError } from 'multer';

import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

const allowedMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const maxSizeBytes = env.MAX_FLEET_DOCUMENT_SIZE_MB * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxSizeBytes,
    files: 1,
    fields: 10,
    parts: 11,
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype.toLowerCase())) {
      callback(ApiError.badRequest('Formato de archivo no permitido. Use PDF, JPG, PNG o WebP'));
      return;
    }

    callback(null, true);
  },
}).single('file');

/**
 * Acepta documentos de flota en multipart/form-data. El archivo es opcional:
 * un documento puede ser solo metadata.
 */
export const fleetDocumentUpload: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  upload(req, res, (error: unknown) => {
    if (error instanceof MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        next(
          ApiError.badRequest(
            `El archivo supera el límite de ${env.MAX_FLEET_DOCUMENT_SIZE_MB} MB`,
          ),
        );
        return;
      }

      next(ApiError.badRequest('Archivo de documento de flota inválido'));
      return;
    }

    next(error);
  });
};
