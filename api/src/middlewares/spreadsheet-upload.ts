import multer, { MulterError } from 'multer';

import { IMPORT_MAX_FILE_SIZE_MB } from '@unithor/shared';

import { ApiError } from '../utils/ApiError.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

const maxSizeBytes = IMPORT_MAX_FILE_SIZE_MB * 1024 * 1024;

const hasExcelExtension = (fileName: string): boolean => /\.xlsx$/i.test(fileName.trim());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxSizeBytes,
    files: 1,
    fields: 10,
    parts: 11,
  },
  fileFilter: (_req, file, callback) => {
    // ExcelJS solo lee el formato moderno (.xlsx). Rechazar .xls acá evita un
    // error confuso más adelante, cuando el parser intente abrirlo.
    if (!hasExcelExtension(file.originalname)) {
      callback(ApiError.badRequest('Formato de archivo no permitido. Sube un Excel .xlsx'));
      return;
    }

    callback(null, true);
  },
}).single('file');

/**
 * Recibe la planilla de importación en multipart/form-data, en memoria.
 *
 * El archivo se mantiene en RAM porque se procesa una sola vez y no debe
 * quedar guardado en disco: la transacción de importación es la que persiste
 * los registros.
 */
export const spreadsheetUpload: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  upload(req, res, (error: unknown) => {
    if (error instanceof MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        next(
          ApiError.badRequest(
            `El archivo supera el límite de ${IMPORT_MAX_FILE_SIZE_MB} MB`,
          ),
        );
        return;
      }

      next(ApiError.badRequest('El archivo de importación no es válido'));
      return;
    }

    next(error);
  });
};
