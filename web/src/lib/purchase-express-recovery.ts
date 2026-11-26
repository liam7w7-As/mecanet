import { z } from 'zod';

const orderSchema = z.object({
  id: z.number(),
  codigo: z.string(),
  estado: z.string(),
  patente: z.string(),
  vehicleId: z.number(),
  vehiculo: z.string(),
  cliente: z.string().nullable(),
});
const lineFields = {
  requestId: z.number().nullable(),
  descripcion: z.string(),
  cantidad: z.string(),
  costoUnitario: z.string(),
  ventaUnitario: z.string(),
  saleEdited: z.boolean(),
};
const headerFields = {
  operationKey: z.string().uuid(),
  order: orderSchema.nullable(),
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
};
const lineSchema = z.object({
  ...lineFields,
  id: z.string(),
  // null inherits the header; request lines always retain their own order.
  order: orderSchema.nullable(),
  detalle: z.string(),
});
const batchRecoverySchema = z.object({
  ...headerFields,
  items: z.array(lineSchema).min(1).max(30),
  editedFields: z.array(z.string()).default([]),
});
const legacyRecoverySchema = z.object({ ...headerFields, ...lineFields });

export const expressRecoverySchema = z.union([
  batchRecoverySchema,
  legacyRecoverySchema.transform((legacy) => {
    const {
      requestId,
      descripcion,
      cantidad,
      costoUnitario,
      ventaUnitario,
      saleEdited,
      ...header
    } = legacy;
    const id = crypto.randomUUID();
    return {
      ...header,
      detalle: '',
      items: [
        {
          id,
          order: requestId ? legacy.order : null,
          requestId,
          descripcion,
          cantidad,
          costoUnitario,
          ventaUnitario,
          saleEdited,
          detalle: legacy.detalle,
        },
      ],
      // Old drafts did not record manual fields. Protect all recovered data.
      editedFields: [
        'conIva',
        'proveedorNombre',
        'folio',
        'fechaEmision',
        ...['descripcion', 'cantidad', 'costoUnitario', 'ventaUnitario'].map(
          (key) => `${id}.${key}`,
        ),
      ],
    };
  }),
]);
export type ExpressRecovery = z.infer<typeof expressRecoverySchema>;
export type ExpressRecoveryLine = ExpressRecovery['items'][number];
