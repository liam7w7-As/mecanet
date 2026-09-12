import { z } from 'zod';

import { paginationSchema } from './pagination.schema.js';

export const createVehicleSchema = z.object({
  patente: z
    .string()
    .trim()
    .min(1, 'La patente es requerida')
    .max(15)
    .transform((val) => val.toUpperCase()),
  marca: z.string().trim().max(80).nullable().optional(),
  modelo: z.string().trim().max(80).nullable().optional(),
  ano: z.coerce
    .number()
    .int()
    .min(1900, 'Año inválido')
    .max(new Date().getFullYear() + 2, 'Año futuro inválido')
    .nullable()
    .optional(),
  color: z.string().trim().max(40).nullable().optional(),
  vin_chasis: z.string().trim().max(50).nullable().optional(),
  motor: z.string().trim().max(50).nullable().optional(),
  kilometraje: z.coerce.number().int().min(0).nullable().optional(),
  combustible: z.string().trim().max(30).nullable().optional(),
  transmision: z.string().trim().max(30).nullable().optional(),
  client_id: z.coerce.number().int().positive().nullable().optional(),
});

export const updateVehicleSchema = createVehicleSchema.partial();

export const vehicleQuerySchema = paginationSchema.extend({
  search: z.string().trim().optional(),
  client_id: z.coerce.number().int().positive().optional(),
});
