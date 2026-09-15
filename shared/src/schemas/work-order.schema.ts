import { z } from 'zod';

import { paginationSchema } from './pagination.schema.js';
import {
  FUEL_LEVELS,
  TIRE_CONDITIONS,
  VEHICLE_INVENTORY_ITEMS,
} from '../constants/work-order-inspection.js';
import { WORK_ORDER_STATUS } from '../constants/work-order-status.js';

const optionalText = (maxLength?: number) => {
  const schema = z.string().trim();
  return (maxLength ? schema.max(maxLength) : schema)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();
};

const nullablePositiveId = z.coerce.number().int().positive().nullable().optional();

const inventorySchema = z
  .array(z.enum(VEHICLE_INVENTORY_ITEMS))
  .max(50)
  .refine((items) => new Set(items).size === items.length, {
    message: 'El inventario no puede contener elementos duplicados',
  });

const inspectionFields = {
  nivelCombustible: z.enum(FUEL_LEVELS).nullable().optional(),
  llantaDelanteraIzquierda: z.enum(TIRE_CONDITIONS).nullable().optional(),
  llantaDelanteraDerecha: z.enum(TIRE_CONDITIONS).nullable().optional(),
  llantaTraseraIzquierda: z.enum(TIRE_CONDITIONS).nullable().optional(),
  llantaTraseraDerecha: z.enum(TIRE_CONDITIONS).nullable().optional(),
  objetosValor: optionalText(1000),
  observaciones: optionalText(2000),
};

export const workOrderInspectionSchema = z.object({
  ...inspectionFields,
  inventario: inventorySchema.default([]),
});

export const updateWorkOrderInspectionSchema = z
  .object({
    ...inspectionFields,
    inventario: inventorySchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debe enviar al menos un campo de inspección',
  });

export const workOrderItemInputSchema = z.object({
  catalogItemId: z.coerce.number().int().positive().nullable().optional(),
  descripcion: z.string().trim().min(2, 'La descripción debe tener al menos 2 caracteres').max(255),
  cantidad: z.coerce.number().positive('La cantidad debe ser mayor a 0').default(1),
  precioUnitario: z.coerce.number().min(0, 'El precio no puede ser negativo').default(0),
});

export const createWorkOrderSchema = z.object({
  clientId: nullablePositiveId,
  contactClientId: nullablePositiveId,
  billingClientId: nullablePositiveId,
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
  inspection: workOrderInspectionSchema.optional(),
});

export const updateWorkOrderSchema = z
  .object({
    clientId: nullablePositiveId,
    contactClientId: nullablePositiveId,
    billingClientId: nullablePositiveId,
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
    items: z.array(workOrderItemInputSchema).optional(),
    inspection: updateWorkOrderInspectionSchema.optional(),
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

export const changeWorkOrderStatusSchema = z.object({
  nuevoEstado: z.enum(WORK_ORDER_STATUS),
  motivo: optionalText(500),
});

export type WorkOrderItemInput = z.infer<typeof workOrderItemInputSchema>;
export type WorkOrderInspectionInput = z.infer<typeof workOrderInspectionSchema>;
export type UpdateWorkOrderInspectionInput = z.infer<typeof updateWorkOrderInspectionSchema>;
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;
export type UpdateWorkOrderInput = z.infer<typeof updateWorkOrderSchema>;
export type WorkOrderQueryInput = z.infer<typeof workOrderQuerySchema>;
export type ChangeWorkOrderStatusInput = z.infer<typeof changeWorkOrderStatusSchema>;
