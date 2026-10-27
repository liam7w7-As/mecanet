import { ApiError } from '../utils/ApiError.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Restringe una ruta a roles concretos. Se usa para acciones que, aun teniendo
 * permiso de módulo, la operación exige reservar a administración (por ejemplo,
 * anular una compra o completar los datos de un proveedor).
 */
export const authorizeRoles = (...roles: string[]): RequestHandler => {
  const allowed = new Set(roles);
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.internal('Error de programación: authorizeRoles requiere authenticate previo'));
      return;
    }
    if (!allowed.has(req.user.role)) {
      next(ApiError.forbidden('No tienes permiso para esta acción'));
      return;
    }
    next();
  };
};
