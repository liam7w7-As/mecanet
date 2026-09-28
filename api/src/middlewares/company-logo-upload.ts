import multer, { MulterError } from 'multer';

import { ApiError } from '../utils/ApiError.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']);
const maxSizeBytes = 2 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxSizeBytes,
    files: 1,
    fields: 0,
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype.toLowerCase())) {
      callback(ApiError.badRequest('Formato de logo no permitido. Use JPEG, PNG, WebP o SVG'));
      return;
    }

    callback(null, true);
  },
}).single('logo');

export const companyLogoUpload: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  upload(req, res, (error: unknown) => {
    if (error instanceof MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        next(ApiError.badRequest('El logo supera el límite de 2 MB'));
        return;
      }
      if (error.code === 'LIMIT_UNEXPECTED_FILE') {
        next(ApiError.badRequest('Debe enviar el archivo en el campo "logo"'));
        return;
      }

      next(ApiError.badRequest('Archivo de logo inválido'));
      return;
    }

    if (!error && !req.file) {
      next(ApiError.badRequest('No se recibió ningún archivo de logo'));
      return;
    }

    next(error);
  });
};
