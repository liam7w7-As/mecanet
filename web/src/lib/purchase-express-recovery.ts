import { z } from 'zod';

export const expressRecoverySchema = z.object({
  operationKey: z.string().uuid(),
  order: z
    .object({
      id: z.number(),
      codigo: z.string(),
      estado: z.string(),
      patente: z.string(),
      vehicleId: z.number(),
      vehiculo: z.string(),
      cliente: z.string().nullable(),
    })
    .nullable(),
  requestId: z.number().nullable(),
  descripcion: z.string(),
  cantidad: z.string(),
  costoUnitario: z.string(),
  ventaUnitario: z.string(),
  saleEdited: z.boolean(),
  conIva: z.boolean(),
  metodoPago: z.enum([
    'efectivo',
    'transferencia',
    'tarjeta_debito',
    'tarjeta_credito',
    'cheque',
    'otro',
  ]),
  proveedorNombre: z.string(),
  folio: z.string(),
  fechaEmision: z.string(),
  detalle: z.string(),
  tipoDocumento: z.enum(['recibo', 'otro']).default('otro'),
  file: z
    .object({
      blob: z.custom<Blob>((value) => value instanceof Blob),
      name: z.string(),
      lastModified: z.number(),
    })
    .nullable(),
});
export type ExpressRecovery = z.infer<typeof expressRecoverySchema>;
