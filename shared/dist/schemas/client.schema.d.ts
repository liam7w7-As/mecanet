import { z } from 'zod';
export declare const createClientSchema: z.ZodObject<{
    rut: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string | null, string>>>;
    nombre: z.ZodString;
    tipo: z.ZodEnum<["cliente", "empresa"]>;
    email: z.ZodOptional<z.ZodNullable<z.ZodPipeline<z.ZodEffects<z.ZodString, string | null, string>, z.ZodNullable<z.ZodString>>>>;
    telefono: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    direccion: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    region: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    comuna: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    notas: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
}, "strip", z.ZodTypeAny, {
    nombre: string;
    tipo: "cliente" | "empresa";
    email?: string | null | undefined;
    rut?: string | null | undefined;
    telefono?: string | null | undefined;
    direccion?: string | null | undefined;
    region?: string | null | undefined;
    comuna?: string | null | undefined;
    notas?: string | null | undefined;
}, {
    nombre: string;
    tipo: "cliente" | "empresa";
    email?: string | null | undefined;
    rut?: string | null | undefined;
    telefono?: string | null | undefined;
    direccion?: string | null | undefined;
    region?: string | null | undefined;
    comuna?: string | null | undefined;
    notas?: string | null | undefined;
}>;
export declare const updateClientSchema: z.ZodEffects<z.ZodObject<{
    rut: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string | null, string>>>>;
    nombre: z.ZodOptional<z.ZodString>;
    tipo: z.ZodOptional<z.ZodEnum<["cliente", "empresa"]>>;
    email: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodPipeline<z.ZodEffects<z.ZodString, string | null, string>, z.ZodNullable<z.ZodString>>>>>;
    telefono: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>>;
    direccion: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>>;
    region: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>>;
    comuna: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>>;
    notas: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>>;
}, "strip", z.ZodTypeAny, {
    email?: string | null | undefined;
    nombre?: string | undefined;
    rut?: string | null | undefined;
    tipo?: "cliente" | "empresa" | undefined;
    telefono?: string | null | undefined;
    direccion?: string | null | undefined;
    region?: string | null | undefined;
    comuna?: string | null | undefined;
    notas?: string | null | undefined;
}, {
    email?: string | null | undefined;
    nombre?: string | undefined;
    rut?: string | null | undefined;
    tipo?: "cliente" | "empresa" | undefined;
    telefono?: string | null | undefined;
    direccion?: string | null | undefined;
    region?: string | null | undefined;
    comuna?: string | null | undefined;
    notas?: string | null | undefined;
}>, {
    email?: string | null | undefined;
    nombre?: string | undefined;
    rut?: string | null | undefined;
    tipo?: "cliente" | "empresa" | undefined;
    telefono?: string | null | undefined;
    direccion?: string | null | undefined;
    region?: string | null | undefined;
    comuna?: string | null | undefined;
    notas?: string | null | undefined;
}, {
    email?: string | null | undefined;
    nombre?: string | undefined;
    rut?: string | null | undefined;
    tipo?: "cliente" | "empresa" | undefined;
    telefono?: string | null | undefined;
    direccion?: string | null | undefined;
    region?: string | null | undefined;
    comuna?: string | null | undefined;
    notas?: string | null | undefined;
}>;
export declare const clientQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
} & {
    search: z.ZodOptional<z.ZodString>;
    tipo: z.ZodOptional<z.ZodEnum<["cliente", "empresa"]>>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    search?: string | undefined;
    tipo?: "cliente" | "empresa" | undefined;
}, {
    page?: number | undefined;
    pageSize?: number | undefined;
    search?: string | undefined;
    tipo?: "cliente" | "empresa" | undefined;
}>;
export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type ClientQueryInput = z.infer<typeof clientQuerySchema>;
