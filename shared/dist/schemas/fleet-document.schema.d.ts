import { z } from 'zod';
export declare const createFleetDocumentSchema: z.ZodEffects<z.ZodObject<{
    nombre: z.ZodString;
    referencia: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    notas: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    fechaEmision: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
    fechaVencimiento: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>;
}, "strip", z.ZodTypeAny, {
    nombre: string;
    notas?: string | null | undefined;
    referencia?: string | null | undefined;
    fechaEmision?: string | null | undefined;
    fechaVencimiento?: string | null | undefined;
}, {
    nombre: string;
    notas?: string | null | undefined;
    referencia?: string | null | undefined;
    fechaEmision?: unknown;
    fechaVencimiento?: unknown;
}>, {
    nombre: string;
    notas?: string | null | undefined;
    referencia?: string | null | undefined;
    fechaEmision?: string | null | undefined;
    fechaVencimiento?: string | null | undefined;
}, {
    nombre: string;
    notas?: string | null | undefined;
    referencia?: string | null | undefined;
    fechaEmision?: unknown;
    fechaVencimiento?: unknown;
}>;
export declare const updateFleetDocumentSchema: z.ZodEffects<z.ZodEffects<z.ZodObject<{
    nombre: z.ZodOptional<z.ZodString>;
    referencia: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>>;
    notas: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>>;
    fechaEmision: z.ZodOptional<z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>>;
    fechaVencimiento: z.ZodOptional<z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>>;
}, "strip", z.ZodTypeAny, {
    nombre?: string | undefined;
    notas?: string | null | undefined;
    referencia?: string | null | undefined;
    fechaEmision?: string | null | undefined;
    fechaVencimiento?: string | null | undefined;
}, {
    nombre?: string | undefined;
    notas?: string | null | undefined;
    referencia?: string | null | undefined;
    fechaEmision?: unknown;
    fechaVencimiento?: unknown;
}>, {
    nombre?: string | undefined;
    notas?: string | null | undefined;
    referencia?: string | null | undefined;
    fechaEmision?: string | null | undefined;
    fechaVencimiento?: string | null | undefined;
}, {
    nombre?: string | undefined;
    notas?: string | null | undefined;
    referencia?: string | null | undefined;
    fechaEmision?: unknown;
    fechaVencimiento?: unknown;
}>, {
    nombre?: string | undefined;
    notas?: string | null | undefined;
    referencia?: string | null | undefined;
    fechaEmision?: string | null | undefined;
    fechaVencimiento?: string | null | undefined;
}, {
    nombre?: string | undefined;
    notas?: string | null | undefined;
    referencia?: string | null | undefined;
    fechaEmision?: unknown;
    fechaVencimiento?: unknown;
}>;
export declare const fleetDocumentVersionSchema: z.ZodObject<{
    nombre: z.ZodOptional<z.ZodString>;
    referencia: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>>;
    notas: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>>;
    fechaEmision: z.ZodOptional<z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>>;
    fechaVencimiento: z.ZodOptional<z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null | undefined, unknown>>;
}, "strip", z.ZodTypeAny, {
    nombre?: string | undefined;
    notas?: string | null | undefined;
    referencia?: string | null | undefined;
    fechaEmision?: string | null | undefined;
    fechaVencimiento?: string | null | undefined;
}, {
    nombre?: string | undefined;
    notas?: string | null | undefined;
    referencia?: string | null | undefined;
    fechaEmision?: unknown;
    fechaVencimiento?: unknown;
}>;
export declare const fleetDocumentFileQuerySchema: z.ZodObject<{
    download: z.ZodOptional<z.ZodEnum<["1"]>>;
    versionId: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    download?: "1" | undefined;
    versionId?: number | undefined;
}, {
    download?: "1" | undefined;
    versionId?: number | undefined;
}>;
export type CreateFleetDocumentInput = z.infer<typeof createFleetDocumentSchema>;
export type UpdateFleetDocumentInput = z.infer<typeof updateFleetDocumentSchema>;
export type FleetDocumentVersionInput = z.infer<typeof fleetDocumentVersionSchema>;
