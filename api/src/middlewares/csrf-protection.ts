import { ApiError } from '../utils/ApiError.js';

import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXEMPT_PATHS = new Set(['/api/auth/login', '/api/auth/refresh']);

/**
 * Middleware de protección CSRF mediante el patrón Double-Submit Cookie.
 * Exenta métodos seguros (GET, HEAD, OPTIONS) y endpoints de inicio/refresco de sesión.
 * Para cualquier otra petición mutante (POST, PUT, PATCH, DELETE), exige que el header
 * 'X-CSRF-Token' coincida exactamente con la cookie 'csrf_token'.
 */
export const csrfProtection = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const cleanPath = (req.originalUrl || req.path).split('?')[0];
  if (EXEMPT_PATHS.has(cleanPath)) {
    return next();
  }

  const cookieToken = req.cookies?.csrf_token as string | undefined;
  const headerToken = req.headers['x-csrf-token'] as string | undefined;

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    throw ApiError.forbidden('CSRF token inválido', 'CSRF_INVALID');
  }

  next();
};
