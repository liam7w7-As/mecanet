import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken } from '../utils/jwt.js';

import type { NextFunction, Request, Response } from 'express';

/**
 * Middleware de Autenticación.
 *
 * IMPORTANTE: Este middleware ÚNICAMENTE valida la identidad del usuario a partir
 * de la cookie 'access_token' y adjunta sus datos a 'req.user'. NO valida permisos
 * ni autorización sobre módulos o acciones específicas (para ello usar 'authorize').
 */
export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const token = req.cookies?.access_token as string | undefined;

    if (!token) {
      throw ApiError.unauthorized('No autenticado');
    }

    const payload = verifyAccessToken(token);

    const user = await User.findOne({
      where: {
        id: payload.sub,
        activo: true,
      },
      include: [Role],
    });

    if (!user || !user.role) {
      throw ApiError.unauthorized('Usuario inactivo o no encontrado');
    }

    req.user = {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      role: user.role.nombre,
    };

    next();
  } catch (error) {
    next(error);
  }
};
