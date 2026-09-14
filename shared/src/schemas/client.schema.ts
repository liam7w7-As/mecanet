import { z } from 'zod';

import { paginationSchema } from './pagination.schema.js';

// Expresión regular básica para RUT chileno (ej: 12345678-9, 12.345.678-K, 12345678K)
const rutRegex = /^\d{1,2}(\.?\d{3}){2}-?[\dkK]$|^(\d{7,8})-?[\dkK]$/i;

const optionalString = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

const rutSchema = z
  .string()
  .trim()
  .refine((value) => value === '' || rutRegex.test(value), {
    message: 'Formato de RUT chileno inválido (ej: 12345678-9)',
  })
  .transform((value) => {
    const normalized = value.replace(/[.-]/g, '').toUpperCase();
    return normalized === '' ? null : normalized;
  })
  .nullable()
  .optional();

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(180)
  .transform((value) => (value === '' ? null : value))
  .pipe(z.string().email('Email inválido').nullable())
  .nullable()
  .optional();

export const createClientSchema = z.object({
  rut: rutSchema,
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(180),
  tipo: z.enum(['cliente', 'empresa']),
  email: emailSchema,
  telefono: optionalString(30),
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

export const updateClientSchema = createClientSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  {
    message: 'Debe enviar al menos un campo para actualizar',
  },
);

export const clientQuerySchema = paginationSchema.extend({
  search: z.string().trim().optional(),
  tipo: z.enum(['cliente', 'empresa']).optional(),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type ClientQueryInput = z.infer<typeof clientQuerySchema>;
