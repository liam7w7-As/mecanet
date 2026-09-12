import { z } from 'zod';

import { paginationSchema } from './pagination.schema.js';
import { WORK_ORDER_STATUS } from '../constants/work-order-status.js';

export const createWorkOrderItemSchema = z.object({
  catalog_item_id: z.coerce.number().int().positive().nullable().optional(),
  descripcion: z.string().trim().min(1, 'La descripción del ítem es requerida').max(255),
  cantidad: z.coerce.number().positive('La cantidad debe ser mayor a 0').default(1),
  precio_unitario: z.coerce.number().min(0, 'El precio no puede ser negativo').default(0),
  subtotal: z.coerce.number().min(0).default(0),
});

export const createWorkOrderSchema = z.object({
  codigo: z
    .string()
    .trim()
    .regex(/^OT-\d{4}-\d{4,}$/, 'El código debe tener formato OT-YYYY-NNNN')
    .max(30),
  client_id: z.coerce.number().int().positive().nullable().optional(),
  vehicle_id: z.coerce.number().int().positive().nullable().optional(),
  estado: z.enum(WORK_ORDER_STATUS).default('borrador'),
  descripcion: z.string().trim().nullable().optional(),
  kilometraje_ingreso: z.coerce.number().int().min(0).nullable().optional(),
  fecha_ingreso: z
    .string()
    .datetime({ message: 'fecha_ingreso debe ser una fecha ISO 8601 válida' })
    .nullable()
    .optional(),
  fecha_entrega: z
    .string()
    .datetime({ message: 'fecha_entrega debe ser una fecha ISO 8601 válida' })
    .nullable()
    .optional(),
  created_by: z.coerce.number().int().positive().nullable().optional(),
  items: z.array(createWorkOrderItemSchema).optional(),
});

export const updateWorkOrderSchema = createWorkOrderSchema.partial();

export const workOrderQuerySchema = paginationSchema.extend({
  search: z.string().trim().optional(),
  estado: z.enum(WORK_ORDER_STATUS).optional(),
  client_id: z.coerce.number().int().positive().optional(),
  vehicle_id: z.coerce.number().int().positive().optional(),
});
