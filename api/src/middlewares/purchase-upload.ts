import multer, { MulterError } from 'multer';

import { ApiError } from '../utils/ApiError.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

const allowedMimeTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const maxSizeMb = 8;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxSizeMb * 1024 * 1024,
    files: 1,
    fields: 32,
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype.toLowerCase())) {
      callback(ApiError.badRequest('Formato de comprobante no permitido. Use PDF, JPG, PNG o WebP'));
      return;
    }
    callback(null, true);
  },
}).single('comprobante');

/**
 * Recibe el comprobante y un campo `payload` con el JSON de la compra. El JSON
 * se expande en `req.body` para que el middleware `validate` aplique el mismo
 * esquema que usaría una petición JSON normal.
 */
export const purchaseUpload: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  upload(req, res, (error: unknown) => {
    if (error instanceof MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        next(ApiError.badRequest(`El comprobante supera el límite de ${maxSizeMb} MB`));
        return;
      }
      next(ApiError.badRequest('Comprobante de compra inválido'));
      return;
    }
    if (error) {
      next(error);
      return;
    }

    const payload = req.body?.payload;
    if (payload !== undefined) {
      if (typeof payload !== 'string') {
        next(ApiError.badRequest('El formulario de compra no es válido'));
        return;
      }
      try {
        req.body = JSON.parse(payload) as Record<string, unknown>;
      } catch {
        next(ApiError.badRequest('El formulario de compra no contiene un JSON válido'));
        return;
      }
    }

    next();
  });
};
