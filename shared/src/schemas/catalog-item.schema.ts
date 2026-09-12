import { z } from 'zod';

import { paginationSchema } from './pagination.schema.js';
import { CATALOG_TYPES } from '../constants/catalog-types.js';

export const createCatalogItemSchema = z.object({
  tipo: z.enum(CATALOG_TYPES),
  codigo: z.string().trim().max(50).nullable().optional(),
  nombre: z.string().trim().min(1, 'El nombre es requerido').max(180),
  descripcion: z.string().trim().nullable().optional(),
  precio: z.coerce.number().min(0, 'El precio no puede ser negativo').default(0),
  stock: z.coerce.number().int().min(0, 'El stock no puede ser negativo').default(0),
});

export const updateCatalogItemSchema = createCatalogItemSchema.partial();

export const catalogItemQuerySchema = paginationSchema.extend({
  search: z.string().trim().optional(),
  tipo: z.enum(CATALOG_TYPES).optional(),
});
