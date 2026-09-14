import { hasPermission } from '../services/permission.service.js';
import { ApiError } from '../utils/ApiError.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Middleware de Autorización RBAC.
 * Verifica si el usuario autenticado posee permiso para ejecutar la acción solicitada en el módulo.
 * Requiere que el middleware 'authenticate' se haya ejecutado previamente.
 */
export const authorize = (modulo: string, accion: string): RequestHandler => {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw ApiError.internal(
          'Error de programación: Middleware authorize requiere authenticate previo',
        );
      }

      const allowed = await hasPermission(req.user.id, modulo, accion);
      if (!allowed) {
        throw ApiError.forbidden('No tienes permiso para esta acción');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
