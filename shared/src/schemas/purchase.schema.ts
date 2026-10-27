import { z } from 'zod';

import { paginationSchema } from './pagination.schema.js';
import { PAYMENT_METHODS } from './payment.schema.js';
import {
  PURCHASE_DOCUMENT_TYPES,
  PURCHASE_PAYMENT_TYPES,
  PURCHASE_STATUSES,
  PURCHASE_VEHICLE_ORIGINS,
} from '../constants/purchases.js';

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const optionalString = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength, `Máximo ${maxLength} caracteres`)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

const positiveId = z.coerce.number().int().positive();

export const purchaseItemSchema = z.object({
  catalogItemId: positiveId.nullable().optional(),
  descripcion: z
    .string()
    .trim()
    .min(2, 'Describe el ítem o servicio adquirido')
    .max(255, 'Máximo 255 caracteres'),
  cantidad: z.coerce
    .number()
    .positive('La cantidad debe ser mayor a 0')
    .max(999999, 'Cantidad fuera de rango'),
  precioUnitario: z.coerce
    .number()
    .min(0, 'El precio unitario no puede ser negativo')
    .max(999999999, 'Precio fuera de rango'),
  afectaStock: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .transform((value) => value === true || value === 'true' || value === '1')
    .default(false),
  warehouseId: positiveId.nullable().optional(),
});

export const createPurchaseSchema = z
  .object({
    proveedorId: positiveId.nullable().optional(),
    proveedorNombre: z
      .string()
      .trim()
      .max(180, 'Máximo 180 caracteres')
      .transform((value) => (value === '' ? null : value))
      .nullable()
      .optional(),
    origenVehiculo: z.enum(PURCHASE_VEHICLE_ORIGINS).nullable().optional(),
    vehicleId: positiveId.nullable().optional(),
    fleetVehicleId: positiveId.nullable().optional(),
    workOrderId: positiveId.nullable().optional(),
    conIva: z
      .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
      .transform((value) => value === true || value === 'true' || value === '1')
      .default(true),
    formaPago: z.enum(PURCHASE_PAYMENT_TYPES).default('contado'),
    metodoPago: z.enum(PAYMENT_METHODS).default('efectivo'),
    tipoDocumento: z.enum(PURCHASE_DOCUMENT_TYPES),
    folio: z.string().trim().min(1, 'Ingresa el folio del comprobante').max(50),
    fechaEmision: z
      .string()
      .date('La fecha de emisión debe tener formato YYYY-MM-DD')
      .refine((value) => value <= todayIso(), 'La fecha de emisión no puede ser futura'),
    montoComprobante: z.coerce
      .number()
      .min(0, 'El monto del comprobante no puede ser negativo')
      .max(999999999, 'Monto fuera de rango'),
    numeroOperacion: z
      .string()
      .trim()
      .min(1, 'Ingresa el número de depósito u operación')
      .max(80),
    banco: z.string().trim().min(2, 'Ingresa el banco del comprobante').max(80),
    observaciones: optionalString(1000),
    items: z.array(purchaseItemSchema).min(1, 'Agrega al menos un ítem a la compra'),
  })
  .superRefine((data, ctx) => {
    if (data.proveedorId == null && !data.proveedorNombre) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['proveedorNombre'],
        message: 'Selecciona un proveedor o escribe su nombre',
      });
    }

    if (data.vehicleId != null && data.fleetVehicleId != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fleetVehicleId'],
        message: 'La compra solo puede asociarse a un vehículo de taller o de flota, no a ambos',
      });
    }

    if (data.vehicleId != null && data.origenVehiculo === 'flota') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['origenVehiculo'],
        message: 'El vehículo seleccionado es de taller',
      });
    }

    if (data.fleetVehicleId != null && data.origenVehiculo === 'taller') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['origenVehiculo'],
        message: 'El vehículo seleccionado es de flota',
      });
    }

    if (data.workOrderId != null) {
      if (data.origenVehiculo === 'flota' || data.fleetVehicleId != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['workOrderId'],
          message: 'Las órdenes de trabajo solo aplican a vehículos de taller',
        });
      }
      if (data.vehicleId == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['workOrderId'],
          message: 'Selecciona el vehículo de taller para vincular la OT',
        });
      }
    }

    data.items.forEach((item, index) => {
      if (item.afectaStock) {
        if (item.catalogItemId == null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['items', index, 'catalogItemId'],
            message: 'Solo los repuestos del catálogo pueden ingresar stock',
          });
        }
        if (item.warehouseId == null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['items', index, 'warehouseId'],
            message: 'Selecciona el almacén que recibirá el stock',
          });
        }
        if (!Number.isInteger(item.cantidad)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['items', index, 'cantidad'],
            message: 'Para ingresar stock la cantidad debe ser un número entero',
          });
        }
      }
    });
  });

export const purchaseQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(180).optional(),
  estado: z.enum(PURCHASE_STATUSES).optional(),
  formaPago: z.enum(PURCHASE_PAYMENT_TYPES).optional(),
  tipoDocumento: z.enum(PURCHASE_DOCUMENT_TYPES).optional(),
  proveedorId: z.coerce.number().int().positive().optional(),
  fechaDesde: z.string().date('fechaDesde debe ser una fecha YYYY-MM-DD válida').optional(),
  fechaHasta: z.string().date('fechaHasta debe ser una fecha YYYY-MM-DD válida').optional(),
});

export const purchaseReportQuerySchema = purchaseQuerySchema.omit({
  page: true,
  pageSize: true,
});

export const voidPurchaseSchema = z.object({
  motivo: z.string().trim().min(2, 'Indique el motivo de la anulación').max(500),
});

export const registerPurchasePaymentSchema = z.object({
  metodo: z.enum(PAYMENT_METHODS),
  referencia: optionalString(120),
  banco: optionalString(80),
  numeroOperacion: optionalString(80),
});

export type PurchaseItemInput = z.infer<typeof purchaseItemSchema>;
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type PurchaseQueryInput = z.infer<typeof purchaseQuerySchema>;
export type PurchaseReportQueryInput = z.infer<typeof purchaseReportQuerySchema>;
export type VoidPurchaseInput = z.infer<typeof voidPurchaseSchema>;
export type RegisterPurchasePaymentInput = z.infer<typeof registerPurchasePaymentSchema>;
