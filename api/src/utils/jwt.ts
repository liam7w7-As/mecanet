import { createHash } from 'node:crypto';

import jwt, { type SignOptions } from 'jsonwebtoken';

import { ApiError } from './ApiError.js';
import { env } from '../config/env.js';

export interface AccessPayload {
  sub: number;
  role: string;
}

export interface RefreshPayload {
  sub: number;
  jti: string;
}

/**
 * Firma un Access Token JWT con expiración corta (default: 15m)
 */
export const signAccessToken = (
  payload: AccessPayload,
  options?: SignOptions,
): string => {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: (options?.expiresIn ??
      env.JWT_ACCESS_EXPIRES) as SignOptions['expiresIn'],
    ...options,
  });
};

/**
 * Firma un Refresh Token JWT con expiración larga (default: 7d)
 */
export const signRefreshToken = (
  payload: RefreshPayload,
  options?: SignOptions,
): string => {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: (options?.expiresIn ??
      env.JWT_REFRESH_EXPIRES) as SignOptions['expiresIn'],
    ...options,
  });
};

/**
 * Verifica un Access Token JWT.
 * Lanza ApiError 401 con código TOKEN_EXPIRED si expiró o TOKEN_INVALID si es inválido.
 */
export const verifyAccessToken = (token: string): AccessPayload => {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    if (typeof decoded !== 'object' || decoded === null || !('sub' in decoded)) {
      throw ApiError.unauthorized('Token inválido', 'TOKEN_INVALID');
    }
    return decoded as unknown as AccessPayload;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized('Token expirado', 'TOKEN_EXPIRED');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw ApiError.unauthorized('Token inválido', 'TOKEN_INVALID');
    }
    throw ApiError.unauthorized('Error al verificar token', 'TOKEN_INVALID');
  }
};

/**
 * Verifica un Refresh Token JWT.
 * Lanza ApiError 401 con código TOKEN_EXPIRED si expiró o TOKEN_INVALID si es inválido.
 */
export const verifyRefreshToken = (token: string): RefreshPayload => {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);
    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      !('sub' in decoded) ||
      !('jti' in decoded)
    ) {
      throw ApiError.unauthorized('Token inválido', 'TOKEN_INVALID');
    }
    return decoded as unknown as RefreshPayload;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized('Token expirado', 'TOKEN_EXPIRED');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw ApiError.unauthorized('Token inválido', 'TOKEN_INVALID');
    }
    throw ApiError.unauthorized('Error al verificar token', 'TOKEN_INVALID');
  }
};

/**
 * Genera un hash SHA-256 en formato hexadecimal para el token provisto.
 * Los tokens nunca deben persistirse en claro en base de datos.
 */
export const hashToken = (token: string): string => {
  return createHash('sha256').update(token).digest('hex');
};
