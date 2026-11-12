import multer, { MulterError } from 'multer';

import { ApiError } from '../utils/ApiError.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxSizeBytes = 8 * 1024 * 1024; // 8 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxSizeBytes,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype.toLowerCase())) {
      callback(ApiError.badRequest('Formato de imagen no permitido. Use JPEG, PNG o WebP'));
      return;
    }
    callback(null, true);
  },
}).single('foto');

export const vehiclePhotoUpload: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  upload(req, res, (error: unknown) => {
    if (error instanceof MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        next(ApiError.badRequest('La foto supera el límite de 8 MB'));
        return;
      }
      if (error.code === 'LIMIT_UNEXPECTED_FILE') {
        next(ApiError.badRequest('Debe enviar el archivo en el campo "foto"'));
        return;
      }
      next(ApiError.badRequest('Archivo de imagen inválido'));
      return;
    }

    if (error) {
      next(error);
      return;
    }

    if (!req.file) {
      next(ApiError.badRequest('No se recibió ningún archivo de foto'));
      return;
    }

    next();
  });
};
