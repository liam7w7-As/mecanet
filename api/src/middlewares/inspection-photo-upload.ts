import multer, { MulterError } from 'multer';

import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxSizeBytes = env.MAX_INSPECTION_PHOTO_SIZE_MB * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxSizeBytes,
    files: 1,
    fields: 0,
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype.toLowerCase())) {
      callback(ApiError.badRequest('Formato de foto no permitido. Use JPEG, PNG o WebP'));
      return;
    }

    callback(null, true);
  },
}).single('photo');

export const inspectionPhotoUpload: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  upload(req, res, (error: unknown) => {
    if (error instanceof MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        next(
          ApiError.badRequest(
            `La foto supera el límite de ${env.MAX_INSPECTION_PHOTO_SIZE_MB} MB`,
          ),
        );
        return;
      }

      next(ApiError.badRequest('Archivo de inspección inválido'));
      return;
    }

    next(error);
  });
};
