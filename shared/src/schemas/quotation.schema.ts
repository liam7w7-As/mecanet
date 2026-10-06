import { z } from 'zod';

import { paginationSchema } from './pagination.schema.js';
import { createWorkOrderSchema } from './work-order.schema.js';
import { CATALOG_TYPES } from '../constants/catalog-types.js';
import { ITEM_OPERATIONAL_STATUS } from '../constants/item-operational-status.js';
import { QUOTATION_PAYMENT_METHODS } from '../constants/quotation-commercial.js';
import { QUOTATION_STATUS } from '../constants/quotation-status.js';
import { UNIT_MEASURES } from '../constants/unit-measures.js';
import { calculateQuotationPricing, DISCOUNT_TYPES } from '../utils/quotation-pricing.js';

const optionalText = (maxLength?: number) => {
  const schema = z.string().trim();
  return (maxLength ? schema.max(maxLength) : schema)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();
};

const nullablePositiveId = z.coerce.number().int().positive().nullable().optional();
const booleanQueryParam = z.union([
  z.boolean(),
  z.enum(['true', 'false']).transform((value) => value === 'true'),
]);

const discountFields = {
  descuentoTipo: z.enum(DISCOUNT_TYPES).nullable().optional(),
  descuentoValor: z.coerce.number().finite().min(0).max(9999999999.99).multipleOf(0.01).optional(),
};
const commercialFields = {
  ...discountFields,
  formaPago: z.enum(QUOTATION_PAYMENT_METHODS).optional(),
  disponibilidadTrabajo: optionalText(200),
  validezDias: z.coerce.number().int().min(1).max(365).optional(),
};

export const quotationItemInputSchema = z.object({
  ...discountFields,
  catalogItemId: z.coerce.number().int().positive().nullable().optional(),
  tipoLinea: z.enum(CATALOG_TYPES).default('estandar'),
  descripcion: z.string().trim().min(2, 'La descripción debe tener al menos 2 caracteres').max(255),
  cantidad: z.coerce.number().int().min(1, 'La cantidad debe ser un número entero mayor a 0').default(1),
  unidadMedida: z.enum(UNIT_MEASURES).default('unidad'),
  precioUnitario: z.coerce.number().min(0, 'El precio no puede ser negativo').default(0),
  estadoOperativo: z.enum(ITEM_OPERATIONAL_STATUS).default('pendiente'),
  notasOperativas: optionalText(1000),
}).superRefine((item, context) => {
  try { calculateQuotationPricing([item]); } catch (error) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['descuentoValor'], message: error instanceof Error ? error.message : 'Descuento inválido' });
  }
});

export const createQuotationSchema = z
  .object({
    ...commercialFields,
    workOrderId: nullablePositiveId,
    clientId: nullablePositiveId,
    vehicleId: nullablePositiveId,
    notas: optionalText(),
    items: z.array(quotationItemInputSchema).default([]),
  })
  .refine(
    (data) =>
      data.workOrderId != null ||
      data.clientId != null ||
      data.vehicleId != null,
    {
      message: 'Debe informar una orden de trabajo, cliente o vehículo',
    },
  ).superRefine((data, context) => {
    try { calculateQuotationPricing(data.items, data); } catch (error) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['descuentoValor'], message: error instanceof Error ? error.message : 'Descuento inválido' });
    }
  });

export const updateQuotationSchema = z
  .object({
    ...commercialFields,
    notas: optionalText(),
    items: z.array(quotationItemInputSchema).optional(),
    estadoPago: z.enum(QUOTATION_STATUS).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debe enviar al menos un campo para actualizar',
  });

export const quotationQuerySchema = paginationSchema
  .extend({
    search: z.string().trim().optional(),
    estadoPago: z.enum(QUOTATION_STATUS).optional(),
    clientId: z.coerce.number().int().positive().optional(),
    vehicleId: z.coerce.number().int().positive().optional(),
    workOrderId: z.coerce.number().int().positive().optional(),
    workOrderLinked: booleanQueryParam.optional(),
    archiveStatus: z.enum(['active', 'archived']).optional(),
    fechaDesde: z.string().date('fechaDesde debe ser una fecha YYYY-MM-DD válida').optional(),
    fechaHasta: z.string().date('fechaHasta debe ser una fecha YYYY-MM-DD válida').optional(),
  })
  .refine(
    (data) => !data.fechaDesde || !data.fechaHasta || data.fechaDesde <= data.fechaHasta,
    {
      message: 'fechaDesde no puede ser posterior a fechaHasta',
      path: ['fechaHasta'],
    },
  );

// Los importes e items se copian desde la COT, nunca desde el navegador.
export const convertQuotationToWorkOrderSchema = createWorkOrderSchema.omit({ items: true }).strict();

export type QuotationItemInput = z.infer<typeof quotationItemInputSchema>;
export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;
export type UpdateQuotationInput = z.infer<typeof updateQuotationSchema>;
export type QuotationQueryInput = z.infer<typeof quotationQuerySchema>;
export type ConvertQuotationInput = z.infer<typeof convertQuotationToWorkOrderSchema>;
