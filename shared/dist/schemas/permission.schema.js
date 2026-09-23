import { z } from 'zod';
import { paginationSchema } from './pagination.schema.js';
export const updateRolePermissionsSchema = z
    .object({
    roleId: z.coerce.number().int().positive('ID de rol inválido'),
    permissionIds: z
        .array(z.coerce.number().int().positive('ID de permiso inválido'))
        .refine((ids) => new Set(ids).size === ids.length, {
        message: 'permissionIds no debe contener duplicados',
    }),
})
    .refine((data) => data.permissionIds.length > 0, {
    message: 'Debe asignar al menos un permiso',
    path: ['permissionIds'],
});
export const roleQuerySchema = paginationSchema.partial().extend({
    all: z
        .enum(['true', 'false'])
        .transform((value) => value === 'true')
        .optional(),
});
