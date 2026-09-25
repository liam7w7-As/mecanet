import { z } from 'zod';
import { chilePhoneSchema, rutSchema } from './client.schema.js';
import { paginationSchema } from './pagination.schema.js';
import { ITEM_OPERATIONAL_STATUS } from '../constants/item-operational-status.js';
import { WORK_ORDER_DELIVERY_CHECKLIST } from '../constants/work-order-delivery.js';
import { WORK_ORDER_ENTRY_TYPES } from '../constants/work-order-entry-type.js';
import { FUEL_LEVELS, TIRE_CONDITIONS, VEHICLE_INVENTORY_ITEMS, } from '../constants/work-order-inspection.js';
import { WORK_ORDER_STATUS } from '../constants/work-order-status.js';
const optionalText = (maxLength) => {
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
    estadoOperativo: z.enum(ITEM_OPERATIONAL_STATUS).default('pendiente'),
    notasOperativas: optionalText(1000),
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
const deliveryChecklistSchema = z
    .array(z.enum(WORK_ORDER_DELIVERY_CHECKLIST))
    .length(WORK_ORDER_DELIVERY_CHECKLIST.length, 'Debe completar todos los controles de entrega')
    .refine((items) => new Set(items).size === items.length, {
    message: 'El checklist de entrega no puede contener controles duplicados',
})
    .refine((items) => WORK_ORDER_DELIVERY_CHECKLIST.every((required) => items.includes(required)), { message: 'Debe completar todos los controles de entrega' });
export const deliverWorkOrderSchema = z.object({
    kilometrajeSalida: z.coerce.number().int().min(0),
    receptorNombre: z.string().trim().min(2).max(180),
    receptorRut: rutSchema,
    receptorTelefono: chilePhoneSchema,
    checklist: deliveryChecklistSchema,
    conformidad: z.literal(true, {
        errorMap: () => ({ message: 'El receptor debe aceptar la conformidad de entrega' }),
    }),
    firmaRecepcion: z.string().trim().min(2, 'Debe registrar la firma nominativa').max(180),
    observaciones: optionalText(2000),
});
export const createWorkOrderReentrySchema = z.object({
    tipoIngreso: z.enum([WORK_ORDER_ENTRY_TYPES[1], WORK_ORDER_ENTRY_TYPES[2]]),
    motivo: z.string().trim().min(2, 'Debe indicar el motivo del reingreso').max(2000),
    kilometrajeIngreso: z.coerce.number().int().min(0).nullable().optional(),
    fechaIngreso: z
        .string()
        .datetime({ message: 'fechaIngreso debe ser una fecha ISO 8601 válida' })
        .optional(),
    copiarItems: z.coerce.boolean().default(false),
    coberturaGarantia: z.coerce.boolean().optional(),
});
export const assignWorkOrderMechanicSchema = z.object({
    mechanicId: z.coerce.number().int().positive().nullable(),
});
export const workOrderProgressReportSchema = z.object({
    porcentaje: z.coerce.number().int().min(0).max(100),
    comentario: z.string().trim().min(2).max(2000),
    bloqueos: optionalText(2000),
});
export const updateWorkOrderExecutionSchema = z
    .object({
    items: z
        .array(z.object({
        id: z.coerce.number().int().positive(),
        estadoOperativo: z.enum(ITEM_OPERATIONAL_STATUS),
        notasOperativas: optionalText(1000),
    }))
        .max(200)
        .optional(),
    reporte: workOrderProgressReportSchema.optional(),
})
    .refine((data) => data.items !== undefined || data.reporte !== undefined, {
    message: 'Debe actualizar trabajos o registrar un reporte de avance',
});
const requestReason = z.string().trim().min(2, 'Debe indicar el motivo').max(2000);
export const createWorkOrderRequestSchema = z.discriminatedUnion('tipo', [
    z.object({
        tipo: z.literal('repuesto'),
        catalogItemId: z.coerce.number().int().positive(),
        cantidad: z.coerce.number().int().positive().max(9999),
        motivo: requestReason,
    }),
    z.object({
        tipo: z.literal('aumento_precio'),
        workOrderItemId: z.coerce.number().int().positive(),
        precioSugerido: z.coerce.number().positive().max(999999999),
        motivo: requestReason,
    }),
]);
export const reviewWorkOrderRequestSchema = z.object({
    decision: z.enum(['aprobar', 'rechazar']),
    precioAprobado: z.coerce.number().min(0).max(999999999).optional(),
    comentario: optionalText(2000),
});
