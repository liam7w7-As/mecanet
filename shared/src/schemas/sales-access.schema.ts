import { z } from 'zod';

export const SALES_ACCESS_SCOPE_TYPES = ['work_order', 'quotation'] as const;
export type SalesAccessScopeType = (typeof SALES_ACCESS_SCOPE_TYPES)[number];

export const SALES_ACCESS_MODES = ['own', 'selected', 'all'] as const;
export type SalesAccessMode = (typeof SALES_ACCESS_MODES)[number];

export const salesAccessRecordSchema = z.object({
  scopeType: z.enum(SALES_ACCESS_SCOPE_TYPES),
  targetId: z.number().int().positive().safe(),
}).strict();

export const updateSalesAccessSchema = z.object({
  mode: z.enum(SALES_ACCESS_MODES),
  records: z.array(salesAccessRecordSchema).max(500).optional(),
}).strict().superRefine((input, ctx) => {
  if (input.mode === 'selected' && !input.records?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['records'],
      message: 'Selecciona al menos un registro',
    });
  }
}).transform((input) => ({
  ...input,
  ...(input.records ? {
    records: [...new Map(input.records.map((record) => [
      `${record.scopeType}:${record.targetId}`, record,
    ])).values()],
  } : {}),
}));

export type UpdateSalesAccessInput = z.infer<typeof updateSalesAccessSchema>;

export const salesAccessRecordsQuerySchema = z.object({
  scopeType: z.enum(SALES_ACCESS_SCOPE_TYPES),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().safe().default(1),
  pageSize: z.coerce.number().int().positive().max(20).default(10),
}).strict();

export type SalesAccessRecordsQuery = z.infer<typeof salesAccessRecordsQuerySchema>;

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
