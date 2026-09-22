import { z } from 'zod';

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const accountingDateSchema = z
  .string()
  .date('La fecha debe tener formato YYYY-MM-DD')
  .refine((value) => value <= todayIso(), 'No se puede operar sobre una fecha futura');

export const financeDayQuerySchema = z.object({
  fecha: accountingDateSchema.default(todayIso),
});

export const closeCashDaySchema = z.object({
  fecha: accountingDateSchema.default(todayIso),
  efectivoDeclarado: z.coerce.number().nonnegative('El efectivo declarado no puede ser negativo'),
  observaciones: z.string().trim().max(1000).optional(),
});

export type FinanceDayQueryInput = z.infer<typeof financeDayQuerySchema>;
export type CloseCashDayInput = z.infer<typeof closeCashDaySchema>;
