import { z } from 'zod';

import { paginationSchema } from './pagination.schema.js';
import { WORK_ORDER_STATUS } from '../constants/work-order-status.js';

const optionalText = (maxLength?: number) => {
  const schema = z.string().trim();
  return (maxLength ? schema.max(maxLength) : schema)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();
};

const nullablePositiveId = z.coerce.number().int().positive().nullable().optional();

export const workOrderItemInputSchema = z.object({
  catalogItemId: z.coerce.number().int().positive().nullable().optional(),
  descripcion: z.string().trim().min(2, 'La descripción debe tener al menos 2 caracteres').max(255),
  cantidad: z.coerce.number().positive('La cantidad debe ser mayor a 0').default(1),
  precioUnitario: z.coerce.number().min(0, 'El precio no puede ser negativo').default(0),
});

export const createWorkOrderSchema = z.object({
  clientId: nullablePositiveId,
  vehicleId: nullablePositiveId,
  kilometrajeIngreso: z.coerce.number().int().min(0).nullable().optional(),
  descripcion: optionalText(),
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
  items: z.array(workOrderItemInputSchema).default([]),
});

export const updateWorkOrderSchema = z
  .object({
    clientId: nullablePositiveId,
    vehicleId: nullablePositiveId,
    estado: z.enum(WORK_ORDER_STATUS).optional(),
    kilometrajeIngreso: z.coerce.number().int().min(0).nullable().optional(),
    descripcion: optionalText(),
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
    items: z.array(workOrderItemInputSchema).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debe enviar al menos un campo para actualizar',
  });

export const workOrderQuerySchema = paginationSchema.extend({
  search: z.string().trim().optional(),
  estado: z.enum(WORK_ORDER_STATUS).optional(),
  clientId: z.coerce.number().int().positive().optional(),
  vehicleId: z.coerce.number().int().positive().optional(),
  fechaDesde: z.string().date('fechaDesde debe ser una fecha YYYY-MM-DD válida').optional(),
  fechaHasta: z.string().date('fechaHasta debe ser una fecha YYYY-MM-DD válida').optional(),
});

export type WorkOrderItemInput = z.infer<typeof workOrderItemInputSchema>;
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;
export type UpdateWorkOrderInput = z.infer<typeof updateWorkOrderSchema>;
export type WorkOrderQueryInput = z.infer<typeof workOrderQuerySchema>;
