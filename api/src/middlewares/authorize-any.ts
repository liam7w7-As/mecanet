import { hasPermission } from '../services/permission.service.js';
import { ApiError } from '../utils/ApiError.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

export const authorizeAny = (
  permissions: Array<{ modulo: string; accion: string }>,
): RequestHandler => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw ApiError.internal('Error de programación: authorizeAny requiere authenticate previo');
      }

      const userId = req.user.id;
      const checks = await Promise.all(
        permissions.map((permission) =>
          hasPermission(userId, permission.modulo, permission.accion),
        ),
      );
      if (!checks.some(Boolean)) throw ApiError.forbidden('No tienes permiso para esta acción');
      next();
    } catch (error) {
      next(error);
    }
  };
};
