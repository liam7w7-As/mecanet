import { z } from 'zod';

import { paginationSchema } from './pagination.schema.js';

// Expresión regular básica para RUT chileno (ej: 12345678-9, 12.345.678-K, 12345678K)
const rutRegex = /^\d{1,2}(\.?\d{3}){2}-?[\dkK]$|^(\d{7,8})-?[\dkK]$/i;

export const createClientSchema = z.object({
  rut: z
    .string()
    .trim()
    .refine((val) => val === '' || rutRegex.test(val), {
      message: 'Formato de RUT chileno inválido (ej: 12345678-9)',
    })
    .nullable()
    .optional(),
  nombre: z.string().trim().min(1, 'El nombre es requerido').max(180),
  tipo: z.enum(['cliente', 'empresa']).default('cliente'),
  email: z.string().trim().email('Email inválido').max(180).or(z.literal('')).nullable().optional(),
  telefono: z.string().trim().max(30).nullable().optional(),
  direccion: z.string().trim().max(255).nullable().optional(),
  region: z.string().trim().max(100).nullable().optional(),
  comuna: z.string().trim().max(100).nullable().optional(),
  notas: z.string().trim().nullable().optional(),
});

export const updateClientSchema = createClientSchema.partial();

export const clientQuerySchema = paginationSchema.extend({
  search: z.string().trim().optional(),
  tipo: z.enum(['cliente', 'empresa']).optional(),
});
