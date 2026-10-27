import { WORK_ORDER_OBSERVATION_MAX_FILES } from '@unithor/shared';
import multer, { MulterError } from 'multer';

import { ApiError } from '../utils/ApiError.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);
const maxSizeBytes = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxSizeBytes,
    files: WORK_ORDER_OBSERVATION_MAX_FILES,
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype.toLowerCase())) {
      callback(ApiError.badRequest('Formato no permitido. Use JPEG, PNG, WebP o PDF'));
      return;
    }
    callback(null, true);
  },
}).array('files', WORK_ORDER_OBSERVATION_MAX_FILES);

export const observationUpload: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  upload(req, res, (error: unknown) => {
    if (error instanceof MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        next(ApiError.badRequest('El archivo adjunto supera el límite de 10 MB'));
        return;
      }
      if (error.code === 'LIMIT_FILE_COUNT') {
        next(
          ApiError.badRequest(
            `Cada observación admite hasta ${WORK_ORDER_OBSERVATION_MAX_FILES} archivos`,
          ),
        );
        return;
      }
      next(ApiError.badRequest('Adjunto de observación inválido'));
      return;
    }
    next(error);
  });
};
