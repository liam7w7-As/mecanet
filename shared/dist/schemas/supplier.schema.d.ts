import { z } from 'zod';
export declare const supplierQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
} & {
    search: z.ZodOptional<z.ZodString>;
    soloIncompletos: z.ZodOptional<z.ZodEffects<z.ZodEnum<["true", "false", "1", "0"]>, boolean, "0" | "1" | "true" | "false">>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    search?: string | undefined;
    soloIncompletos?: boolean | undefined;
}, {
    page?: number | undefined;
    pageSize?: number | undefined;
    search?: string | undefined;
    soloIncompletos?: "0" | "1" | "true" | "false" | undefined;
}>;
export declare const updateSupplierSchema: z.ZodEffects<z.ZodObject<{
    nombre: z.ZodOptional<z.ZodString>;
    rut: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string | null, string>>>;
    telefono: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    email: z.ZodOptional<z.ZodNullable<z.ZodPipeline<z.ZodEffects<z.ZodString, string | null, string>, z.ZodNullable<z.ZodString>>>>;
    direccion: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    contactoNombre: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    notas: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
}, "strip", z.ZodTypeAny, {
    email?: string | null | undefined;
    nombre?: string | undefined;
    rut?: string | null | undefined;
    telefono?: string | null | undefined;
    direccion?: string | null | undefined;
    notas?: string | null | undefined;
    contactoNombre?: string | null | undefined;
}, {
    email?: string | null | undefined;
    nombre?: string | undefined;
    rut?: string | null | undefined;
    telefono?: string | null | undefined;
    direccion?: string | null | undefined;
    notas?: string | null | undefined;
    contactoNombre?: string | null | undefined;
}>, {
    email?: string | null | undefined;
    nombre?: string | undefined;
    rut?: string | null | undefined;
    telefono?: string | null | undefined;
    direccion?: string | null | undefined;
    notas?: string | null | undefined;
    contactoNombre?: string | null | undefined;
}, {
    email?: string | null | undefined;
    nombre?: string | undefined;
    rut?: string | null | undefined;
    telefono?: string | null | undefined;
    direccion?: string | null | undefined;
    notas?: string | null | undefined;
    contactoNombre?: string | null | undefined;
}>;
export type SupplierQueryInput = z.infer<typeof supplierQuerySchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
