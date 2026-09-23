import { z } from 'zod';
export declare const quickSearchQuerySchema: z.ZodObject<{
    q: z.ZodString;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    q: string;
    limit: number;
}, {
    q: string;
    limit?: number | undefined;
}>;
export declare const lookupByPlateSchema: z.ZodObject<{
    patente: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    patente: string;
}, {
    patente: string;
}>;
export type QuickSearchQueryInput = z.infer<typeof quickSearchQuerySchema>;
export type LookupByPlateInput = z.infer<typeof lookupByPlateSchema>;
