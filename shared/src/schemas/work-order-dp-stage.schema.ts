import { z } from 'zod';

import { DP_STAGE_KEYS } from '../constants/catalog-types.js';

export const dpStageKeySchema = z.enum(DP_STAGE_KEYS);

export const dpStageStatusSchema = z.enum(['pendiente', 'en_proceso', 'completado']);

export const assignDpStageSchema = z.object({
  assignedUserId: z.number().int().positive().nullable(),
}).strict();

export const updateDpStageSchema = z.object({
  assignedUserId: z.number().int().positive().nullable().optional(),
  status: dpStageStatusSchema.optional(),
  note: z.string().trim().max(2000).nullable().optional(),
}).strict().refine((data) => Object.keys(data).length > 0, 'Indica el cambio de la etapa');

export const updateDpStageStatusSchema = z.object({
  status: dpStageStatusSchema,
  note: z.string().trim().max(2000).nullable().optional(),
});

export const reviewDpQualitySchema = z.object({
  status: z.enum(['pendiente', 'aprobado', 'rechazado']).optional(),
  note: z.string().trim().max(2000).nullable().optional(),
}).strict().refine((data) => Object.keys(data).length > 0, 'Indica la revisión u observación');

export type AssignDpStageInput = z.infer<typeof assignDpStageSchema>;
export type UpdateDpStageInput = z.infer<typeof updateDpStageSchema>;
export type UpdateDpStageStatusInput = z.infer<typeof updateDpStageStatusSchema>;
export type ReviewDpQualityInput = z.infer<typeof reviewDpQualitySchema>;
