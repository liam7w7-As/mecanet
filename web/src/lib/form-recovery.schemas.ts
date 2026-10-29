import {
  CATALOG_TYPES,
  FUEL_LEVELS,
  ITEM_OPERATIONAL_STATUS,
  QUOTATION_PAYMENT_METHODS,
  TIRE_CONDITIONS,
  UNIT_MEASURES,
  VEHICLE_INVENTORY_ITEMS,
  WORK_ORDER_INSPECTION_PHOTO_SLOTS,
} from '@unithor/shared';
import { z } from 'zod';

const optionalText = z
  .string()
  .nullish()
  .transform((value) => value ?? null);
const client = z.object({
  id: z.number().int().positive(),
  nombre: z.string(),
  rut: optionalText,
  tipo: z.enum(['cliente', 'empresa']),
  telefono: optionalText,
  email: optionalText,
  direccion: optionalText,
});
const item = z.object({
  key: z.string(),
  id: z.number().nullable().optional(),
  catalogItemId: z.number().nullable(),
  catalogTipo: z.enum(CATALOG_TYPES).nullable(),
  catalogStock: z.number().nullable(),
  descripcion: z.string(),
  tipoLinea: z.enum(CATALOG_TYPES),
  unidadMedida: z.enum(UNIT_MEASURES),
  cantidad: z.string(),
  precioUnitario: z.string(),
  horasHombreEstimadas: z.string(),
  estadoOperativo: z.enum(ITEM_OPERATIONAL_STATUS),
  notasOperativas: z.string(),
  descuentoTipo: z.enum(['porcentaje', 'fijo']).nullable().optional(),
  descuentoValor: z.string().optional(),
});
const photo = z.object({
  slot: z.enum(WORK_ORDER_INSPECTION_PHOTO_SLOTS),
  name: z.string(),
  lastModified: z.number(),
  file: z.custom<Blob>(
    (value) =>
      value instanceof Blob ||
      (typeof value === 'object' &&
        value !== null &&
        'size' in value &&
        typeof value.size === 'number' &&
        'type' in value &&
        typeof value.type === 'string' &&
        'slice' in value &&
        typeof value.slice === 'function'),
  ),
});
export const workOrderRecoverySchema = z.object({
  activeStep: z.number().int().min(0).max(4),
  client: client.nullable(),
  contactClient: client.nullable(),
  billingClient: client.nullable(),
  vehicle: z
    .object({
      id: z.number().int().positive(),
      patente: z.string(),
      marca: optionalText,
      modelo: optionalText,
      ano: z
        .number()
        .nullish()
        .transform((value) => value ?? null),
      client: z.object({ id: z.number(), nombre: z.string(), rut: optionalText }).nullable(),
    })
    .nullable(),
  assignedMechanicId: z.number().nullable(),
  kilometrajeIngreso: z.string(),
  descripcion: z.string(),
  fechaIngreso: z.string(),
  fechaEntrega: z.string(),
  items: z.array(item),
  inspection: z.object({
    nivelCombustible: z.union([z.enum(FUEL_LEVELS), z.literal('')]),
    llantaDelanteraIzquierda: z.union([z.enum(TIRE_CONDITIONS), z.literal('')]),
    llantaDelanteraDerecha: z.union([z.enum(TIRE_CONDITIONS), z.literal('')]),
    llantaTraseraIzquierda: z.union([z.enum(TIRE_CONDITIONS), z.literal('')]),
    llantaTraseraDerecha: z.union([z.enum(TIRE_CONDITIONS), z.literal('')]),
    inventario: z.array(z.enum(VEHICLE_INVENTORY_ITEMS)),
    objetosValor: z.string(),
    observaciones: z.string(),
  }),
  photos: z.array(photo).max(9),
  createdOrder: z.object({ id: z.number().int().positive(), codigo: z.string() }).nullable(),
  uploadedSlots: z.array(z.enum(WORK_ORDER_INSPECTION_PHOTO_SLOTS)),
});
export type WorkOrderRecovery = z.infer<typeof workOrderRecoverySchema>;
export const quotationRecoverySchema = z.object({
  client: z
    .object({ id: z.number().int().positive(), nombre: z.string(), rut: optionalText })
    .nullable(),
  notas: z.string(),
  items: z.array(item),
  commercial: z.object({
    formaPago: z.enum(QUOTATION_PAYMENT_METHODS),
    disponibilidadTrabajo: z.string(),
    validezDias: z.string(),
    descuentoTipo: z.enum(['porcentaje', 'fijo']).nullable(),
    descuentoValor: z.string(),
  }),
  createdQuotationId: z.number().int().positive().nullable(),
});
export type QuotationRecovery = z.infer<typeof quotationRecoverySchema>;
