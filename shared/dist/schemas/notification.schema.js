import { z } from 'zod';
import { paginationSchema } from './pagination.schema.js';
import { NOTIFICATION_LEVELS, NOTIFICATION_TYPES } from '../constants/notifications.js';
export const notificationSchema = z.object({
    id: z.number().int().positive(),
    tipo: z.enum(NOTIFICATION_TYPES),
    nivel: z.enum(NOTIFICATION_LEVELS),
    titulo: z.string(),
    mensaje: z.string(),
    href: z.string().startsWith('/'),
    leida: z.boolean(),
    workOrderId: z.number().int().positive().nullable(),
    quotationId: z.number().int().positive().nullable(),
    paymentId: z.number().int().positive().nullable(),
    actor: z
        .object({ id: z.number().int().positive(), nombre: z.string() })
        .nullable(),
    createdAt: z.string().datetime(),
});
export const notificationListQuerySchema = paginationSchema.extend({
    soloNoLeidas: z
        .union([z.boolean(), z.enum(['true', 'false'])])
        .transform((value) => value === true || value === 'true')
        .default(false),
});
export const markNotificationsReadSchema = z
    .object({
    ids: z.array(z.coerce.number().int().positive()).max(200).optional(),
    todas: z.boolean().default(false),
})
    .refine((value) => value.todas || (value.ids?.length ?? 0) > 0, {
    message: 'Debe indicar al menos una notificación o marcar todas como leídas',
});
