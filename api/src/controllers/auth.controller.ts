import * as authService from '../services/auth.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { clearAuthCookies, setAuthCookies } from '../utils/cookies.js';

import type { LoginInput } from '@unithor/shared';
import type { Request, Response } from 'express';

const extractDeviceInfo = (req: Request): string | undefined => {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua.slice(0, 255) : undefined;
};

/**
 * POST /api/auth/login
 * Autentica al usuario con username o email y emite cookies de sesión y CSRF.
 */
export const loginController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { identifier, password } = req.body as LoginInput;
    const deviceInfo = extractDeviceInfo(req);

    const { user, accessToken, refreshToken, csrfToken } =
      await authService.login(identifier, password, deviceInfo);

    setAuthCookies(res, accessToken, refreshToken, csrfToken);

    res.status(200).json({ user });
  },
);

/**
 * POST /api/auth/refresh
 * Rota el token de refresco e invalida el anterior, emitiendo nuevas cookies.
 */
export const refreshController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const refreshToken = req.cookies?.refresh_token as string | undefined;

    if (!refreshToken) {
      throw ApiError.unauthorized(
        'Token de refresco no provisto en cookies',
        'TOKEN_MISSING',
      );
    }

    const deviceInfo = extractDeviceInfo(req);
    const { user, accessToken, refreshToken: newRefresh, csrfToken } =
      await authService.refresh(refreshToken, deviceInfo);

    setAuthCookies(res, accessToken, newRefresh, csrfToken);

    res.status(200).json({ user });
  },
);

/**
 * POST /api/auth/logout
 * Revoca el token de refresco actual y limpia todas las cookies de autenticación.
 */
export const logoutController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const refreshToken = req.cookies?.refresh_token as string | undefined;

    await authService.logout(refreshToken);
    clearAuthCookies(res);

    res.status(204).send();
  },
);

/**
 * POST /api/auth/logout-all
 * Revoca todas las sesiones activas del usuario autenticado y limpia las cookies locales.
 */
export const logoutAllController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw ApiError.unauthorized('No autenticado');
    }

    await authService.logoutAll(req.user.id);
    clearAuthCookies(res);

    res.status(204).send();
  },
);

/**
 * GET /api/auth/me
 * Retorna los datos públicos del usuario autenticado actual.
 */
export const meController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw ApiError.unauthorized('No autenticado');
    }

    const user = await authService.getMe(req.user.id);

    res.status(200).json({ user });
  },
);
