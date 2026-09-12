import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

/**
 * Genera un hash seguro para la contraseña provista usando bcrypt con 10 rondas de salteo.
 */
export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

/**
 * Compara una contraseña en texto plano contra su hash bcrypt almacenado.
 */
export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};
