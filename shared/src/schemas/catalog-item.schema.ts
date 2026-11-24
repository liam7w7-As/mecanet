import { z } from 'zod';

import { paginationSchema } from './pagination.schema.js';
import {
  CATALOG_DIVISIONS,
  CATALOG_SUBTYPES,
  CATALOG_TYPES,
  CATALOG_DIVISION_SUBTYPES,
  resolveCatalogClassification,
  type CatalogClassification,
} from '../constants/catalog-types.js';
import { UNIT_MEASURES } from '../constants/unit-measures.js';

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

const optionalHoursSchema = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? null : value),
  z.coerce
    .number()
    .min(0, 'Las horas hombre no pueden ser negativas')
    .max(999.99, 'Las horas hombre no pueden superar 999,99')
    .nullable(),
);

const validateClassification = (
  data: Partial<CatalogClassification>,
  ctx: z.RefinementCtx,
): void => {
  if (data.division && data.subtipo &&
    !(CATALOG_DIVISION_SUBTYPES[data.division] as readonly string[]).includes(data.subtipo)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['subtipo'],
      message: 'El subtipo no corresponde a la división seleccionada' });
  }
  if (data.tipo && (data.division || data.subtipo) &&
    resolveCatalogClassification(data).tipo !== data.tipo) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tipo'],
      message: 'El tipo no corresponde a la división y subtipo seleccionados' });
  }
};

const catalogItemFields = {
  tipo: z.enum(CATALOG_TYPES).optional(),
  division: z.enum(CATALOG_DIVISIONS).optional(),
  subtipo: z.enum(CATALOG_SUBTYPES).optional(),
  codigo: optionalCodeSchema,
  nombre: z
    .string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(180),
  descripcion: optionalDescriptionSchema,
  unidadMedida: z.enum(UNIT_MEASURES).default('unidad'),
  precio: z.coerce.number().min(0, 'El precio no puede ser negativo').default(0),
  stock: z.coerce.number().int().min(0, 'El stock no puede ser negativo').default(0),
  stockMinimo: z.coerce.number().int().min(0, 'El stock mínimo no puede ser negativo').default(0),
  horasHombreEstandar: optionalHoursSchema.optional(),
};

export const createCatalogItemSchema = z
  .object(catalogItemFields)
  .strict()
  .superRefine(validateClassification)
  .transform((data) => {
    const resolved = resolveCatalogClassification(data);
    return {
      ...data,
      division: resolved.division,
      subtipo: resolved.subtipo,
      tipo: resolved.tipo,
      stock: resolved.division === 'ACC' && resolved.subtipo === 'en_stock' ? data.stock : 0,
    };
  });

export const updateCatalogItemSchema = z
  .object({
    tipo: catalogItemFields.tipo,
    division: catalogItemFields.division,
    subtipo: catalogItemFields.subtipo,
    codigo: catalogItemFields.codigo,
    nombre: catalogItemFields.nombre.optional(),
    descripcion: catalogItemFields.descripcion,
    unidadMedida: catalogItemFields.unidadMedida.optional(),
    precio: z.coerce.number().min(0, 'El precio no puede ser negativo').optional(),
    stock: z.coerce.number().int().min(0, 'El stock no puede ser negativo').optional(),
    stockMinimo: z.coerce.number().int().min(0, 'El stock mínimo no puede ser negativo').optional(),
    horasHombreEstandar: optionalHoursSchema.optional(),
  })
  .strict()
  .superRefine(validateClassification)
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
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
  division: z.enum(CATALOG_DIVISIONS).optional(),
  subtipo: z.enum(CATALOG_SUBTYPES).optional(),
  soloConStock: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export type CreateCatalogItemInput = z.infer<typeof createCatalogItemSchema>;
export type UpdateCatalogItemInput = z.infer<typeof updateCatalogItemSchema>;
export type UpdateStockInput = z.infer<typeof updateStockSchema>;
export type CatalogItemQueryInput = z.infer<typeof catalogItemQuerySchema>;
