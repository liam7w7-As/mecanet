import { z } from 'zod';

const optionalString = (maxLength: number, message?: string) =>
  z
    .string()
    .trim()
    .max(maxLength, message)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

const optionalDate = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().date('La fecha debe tener formato YYYY-MM-DD').nullable().optional(),
);

const fleetDocumentFieldsSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, 'El nombre del documento es requerido')
    .max(120, 'El nombre no puede superar los 120 caracteres'),
  referencia: optionalString(80),
  notas: optionalString(2000),
  fechaEmision: optionalDate,
  fechaVencimiento: optionalDate,
});

export const createFleetDocumentSchema = fleetDocumentFieldsSchema.superRefine(
  (data, context) => {
    if (
      data.fechaEmision &&
      data.fechaVencimiento &&
      data.fechaVencimiento < data.fechaEmision
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fechaVencimiento'],
        message: 'El vencimiento no puede ser anterior a la emisión',
      });
    }
  },
);

export const updateFleetDocumentSchema = fleetDocumentFieldsSchema
  .partial()
  .superRefine((data, context) => {
    if (
      data.fechaEmision &&
      data.fechaVencimiento &&
      data.fechaVencimiento < data.fechaEmision
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fechaVencimiento'],
        message: 'El vencimiento no puede ser anterior a la emisión',
      });
    }
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debe enviar al menos un campo para actualizar',
  });

export const fleetDocumentVersionSchema = fleetDocumentFieldsSchema.partial();

export const fleetDocumentFileQuerySchema = z.object({
  download: z.enum(['1']).optional(),
  versionId: z.coerce.number().int().positive().optional(),
});

export type CreateFleetDocumentInput = z.infer<typeof createFleetDocumentSchema>;
export type UpdateFleetDocumentInput = z.infer<typeof updateFleetDocumentSchema>;
export type FleetDocumentVersionInput = z.infer<typeof fleetDocumentVersionSchema>;
