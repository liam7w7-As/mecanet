import { z } from 'zod';
import { chilePhoneSchema, rutSchema } from './client.schema.js';
import { paginationSchema } from './pagination.schema.js';
const optionalString = (maxLength) => z
    .string()
    .trim()
    .max(maxLength, `Máximo ${maxLength} caracteres`)
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
export const supplierQuerySchema = paginationSchema.extend({
    search: z.string().trim().max(180).optional(),
    soloIncompletos: z
        .enum(['true', 'false', '1', '0'])
        .transform((value) => value === 'true' || value === '1')
        .optional(),
});
export const updateSupplierSchema = z
    .object({
    nombre: z.string().trim().min(2, 'Ingresa un nombre de al menos 2 caracteres').max(180).optional(),
    rut: rutSchema,
    telefono: chilePhoneSchema,
    email: emailSchema,
    direccion: optionalString(255),
    contactoNombre: optionalString(180),
    notas: optionalString(1000),
})
    .refine((data) => Object.keys(data).length > 0, {
    message: 'Debe enviar al menos un campo para actualizar',
});
