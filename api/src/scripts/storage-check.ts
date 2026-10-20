import { randomUUID } from 'node:crypto';

import { env } from '../config/env.js';
import { createFileStorage } from '../storage/file-storage.js';

const storage = createFileStorage(env);
const key = `_checks/${randomUUID()}.txt`;
const bytes = Buffer.from('UNITHOR private storage check');

try {
  await storage.check();
  await storage.put(key, bytes, 'text/plain');
  if (!(await storage.read(key)).equals(bytes)) throw new Error('Content mismatch');
  console.info(`Almacenamiento ${env.STORAGE_DRIVER}: conexion, escritura y lectura verificadas.`);
} catch {
  console.error(
    'No se pudo verificar el almacenamiento. Revisa endpoint, bucket y permisos de la clave.',
  );
  process.exitCode = 1;
} finally {
  try {
    await storage.remove(key, false);
  } catch {
    console.error('No se pudo borrar el archivo temporal de verificacion.');
    process.exitCode = 1;
  }
}
