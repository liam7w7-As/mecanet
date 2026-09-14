import { z } from 'zod';

import { paginationSchema } from './pagination.schema.js';
import { QUOTATION_STATUS } from '../constants/quotation-status.js';

const optionalText = (maxLength?: number) => {
  const schema = z.string().trim();
  return (maxLength ? schema.max(maxLength) : schema)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();
};

const nullablePositiveId = z.coerce.number().int().positive().nullable().optional();

export const quotationItemInputSchema = z.object({
  catalogItemId: z.coerce.number().int().positive().nullable().optional(),
  descripcion: z.string().trim().min(2, 'La descripción debe tener al menos 2 caracteres').max(255),
  cantidad: z.coerce.number().positive('La cantidad debe ser mayor a 0').default(1),
  precioUnitario: z.coerce.number().min(0, 'El precio no puede ser negativo').default(0),
});

export const createQuotationSchema = z
  .object({
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
  );

export const updateQuotationSchema = z
  .object({
    notas: optionalText(),
    items: z.array(quotationItemInputSchema).optional(),
    estadoPago: z.enum(QUOTATION_STATUS).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debe enviar al menos un campo para actualizar',
  });

export const quotationQuerySchema = paginationSchema.extend({
  search: z.string().trim().optional(),
  estadoPago: z.enum(QUOTATION_STATUS).optional(),
  clientId: z.coerce.number().int().positive().optional(),
  vehicleId: z.coerce.number().int().positive().optional(),
  workOrderId: z.coerce.number().int().positive().optional(),
});

export const convertQuotationToWorkOrderSchema = z.object({
  kilometrajeIngreso: z.coerce.number().int().min(0).nullable().optional(),
  fechaIngreso: z
    .string()
    .datetime({ message: 'fechaIngreso debe ser una fecha ISO 8601 válida' })
    .nullable()
    .optional(),
  fechaEntrega: z
    .string()
    .datetime({ message: 'fechaEntrega debe ser una fecha ISO 8601 válida' })
    .nullable()
    .optional(),
  descripcion: optionalText(),
});

export type QuotationItemInput = z.infer<typeof quotationItemInputSchema>;
export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;
export type UpdateQuotationInput = z.infer<typeof updateQuotationSchema>;
export type QuotationQueryInput = z.infer<typeof quotationQuerySchema>;
export type ConvertQuotationInput = z.infer<typeof convertQuotationToWorkOrderSchema>;
