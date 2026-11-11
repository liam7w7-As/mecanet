import { z } from 'zod';

export const SALES_ACCESS_SCOPE_TYPES = ['work_order', 'quotation'] as const;
export type SalesAccessScopeType = (typeof SALES_ACCESS_SCOPE_TYPES)[number];

export const SALES_ACCESS_SCOPE_LABELS: Record<SalesAccessScopeType, string> = {
  work_order: 'Orden de trabajo',
  quotation: 'Cotización',
};

/**
 * Acepta una fecha ISO completa o un día calendario (`YYYY-MM-DD`).
 * Un valor vacío o `null` deja el acceso sin vencimiento.
 */
const expiresAtSchema = z
  .union([z.string().trim().min(1), z.null()])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined || value === null) return null;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T23:59:59.999Z`)
      : new Date(value);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Fecha de expiración inválida' });
      return z.NEVER;
    }
    return date;
  });

export const createSalesAccessGrantSchema = z.object({
  scopeType: z.enum(SALES_ACCESS_SCOPE_TYPES, {
    errorMap: () => ({ message: 'Tipo de registro inválido' }),
  }),
  targetId: z.coerce.number().int().positive('ID de registro inválido'),
  includeLinkedRecord: z.boolean().default(true),
  expiresAt: expiresAtSchema,
});

export type CreateSalesAccessGrantInput = z.infer<typeof createSalesAccessGrantSchema>;

export const createRecordSalesAccessGrantSchema = z.object({
  userId: z.coerce.number().int().positive('ID de usuario inválido'),
  includeLinkedRecord: z.boolean().default(true),
  expiresAt: expiresAtSchema,
});

export type CreateRecordSalesAccessGrantInput = z.infer<
  typeof createRecordSalesAccessGrantSchema
>;

export const salesAccessGrantParamsSchema = z.object({
  id: z.coerce.number().int().positive('ID de usuario inválido'),
  grantId: z.coerce.number().int().positive('ID de acceso inválido'),
});
