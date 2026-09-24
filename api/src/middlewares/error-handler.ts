import { UniqueConstraintError, ValidationError } from 'sequelize';
import { ZodError } from 'zod';

import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';

export interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    stack?: string;
  };
}

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'Error interno del servidor';
  let details: unknown = undefined;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Error de validación';
    details = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
  } else if (err instanceof UniqueConstraintError) {
    statusCode = 409;
    code = 'CONFLICT';
    message = 'Registro duplicado: ya existe un registro con esos datos';
    details = err.errors.map((e) => ({
      field: e.path ?? undefined,
      message: e.message,
    }));
  } else if (err instanceof ValidationError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = err.errors.map((e) => e.message).join(', ') || 'Error de validación';
    details = err.errors.map((e) => ({
      field: e.path ?? undefined,
      message: e.message,
    }));
  } else if (err instanceof Error) {
    if (env.NODE_ENV === 'development') {
      message = err.message || message;
    }
  }

  const log: Logger = (res.locals.logger as Logger) ?? logger;

  if (statusCode >= 500) {
    log.error(
      {
         err,
         requestId: res.locals.requestId,
         method: req.method,
         path: req.path,
         statusCode,
      },
      message,
    );
  } else {
    log.warn(
      {
         requestId: res.locals.requestId,
         method: req.method,
         path: req.path,
         statusCode,
         code,
      },
      message,
    );
  }

  const responseBody: ErrorResponseBody = {
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      ...(env.NODE_ENV === 'development' && err instanceof Error && err.stack
        ? { stack: err.stack }
        : {}),
    },
  };

  res.status(statusCode).json(responseBody);
};
