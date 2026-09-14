import { randomUUID } from 'node:crypto';

import { RefreshToken } from '../models/RefreshToken.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/jwt.js';
import { verifyPassword } from '../utils/password.js';

export interface UserPublic {
  id: number;
  nombre: string;
  email: string;
  role: string;
}

export interface LoginResult {
  user: UserPublic;
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
}

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

/**
 * Autentica las credenciales de un usuario y genera la sesión inicial.
 * Devuelve tokens y usuario público sin filtrar detalles de error sobre existencia del email.
 */
export const login = async (
  email: string,
  password: string,
  deviceInfo?: string,
): Promise<LoginResult> => {
  const normalizedEmail = email.toLowerCase().trim();

  const user = await User.findOne({
    where: {
      email: normalizedEmail,
      activo: true,
    },
    include: [Role],
  });

  if (!user || !user.role) {
    throw ApiError.unauthorized('Credenciales inválidas');
  }

  const isPasswordValid = await verifyPassword(password, user.passwordHash);
  if (!isPasswordValid) {
    throw ApiError.unauthorized('Credenciales inválidas');
  }

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role.nombre,
  });

  const jti = randomUUID();
  const refreshToken = signRefreshToken({
    sub: user.id,
    jti,
  });
  const csrfToken = randomUUID();

  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  await RefreshToken.create({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    expiresAt,
    deviceInfo: deviceInfo ? deviceInfo.slice(0, 255) : null,
  });

  return {
    user: {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      role: user.role.nombre,
    },
    accessToken,
    refreshToken,
    csrfToken,
  };
};

/**
 * Valida un Refresh Token, rota los tokens emitiendo uno nuevo y revoca el anterior.
 * Si detecta reuso de un token revocado, invalida todas las sesiones del usuario por seguridad.
 */
export const refresh = async (
  refreshTokenString: string,
  deviceInfo?: string,
): Promise<LoginResult> => {
  const payload = verifyRefreshToken(refreshTokenString);
  const tokenHash = hashToken(refreshTokenString);

  const tokenRecord = await RefreshToken.findOne({
    where: { tokenHash },
  });

  if (!tokenRecord) {
    throw ApiError.unauthorized('Token inválido', 'TOKEN_INVALID');
  }

  // Detección de reuso: si el token ya estaba revocado, posible ataque o robo de sesión
  if (tokenRecord.revokedAt !== null) {
    await RefreshToken.update(
      { revokedAt: new Date() },
      { where: { userId: payload.sub, revokedAt: null } },
    );
    throw ApiError.unauthorized(
      'Token ya revocado (posible reuso detectado)',
      'TOKEN_REUSED',
    );
  }

  // Validación de expiración
  if (tokenRecord.expiresAt < new Date()) {
    throw ApiError.unauthorized('Token expirado', 'TOKEN_EXPIRED');
  }

  // Revocar el token actual
  await tokenRecord.update({ revokedAt: new Date() });

  // Buscar usuario activo
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

  // Rotación: emitir nuevos tokens y csrf
  const newAccessToken = signAccessToken({
    sub: user.id,
    role: user.role.nombre,
  });
  const newJti = randomUUID();
  const newRefreshToken = signRefreshToken({
    sub: user.id,
    jti: newJti,
  });
  const newCsrfToken = randomUUID();

  const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  await RefreshToken.create({
    userId: user.id,
    tokenHash: hashToken(newRefreshToken),
    expiresAt: newExpiresAt,
    deviceInfo: deviceInfo ? deviceInfo.slice(0, 255) : null,
  });

  return {
    user: {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      role: user.role.nombre,
    },
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    csrfToken: newCsrfToken,
  };
};

/**
 * Cierra la sesión revocando el token de refresco provisto.
 * Es una operación idempotente.
 */
export const logout = async (refreshTokenString?: string): Promise<void> => {
  if (!refreshTokenString) {
    return;
  }
  const tokenHash = hashToken(refreshTokenString);
  const tokenRecord = await RefreshToken.findOne({
    where: { tokenHash },
  });

  if (tokenRecord && tokenRecord.revokedAt === null) {
    await tokenRecord.update({ revokedAt: new Date() });
  }
};

/**
 * Revoca todos los refresh tokens activos de un usuario (cerrar sesión en todos los dispositivos).
 */
export const logoutAll = async (userId: number): Promise<void> => {
  await RefreshToken.update(
    { revokedAt: new Date() },
    { where: { userId, revokedAt: null } },
  );
};

/**
 * Obtiene la información pública del usuario autenticado sin campos sensibles.
 */
export const getMe = async (userId: number): Promise<UserPublic> => {
  const user = await User.findOne({
    where: {
      id: userId,
      activo: true,
    },
    include: [Role],
  });

  if (!user || !user.role) {
    throw ApiError.unauthorized('Usuario no encontrado o inactivo');
  }

  return {
    id: user.id,
    nombre: user.nombre,
    email: user.email,
    role: user.role.nombre,
  };
};
