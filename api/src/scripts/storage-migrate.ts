import { createHash } from 'node:crypto';

import { QueryTypes } from 'sequelize';

import { sequelize } from '../config/database.js';
import { env } from '../config/env.js';
import {
  createFileStorage,
  LocalFileStorage,
  StoredFileNotFoundError,
} from '../storage/file-storage.js';

interface FileReference {
  storageKey: string;
  mimeType: string | null;
  sha256: string | null;
}

const apply = process.argv.includes('--apply');
const audit = process.argv.includes('--audit');
const source = audit ? createFileStorage(env) : new LocalFileStorage(env.UPLOAD_DIR);
const target = createFileStorage(env);
const checksum = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const mimeFromKey = (key: string): string => {
  const extension = key.split('.').pop()?.toLowerCase();
  return (
    (
      {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
        pdf: 'application/pdf',
        svg: 'image/svg+xml',
      } as Record<string, string>
    )[extension ?? ''] ?? 'application/octet-stream'
  );
};

try {
  if (
    process.argv.slice(2).some((arg) => !['--apply', '--audit'].includes(arg)) ||
    (apply && audit)
  )
    throw new Error('Argumentos invalidos');
  if (!audit && env.STORAGE_DRIVER !== 's3')
    throw new Error('La migracion requiere STORAGE_DRIVER=s3');
  if (apply || audit) await target.check();
  const references = await sequelize.query<FileReference>(
    `
    SELECT storage_key AS storageKey, mime_type AS mimeType, sha256 FROM work_order_inspection_photos
    UNION ALL SELECT comprobante_pago AS storageKey, NULL AS mimeType, NULL AS sha256 FROM payments WHERE comprobante_pago IS NOT NULL
    UNION ALL SELECT logo_storage_key AS storageKey, logo_mime_type AS mimeType, NULL AS sha256 FROM company_settings WHERE logo_storage_key IS NOT NULL
  `,
    { type: QueryTypes.SELECT },
  );
  let verified = 0;
  let uploaded = 0;
  let missing = 0;
  let failed = 0;
  const seen = new Set<string>();
  for (const file of references) {
    if (seen.has(file.storageKey)) continue;
    seen.add(file.storageKey);
    try {
      const bytes = await source.read(file.storageKey);
      const sha256 = checksum(bytes);
      if (file.sha256 && file.sha256 !== sha256) throw new Error('Checksum original no coincide');
      if (apply) {
        let exists = false;
        try {
          const existing = await target.read(file.storageKey);
          if (checksum(existing) !== sha256) throw new Error('El destino tiene contenido distinto');
          exists = true;
        } catch (error) {
          if (!(error instanceof StoredFileNotFoundError)) throw error;
        }
        if (!exists) {
          await target.put(file.storageKey, bytes, file.mimeType ?? mimeFromKey(file.storageKey));
          if (checksum(await target.read(file.storageKey)) !== sha256)
            throw new Error('Verificacion de destino fallida');
          uploaded++;
        }
      }
      verified++;
    } catch (error) {
      if (error instanceof StoredFileNotFoundError) {
        missing++;
        console.warn(`No existe el archivo: ${file.storageKey}`);
      } else {
        failed++;
        console.error(`No se pudo verificar/copiar: ${file.storageKey}`);
      }
    }
  }
  console.info(
    JSON.stringify({
      mode: audit ? 'audit' : apply ? 'apply' : 'dry-run',
      verified,
      uploaded,
      missing,
      failed,
    }),
  );
  if (!apply && !audit)
    console.info(
      'Simulacion: no se escribio en S3. Usa --apply para copiar sin eliminar los originales.',
    );
  if (missing || failed) process.exitCode = 1;
} catch {
  console.error(
    'No se pudo completar la operacion. Revisa la configuracion S3, la conexion a MySQL y los argumentos.',
  );
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
