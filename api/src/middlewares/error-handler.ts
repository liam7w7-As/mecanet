import { logger } from '../utils/logger.js';

import type { NextFunction, Request, Response } from 'express';

export interface CustomError extends Error {
  statusCode?: number;
  code?: string;
}

export const errorHandler = (
  err: CustomError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_SERVER_ERROR';
  const message = err.message || 'Error interno del servidor';

  logger.error({
    err,
    method: req.method,
    url: req.originalUrl,
    statusCode,
  });

  res.status(statusCode).json({
    error: {
      message,
      code,
    },
  });
};
