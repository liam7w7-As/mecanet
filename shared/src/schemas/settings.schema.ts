import { z } from 'zod';

import { chilePhoneSchema, rutSchema } from './client.schema.js';

const optionalText = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength, `No puede superar ${maxLength} caracteres`)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

const optionalEmail = z
  .string()
  .trim()
  .max(120)
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional()
  .refine((value) => value === null || value === undefined || z.string().email().safeParse(value).success, {
    message: 'Correo electrónico inválido',
  });

const optionalWebsite = z
  .string()
  .trim()
  .max(200)
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional()
  .refine(
    (value) =>
      value === null ||
      value === undefined ||
      /^(https?:\/\/)?[\w-]+(\.[\w-]+)+([/?#].*)?$/i.test(value),
    { message: 'Sitio web inválido (ej: unithor.cl)' },
  );

export const companySettingsFields = {
  razonSocial: z
    .string()
    .trim()
    .min(2, 'La razón social debe tener al menos 2 caracteres')
    .max(180, 'La razón social no puede superar 180 caracteres'),
  nombreComercial: optionalText(120),
  rut: rutSchema,
  giro: optionalText(255),
  direccion: optionalText(255),
  region: optionalText(100),
  comuna: optionalText(100),
  telefono: chilePhoneSchema,
  email: optionalEmail,
  sitioWeb: optionalWebsite,
};

export const companySettingsSchema = z.object(companySettingsFields);

export const updateCompanySettingsSchema = z
  .object(companySettingsFields)
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debe enviar al menos un campo para actualizar',
  });

/** Subtipo de branding expuesto sin sesión: solo lo que ya va impreso en el PDF. */
export const publicBrandingSchema = z.object({
  razonSocial: z.string(),
  nombreComercial: z.string().nullable(),
  rut: z.string().nullable(),
  direccion: z.string().nullable(),
  region: z.string().nullable(),
  comuna: z.string().nullable(),
  telefono: z.string().nullable(),
  email: z.string().nullable(),
  sitioWeb: z.string().nullable(),
  /** true cuando hay un logo propio subido; el cliente lo pide a /settings/company/logo. */
  tieneLogo: z.boolean(),
  logoUrl: z.string().nullable(),
  /** Sirve de cache-buster para el <img src> del logo. */
  logoUpdatedAt: z.string().datetime().nullable(),
});

export const companyLogoPublicSchema = z.object({
  tieneLogo: z.boolean(),
  logoUrl: z.string().nullable(),
  mimeType: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  updatedAt: z.string().datetime().nullable(),
});

export type CompanySettings = z.infer<typeof companySettingsSchema>;
export type UpdateCompanySettingsInput = z.infer<typeof updateCompanySettingsSchema>;
export type PublicBranding = z.infer<typeof publicBrandingSchema>;
export type CompanyLogoPublic = z.infer<typeof companyLogoPublicSchema>;
