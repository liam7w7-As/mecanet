import { z } from 'zod';

import { paginationSchema } from './pagination.schema.js';
import { STOCK_MOVEMENT_TYPES } from '../constants/stock-movement-types.js';

const optionalText = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

export const createWarehouseSchema = z.object({
  codigo: z.string().trim().min(2, 'El código debe tener al menos 2 caracteres').max(20).toUpperCase(),
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(120),
  direccion: optionalText(255),
  activo: z.boolean().optional().default(true),
});

export const updateWarehouseSchema = z
  .object({
    nombre: z.string().trim().min(2).max(120).optional(),
    direccion: optionalText(255),
    activo: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debe enviar al menos un campo para actualizar',
  });

export const warehouseQuerySchema = paginationSchema.extend({
  search: z.string().trim().optional(),
  soloActivos: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export const createStockMovementSchema = z.object({
  catalogItemId: z.number().int().positive('Ítem de catálogo inválido'),
  warehouseId: z.number().int().positive('Almacén inválido'),
  tipo: z.enum(['ingreso', 'salida', 'ajuste']),
  cantidad: z.coerce.number().positive('La cantidad debe ser mayor a cero'),
  motivo: z.string().trim().min(2, 'El motivo debe tener al menos 2 caracteres').max(255),
});

export const createStockTransferSchema = z.object({
  catalogItemId: z.number().int().positive('Ítem de catálogo inválido'),
  originWarehouseId: z.number().int().positive('Almacén origen inválido'),
  destinationWarehouseId: z.number().int().positive('Almacén destino inválido'),
  cantidad: z.coerce.number().int().positive('La cantidad debe ser mayor a cero'),
  motivo: z.string().trim().min(2, 'El motivo debe tener al menos 2 caracteres').max(255),
}).refine((data) => data.originWarehouseId !== data.destinationWarehouseId, {
  message: 'El origen y el destino deben ser almacenes distintos',
  path: ['destinationWarehouseId'],
});

export const stockMovementQuerySchema = paginationSchema.extend({
  catalogItemId: z.coerce.number().int().positive().optional(),
  warehouseId: z.coerce.number().int().positive().optional(),
  tipo: z.enum(STOCK_MOVEMENT_TYPES).optional(),
  fechaDesde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha desde inválida (YYYY-MM-DD)').optional(),
  fechaHasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha hasta inválida (YYYY-MM-DD)').optional(),
});

export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;
export type WarehouseQueryInput = z.infer<typeof warehouseQuerySchema>;
export type CreateStockMovementInput = z.infer<typeof createStockMovementSchema>;
export type CreateStockTransferInput = z.infer<typeof createStockTransferSchema>;
export type StockMovementQueryInput = z.infer<typeof stockMovementQuerySchema>;
