import path from 'node:path';

import { z } from 'zod';

const optionalString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional(),
);

export const storageEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    UPLOAD_DIR: z.string().min(1).default('./storage/uploads'),
    S3_ENDPOINT: optionalString,
    S3_BUCKET: optionalString,
    S3_REGION: z.string().trim().min(1).default('auto'),
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,
    S3_PREFIX: z.string().default('unithor'),
  })
  .superRefine((data, context) => {
    if (data.STORAGE_DRIVER === 's3') {
      for (const field of [
        'S3_ENDPOINT',
        'S3_BUCKET',
        'S3_ACCESS_KEY_ID',
        'S3_SECRET_ACCESS_KEY',
      ] as const) {
        if (!data[field])
          context.addIssue({
            code: 'custom',
            path: [field],
            message: `${field} es requerida con STORAGE_DRIVER=s3`,
          });
      }
      if (data.S3_ENDPOINT) {
        try {
          const url = new URL(data.S3_ENDPOINT);
          if (
            url.protocol !== 'https:' ||
            url.username ||
            url.password ||
            url.search ||
            url.hash ||
            url.pathname !== '/'
          )
            throw new Error();
        } catch {
          context.addIssue({
            code: 'custom',
            path: ['S3_ENDPOINT'],
            message: 'Usa el endpoint HTTPS S3 sin bucket, ruta ni credenciales',
          });
        }
      }
    }
    if (data.S3_PREFIX && !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(data.S3_PREFIX)) {
      context.addIssue({
        code: 'custom',
        path: ['S3_PREFIX'],
        message: 'Prefijo de almacenamiento invalido',
      });
    }
    if (data.NODE_ENV === 'production' && data.STORAGE_DRIVER === 'local') {
      if (
        !path.isAbsolute(data.UPLOAD_DIR) ||
        /(?:^|[\\/])(?:hbuilds|public_html)(?:[\\/]|$)/i.test(data.UPLOAD_DIR)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['UPLOAD_DIR'],
          message:
            'En produccion usa STORAGE_DRIVER=s3 o una ruta absoluta persistente fuera de hbuilds/public_html',
        });
      }
    }
  });

export type StorageConfig = z.infer<typeof storageEnvSchema>;
