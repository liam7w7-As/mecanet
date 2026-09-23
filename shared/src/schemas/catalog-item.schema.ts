import { z } from 'zod';

import { paginationSchema } from './pagination.schema.js';
import { CATALOG_TYPES } from '../constants/catalog-types.js';

const optionalCodeSchema = z
  .string()
  .trim()
  .max(50, 'El código no puede exceder 50 caracteres')
  .transform((value) => (value === '' ? null : value.toUpperCase()))
  .nullable()
  .optional();

const optionalDescriptionSchema = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional();

const catalogItemFields = {
  tipo: z.enum(CATALOG_TYPES),
  codigo: optionalCodeSchema,
  nombre: z
    .string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(180),
  descripcion: optionalDescriptionSchema,
  precio: z.coerce.number().min(0, 'El precio no puede ser negativo').default(0),
  stock: z.coerce.number().int().min(0, 'El stock no puede ser negativo').default(0),
  stockMinimo: z.coerce.number().int().min(0, 'El stock mínimo no puede ser negativo').default(0),
};

export const createCatalogItemSchema = z.object(catalogItemFields).transform((data) => ({
  ...data,
  stock: data.tipo === 'parte' ? data.stock : 0,
}));

export const updateCatalogItemSchema = z
  .object({
    tipo: catalogItemFields.tipo.optional(),
    codigo: catalogItemFields.codigo,
    nombre: catalogItemFields.nombre.optional(),
    descripcion: catalogItemFields.descripcion,
    precio: z.coerce.number().min(0, 'El precio no puede ser negativo').optional(),
    stock: z.coerce.number().int().min(0, 'El stock no puede ser negativo').optional(),
    stockMinimo: z.coerce.number().int().min(0, 'El stock mínimo no puede ser negativo').optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debe enviar al menos un campo para actualizar',
  });

export const updateStockSchema = z.object({
  delta: z.coerce.number().int('El ajuste de stock debe ser un número entero'),
  motivo: z
    .string()
    .trim()
    .min(2, 'El motivo debe tener al menos 2 caracteres')
    .max(100, 'El motivo no puede exceder 100 caracteres')
    .optional(),
});

export const catalogItemQuerySchema = paginationSchema.extend({
  search: z.string().trim().optional(),
  tipo: z.enum(CATALOG_TYPES).optional(),
  soloConStock: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export type CreateCatalogItemInput = z.infer<typeof createCatalogItemSchema>;
export type UpdateCatalogItemInput = z.infer<typeof updateCatalogItemSchema>;
export type UpdateStockInput = z.infer<typeof updateStockSchema>;
export type CatalogItemQueryInput = z.infer<typeof catalogItemQuerySchema>;
