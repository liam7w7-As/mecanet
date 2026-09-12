import { z } from 'zod';

import { paginationSchema } from './pagination.schema.js';
import { QUOTATION_STATUS } from '../constants/quotation-status.js';

export const createQuotationItemSchema = z.object({
  catalog_item_id: z.coerce.number().int().positive().nullable().optional(),
  descripcion: z.string().trim().min(1, 'La descripción del ítem es requerida').max(255),
  cantidad: z.coerce.number().positive('La cantidad debe ser mayor a 0').default(1),
  precio_unitario: z.coerce.number().min(0, 'El precio no puede ser negativo').default(0),
  subtotal: z.coerce.number().min(0).default(0),
});

export const createQuotationSchema = z.object({
  codigo: z
    .string()
    .trim()
    .regex(/^COT-\d{4}-\d{4,}$/, 'El código debe tener formato COT-YYYY-NNNN')
    .max(30),
  work_order_id: z.coerce.number().int().positive().nullable().optional(),
  client_id: z.coerce.number().int().positive().nullable().optional(),
  vehicle_id: z.coerce.number().int().positive().nullable().optional(),
  asesor_id: z.coerce.number().int().positive().nullable().optional(),
  estado_pago: z.enum(QUOTATION_STATUS).default('por_pagar'),
  subtotal: z.coerce.number().min(0).default(0),
  total: z.coerce.number().min(0).default(0),
  pagado: z.coerce.number().min(0).default(0),
  notas: z.string().trim().nullable().optional(),
  items: z.array(createQuotationItemSchema).optional(),
});

export const updateQuotationSchema = createQuotationSchema.partial();

export const quotationQuerySchema = paginationSchema.extend({
  search: z.string().trim().optional(),
  estado_pago: z.enum(QUOTATION_STATUS).optional(),
  work_order_id: z.coerce.number().int().positive().optional(),
  client_id: z.coerce.number().int().positive().optional(),
});
