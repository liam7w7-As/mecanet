import { z } from 'zod';

import { paginationSchema } from './pagination.schema.js';
import { normalizeRut } from '../utils/rut.js';

const optionalString = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength, `Máximo ${maxLength} caracteres`)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

// No se valida el dígito verificador (módulo 11): exigirlo bloqueaba RUT/RUN
// reales y forzaba a los usuarios a no registrar clientes. Solo se exige el
// formato: números con dígito verificador o K, con o sin puntos y guion.
export const rutSchema = z
  .string()
  .trim()
  .refine(
    (value) => {
      if (value === '') {
        return true;
      }

      const normalized = normalizeRut(value);
      if (!/^\d{1,8}[\dK]$/.test(normalized)) {
        return false;
      }
      return Number(normalized.slice(0, -1)) > 0;
    },
    {
      message: 'Ingresa el RUN/RUT completo, con números y su último dígito o K (ej: 12.345.678-5)',
    },
  )
  .transform((value) => {
    const normalized = normalizeRut(value);
    return normalized === '' ? null : normalized;
  })
  .nullable()
  .optional();

// Se acepta cualquier formato de teléfono (celular, fijo, internacional,
// anexos): la validación estricta de 9 dígitos chilenos bloqueaba registros
// válidos y el dato solo se usa para contacto/impresión.
export const chilePhoneSchema = z
  .string()
  .trim()
  .max(30, 'Máximo 30 caracteres')
  .transform((value) => (value === '' ? null : value))
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
