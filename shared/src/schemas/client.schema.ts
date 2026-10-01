import { z } from 'zod';

import { paginationSchema } from './pagination.schema.js';
import { isValidRut, normalizeRut } from '../utils/rut.js';

const phoneRegex = /^\+?[\d\s().-]+$/;

const optionalString = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength, `Máximo ${maxLength} caracteres`)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

export const rutSchema = z
  .string()
  .trim()
  .refine((value) => value === '' || isValidRut(value), {
    message: 'Revisa el RUN/RUT completo y su dígito verificador (último número o K)',
  })
  .transform((value) => {
    const normalized = normalizeRut(value);
    return normalized === '' ? null : normalized;
  })
  .nullable()
  .optional();

export const chilePhoneSchema = z
  .string()
  .trim()
  .max(30, 'Máximo 30 caracteres')
  .refine(
    (value) => {
      if (value === '') {
        return true;
      }

      if (!phoneRegex.test(value)) {
        return false;
      }

      const digits = value.replace(/\D/g, '');
      const hasCountryCode = digits.length === 11 && digits.startsWith('56');
      if (value.startsWith('+') && !hasCountryCode) return false;
      const nationalNumber = hasCountryCode ? digits.slice(2) : digits;
      return /^[2-9]\d{8}$/.test(nationalNumber);
    },
    {
      message: 'Ingresa 9 dígitos, con o sin +56; incluye el código de área si es teléfono fijo',
    },
  )
  .transform((value) => {
    if (value === '') {
      return null;
    }

    const digits = value.replace(/\D/g, '');
    const nationalNumber =
      digits.length === 11 && digits.startsWith('56') ? digits.slice(2) : digits;
    return `+56${nationalNumber}`;
  })
  .nullable()
  .optional();

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(180, 'Máximo 180 caracteres')
  .transform((value) => (value === '' ? null : value))
  .pipe(z.string().email('Email inválido').nullable())
  .nullable()
  .optional();

export const createClientSchema = z.object({
  rut: rutSchema,
  nombre: z
    .string()
    .trim()
    .min(2, 'Ingresa un nombre de al menos 2 caracteres')
    .max(180, 'Máximo 180 caracteres'),
  tipo: z.enum(['cliente', 'empresa']),
  email: emailSchema,
  telefono: chilePhoneSchema,
  direccion: optionalString(255),
  region: optionalString(100),
  comuna: optionalString(100),
  notas: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional(),
});

export const updateClientSchema = createClientSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debe enviar al menos un campo para actualizar',
  });

export const clientQuerySchema = paginationSchema.extend({
  search: z.string().trim().optional(),
  tipo: z.enum(['cliente', 'empresa']).optional(),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type ClientQueryInput = z.infer<typeof clientQuerySchema>;
