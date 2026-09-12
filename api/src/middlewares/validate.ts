import { ApiError } from '../utils/ApiError.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodSchema } from 'zod';

export interface ValidationSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export const validate = (schemas: ValidationSchemas): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        const result = schemas.body.safeParse(req.body);
        if (!result.success) {
          const details = result.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          }));
          throw ApiError.badRequest('Error de validación', details, 'VALIDATION_ERROR');
        }
        req.body = result.data;
      }

      if (schemas.query) {
        const result = schemas.query.safeParse(req.query);
        if (!result.success) {
          const details = result.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          }));
          throw ApiError.badRequest('Error de validación', details, 'VALIDATION_ERROR');
        }
        // En Express 5, req.query es una propiedad getter de solo lectura.
        // Se redefine la propiedad para que los valores parseados y transformados por Zod
        // estén disponibles directamente en req.query, y adicionalmente en res.locals.validatedQuery.
        Object.defineProperty(req, 'query', {
          value: result.data,
          writable: true,
          configurable: true,
          enumerable: true,
        });
        res.locals.validatedQuery = result.data;
      }

      if (schemas.params) {
        const result = schemas.params.safeParse(req.params);
        if (!result.success) {
          const details = result.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          }));
          throw ApiError.badRequest('Error de validación', details, 'VALIDATION_ERROR');
        }
        req.params = result.data as Record<string, string>;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
