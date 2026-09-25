import multer, { MulterError } from 'multer';

import { ApiError } from '../utils/ApiError.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

const allowedMimeTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const maxSizeMb = 5;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxSizeMb * 1024 * 1024,
    files: 1,
    fields: 16,
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype.toLowerCase())) {
      callback(
        ApiError.badRequest('Formato de comprobante no permitido. Use PDF, JPG, PNG o WebP'),
      );
      return;
    }

    callback(null, true);
  },
}).single('comprobantePago');

export const paymentReceiptUpload: RequestHandler = (
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

      next(ApiError.badRequest('Comprobante de pago inválido'));
      return;
    }

    if (req.file && typeof req.body.comprobantePago !== 'string') {
      req.body.comprobantePago = req.file.originalname;
    }

    next(error);
  });
};
