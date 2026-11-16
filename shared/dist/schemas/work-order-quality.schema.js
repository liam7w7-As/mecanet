import { z } from 'zod';
import { workOrderTeamMembersSchema } from './work-order.schema.js';
const optionalNote = z.string().trim().max(2000).nullable().optional();
export const reviewWorkOrderQualitySchema = z.discriminatedUnion('decision', [
    z.object({
        decision: z.literal('aprobar'),
        nota: optionalNote,
    }).strict(),
    z.object({
        decision: z.literal('rechazar'),
        nota: z.string().trim().min(2).max(2000),
        members: workOrderTeamMembersSchema.optional(),
    }).strict(),
]);
export const confirmWorkOrderQualitySchema = z.object({
    notas: optionalNote,
}).strict();
