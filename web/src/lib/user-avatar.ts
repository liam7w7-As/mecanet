/**
 * Sistema de avatares Modernize.
 *
 * Mapea y persiste avatares predeterminados de la plantilla Modernize
 * ubicados en `/assets/images/users/`.
 */

export const MODERNIZE_AVATARS = [
  'user-1.jpg',
  'user-2.jpg',
  'user-3.jpg',
  'user-4.jpg',
  'user-5.jpg',
  'user-6.jpg',
  'user-7.jpg',
  'user-10.jpg',
] as const;

export type ModernizeAvatarName = (typeof MODERNIZE_AVATARS)[number];

const STORAGE_KEY = 'unithor_user_avatar_custom';

/**
 * Genera un hash determinista a partir de un string (correo, nombre o id).
 */
const hashString = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

/**
 * Obtiene el avatar guardado manualmente por el usuario actual en localStorage.
 */
export const getCustomAvatar = (userId?: number): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const key = userId ? `${STORAGE_KEY}_${userId}` : STORAGE_KEY;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/**
 * Guarda la preferencia de avatar del usuario actual.
 */
export const setCustomAvatar = (avatarName: string, userId?: number): void => {
  if (typeof window === 'undefined') return;
  try {
    const key = userId ? `${STORAGE_KEY}_${userId}` : STORAGE_KEY;
    localStorage.setItem(key, avatarName);
    // Disparar evento para que todos los componentes UserAvatar se actualicen en tiempo real
    window.dispatchEvent(new CustomEvent('unithor_avatar_changed', { detail: { userId, avatarName } }));
  } catch {
    // ignorar en navegadores privados sin acceso a localStorage
  }
};

/**
 * Resuelve la URL del avatar para cualquier usuario.
 * Prioridad:
 * 1. avatarUrl explícita (si el backend algún día tiene upload de foto).
 * 2. Avatar seleccionado por el usuario en localStorage.
 * 3. Avatar determinista de Modernize según su ID, email o nombre.
 */
export const getUserAvatarUrl = (user?: {
  id?: number;
  email?: string;
  nombre?: string;
  avatarUrl?: string;
  foto_url?: string;
} | null): string => {
  if (!user) {
    return `/assets/images/users/${MODERNIZE_AVATARS[0]}`;
  }

  // 1. Foto subida o URL externa
  const explicitPhoto = user.avatarUrl || user.foto_url;
  if (explicitPhoto) {
    return explicitPhoto;
  }

  // 2. Custom avatar en localStorage
  const custom = getCustomAvatar(user.id);
  if (custom && MODERNIZE_AVATARS.includes(custom as ModernizeAvatarName)) {
    return `/assets/images/users/${custom}`;
  }

  // 3. Mapeo determinista
  let seed = 0;
  if (user.id && !Number.isNaN(user.id)) {
    seed = Math.abs(user.id);
  } else if (user.email) {
    seed = hashString(user.email);
  } else if (user.nombre) {
    seed = hashString(user.nombre);
  }

  const avatarFile = MODERNIZE_AVATARS[seed % MODERNIZE_AVATARS.length];
  return `/assets/images/users/${avatarFile}`;
};
