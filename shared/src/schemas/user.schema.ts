import { z } from 'zod';

import { paginationSchema } from './pagination.schema.js';

export const createUserSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(120),
  email: z.string().email('Email inválido').toLowerCase().trim(),
  password: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .max(100, 'La contraseña no puede exceder 100 caracteres'),
  roleId: z.coerce.number().int().positive('ID de rol inválido'),
});

export const updateUserSchema = z
  .object({
    nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(120).optional(),
    email: z.string().email('Email inválido').toLowerCase().trim().optional(),
    roleId: z.coerce.number().int().positive('ID de rol inválido').optional(),
    activo: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debe enviar al menos un campo para actualizar',
  });

export const userQuerySchema = paginationSchema.extend({
  search: z.string().trim().optional(),
  roleId: z.coerce.number().int().positive('ID de rol inválido').optional(),
  activo: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export const changePasswordSchema = z.object({
  passwordActual: z.string().min(8).max(100).optional(),
  passwordNueva: z
    .string()
    .min(8, 'La contraseña nueva debe tener al menos 8 caracteres')
    .max(100, 'La contraseña nueva no puede exceder 100 caracteres'),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UserQueryInput = z.infer<typeof userQuerySchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
