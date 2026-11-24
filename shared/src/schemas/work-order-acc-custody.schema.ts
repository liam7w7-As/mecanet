import { z } from 'zod';

/** Signer identity always comes from the authenticated session. */
export const updateAccCustodySchema = z.object({
  entregado: z.boolean().optional(),
  recibido: z.boolean().optional(),
  warehouseId: z.number().int().positive().optional(),
  notaEntrega: z.string().trim().max(1000).nullable().optional(),
}).strict().refine((data) => Object.keys(data).length > 0, 'Indica la acción de custodia')
  .refine((data) => data.entregado === undefined || data.recibido === undefined, 'La entrega y recepción requieren confirmaciones separadas');
export type UpdateAccCustodyInput = z.infer<typeof updateAccCustodySchema>;

export const updateAccBodegueroDeliverySchema = z.object({
  bodegueroUserId: z.number().int().positive().nullable().optional(),
  entregado: z.boolean(),
});

export const updateAccArmadorReceptionSchema = z.object({
  armadorUserId: z.number().int().positive().nullable().optional(),
  recibido: z.boolean(),
  notaEntrega: z.string().trim().max(1000).nullable().optional(),
});

export type UpdateAccBodegueroDeliveryInput = z.infer<typeof updateAccBodegueroDeliverySchema>;
export type UpdateAccArmadorReceptionInput = z.infer<typeof updateAccArmadorReceptionSchema>;
