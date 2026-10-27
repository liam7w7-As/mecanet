import { z } from 'zod';

const booleanEnv = (fallback: boolean) =>
  z.preprocess(
    (value) =>
      value === undefined ? fallback : value === 'true' ? true : value === 'false' ? false : value,
    z.boolean(),
  );

const optionalEmail = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().trim().email().optional(),
);
const optionalPassword = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

export const mailEnvSchema = z
  .object({
    MAIL_ENABLED: booleanEnv(false),
    SMTP_HOST: z.string().min(1).default('smtp.gmail.com'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
    SMTP_SECURE: booleanEnv(true),
    SMTP_USER: optionalEmail,
    SMTP_PASS: optionalPassword,
    MAIL_FROM_NAME: z.string().trim().min(1).max(120).default('UNITHOR Servicios Integrales'),
    MAIL_FROM_ADDRESS: optionalEmail,
    MAIL_REPLY_TO: optionalEmail,
  })
  .superRefine((data, context) => {
    if (!data.MAIL_ENABLED) return;
    for (const key of ['SMTP_USER', 'SMTP_PASS'] as const) {
      if (!data[key])
        context.addIssue({
          code: 'custom',
          path: [key],
          message: 'Es requerida al activar MAIL_ENABLED',
        });
    }
  });
