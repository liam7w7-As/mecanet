import { env } from '../config/env.js';

import type { CookieOptions, Response } from 'express';

const isProd = env.NODE_ENV === 'production';

/**
 * Opciones base para cookies de autenticación:
 * - sameSite: 'strict' en producción para máxima protección contra CSRF;
 *             'lax' en desarrollo para permitir peticiones cross-origin entre puertos localhost.
 * - secure: true en producción (exige HTTPS); false en desarrollo para HTTP plano.
 * - domain: configurable vía COOKIE_DOMAIN si se despliega en subdominios (e.g. api.unithor.com).
 */
const getBaseCookieOptions = (): CookieOptions => ({
  sameSite: isProd ? 'strict' : 'lax',
  secure: isProd,
  domain: env.COOKIE_DOMAIN || undefined,
});

/**
 * Configuración de cookie para el Access Token efímero:
 * - httpOnly: true (no accesible desde JavaScript del navegador).
 * - path: '/' (disponible en todas las rutas de la API).
 * - maxAge: 15 minutos (900,000 ms).
 */
const getAccessTokenCookieOptions = (): CookieOptions => ({
  ...getBaseCookieOptions(),
  httpOnly: true,
  path: '/',
  maxAge: 15 * 60 * 1000,
});

/**
 * Configuración de cookie para el Refresh Token de larga duración:
 * - httpOnly: true (protegido contra filtración XSS).
 * - path: '/api/auth' (solo se envía en endpoints de autenticación, reduciendo exposición).
 * - maxAge: 7 días (604,800,000 ms).
 */
const getRefreshTokenCookieOptions = (): CookieOptions => ({
  ...getBaseCookieOptions(),
  httpOnly: true,
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

/**
 * Configuración de cookie para el CSRF Token:
 * - httpOnly: false (requerido por el patrón double-submit para que el cliente JS lea el valor).
 * - path: '/' (accesible globalmente por el frontend para enviarlo en header X-CSRF-Token).
 * - maxAge: 7 días (604,800,000 ms).
 */
const getCsrfCookieOptions = (): CookieOptions => ({
  ...getBaseCookieOptions(),
  httpOnly: false,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

/**
 * Establece la cookie de CSRF token.
 */
export const setCsrfCookie = (res: Response, csrfToken: string): void => {
  res.cookie('csrf_token', csrfToken, getCsrfCookieOptions());
};

/**
 * Establece todas las cookies de autenticación tras login o rotación exitosa de refresh.
 */
export const setAuthCookies = (
  res: Response,
  accessToken: string,
  refreshToken: string,
  csrfToken: string,
): void => {
  res.cookie('access_token', accessToken, getAccessTokenCookieOptions());
  res.cookie('refresh_token', refreshToken, getRefreshTokenCookieOptions());
  setCsrfCookie(res, csrfToken);
};

/**
 * Elimina todas las cookies de sesión y autenticación con sus rutas correspondientes.
 */
export const clearAuthCookies = (res: Response): void => {
  const base = getBaseCookieOptions();
  res.clearCookie('access_token', { ...base, path: '/' });
  res.clearCookie('refresh_token', { ...base, path: '/api/auth' });
  res.clearCookie('csrf_token', { ...base, path: '/' });
};
