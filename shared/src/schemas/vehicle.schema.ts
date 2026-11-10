import { z } from 'zod';

import { paginationSchema } from './pagination.schema.js';

const currentYear = new Date().getFullYear();

const optionalString = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

export const normalizeChilePatente = (value: string): string =>
  value.replace(/[\s-]/g, '').toUpperCase();

export const isValidChilePatente = (value: string): boolean =>
  /^[A-Z]{2}(?:\d{4}|[A-Z]{2}\d{2})$/.test(normalizeChilePatente(value));

export const chilePatenteSchema = z
  .string()
  .trim()
  .min(1, 'La patente es requerida')
  .max(8, 'La patente chilena debe tener 6 caracteres')
  .refine(isValidChilePatente, {
    message: 'Patente chilena inválida (ej: AB1234 o ABCD12)',
  })
  .transform(normalizeChilePatente);

const vinChasisSchema = z
  .string()
  .trim()
  .max(50)
  .transform((value) => {
    const normalized = value.toUpperCase();
    return normalized === '' ? null : normalized;
  })
  .nullable()
  .optional();

const baseVehicleSchema = z.object({
  patente: z
    .string()
    .trim()
    .min(1, 'La patente es requerida')
    .max(15, 'La patente no puede tener más de 15 caracteres'),
  esExtranjera: z.boolean().optional(),
  marca: optionalString(80),
  modelo: optionalString(80),
  ano: z.coerce
    .number()
    .int()
    .min(1950, 'Año inválido')
    .max(currentYear + 1, 'Año futuro inválido')
    .nullable()
    .optional(),
  color: optionalString(40),
  vinChasis: vinChasisSchema,
  motor: optionalString(50),
  kilometraje: z.coerce.number().int().min(0).nullable().optional(),
  combustible: optionalString(30),
  transmision: optionalString(30),
  clientId: z.coerce.number().int().positive().nullable().optional(),
});

export const createVehicleSchema = baseVehicleSchema
  .superRefine((data, ctx) => {
    const trimmed = data.patente.trim().toUpperCase();
    if (data.esExtranjera) {
      if (trimmed.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['patente'],
          message: 'La patente es requerida',
        });
      }
    } else {
      if (!isValidChilePatente(trimmed)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['patente'],
          message: 'Patente chilena inválida (ej: AB1234 o ABCD12). Si es de otro país, marque patente extranjera.',
        });
      }
    }
  })
  .transform((data) => ({
    ...data,
    patente: data.esExtranjera
      ? data.patente.trim().toUpperCase()
      : normalizeChilePatente(data.patente),
  }));

export const updateVehicleSchema = baseVehicleSchema
  .partial()
  .superRefine((data, ctx) => {
    if (data.patente !== undefined) {
      const trimmed = data.patente.trim().toUpperCase();
      if (data.esExtranjera) {
        if (trimmed.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['patente'],
            message: 'La patente es requerida',
          });
        }
      } else {
        if (!isValidChilePatente(trimmed)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['patente'],
            message: 'Patente chilena inválida (ej: AB1234 o ABCD12). Si es de otro país, marque patente extranjera.',
          });
        }
      }
    }
  })
  .transform((data) => ({
    ...data,
    ...(data.patente !== undefined
      ? {
          patente: data.esExtranjera
            ? data.patente.trim().toUpperCase()
            : normalizeChilePatente(data.patente),
        }
      : {}),
  }))
  .refine(
    (data) => Object.keys(data).length > 0,
    {
      message: 'Debe enviar al menos un campo para actualizar',
    },
  );

export const vehicleQuerySchema = paginationSchema.extend({
  search: z.string().trim().optional(),
  clientId: z.coerce.number().int().positive().optional(),
});

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
export type VehicleQueryInput = z.infer<typeof vehicleQuerySchema>;
