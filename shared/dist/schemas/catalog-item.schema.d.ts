import { z } from 'zod';
export declare const createCatalogItemSchema: z.ZodEffects<z.ZodObject<{
    tipo: z.ZodEnum<["parte", "estandar", "especifico"]>;
    codigo: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    nombre: z.ZodString;
    descripcion: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    precio: z.ZodDefault<z.ZodNumber>;
    stock: z.ZodDefault<z.ZodNumber>;
    stockMinimo: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    nombre: string;
    tipo: "parte" | "estandar" | "especifico";
    stock: number;
    stockMinimo: number;
    precio: number;
    codigo?: string | null | undefined;
    descripcion?: string | null | undefined;
}, {
    nombre: string;
    tipo: "parte" | "estandar" | "especifico";
    codigo?: string | null | undefined;
    stock?: number | undefined;
    stockMinimo?: number | undefined;
    descripcion?: string | null | undefined;
    precio?: number | undefined;
}>, {
    stock: number;
    nombre: string;
    tipo: "parte" | "estandar" | "especifico";
    stockMinimo: number;
    precio: number;
    codigo?: string | null | undefined;
    descripcion?: string | null | undefined;
}, {
    nombre: string;
    tipo: "parte" | "estandar" | "especifico";
    codigo?: string | null | undefined;
    stock?: number | undefined;
    stockMinimo?: number | undefined;
    descripcion?: string | null | undefined;
    precio?: number | undefined;
}>;
export declare const updateCatalogItemSchema: z.ZodEffects<z.ZodObject<{
    tipo: z.ZodOptional<z.ZodEnum<["parte", "estandar", "especifico"]>>;
    codigo: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    nombre: z.ZodOptional<z.ZodString>;
    descripcion: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    precio: z.ZodOptional<z.ZodNumber>;
    stock: z.ZodOptional<z.ZodNumber>;
    stockMinimo: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    nombre?: string | undefined;
    tipo?: "parte" | "estandar" | "especifico" | undefined;
    codigo?: string | null | undefined;
    stock?: number | undefined;
    stockMinimo?: number | undefined;
    descripcion?: string | null | undefined;
    precio?: number | undefined;
}, {
    nombre?: string | undefined;
    tipo?: "parte" | "estandar" | "especifico" | undefined;
    codigo?: string | null | undefined;
    stock?: number | undefined;
    stockMinimo?: number | undefined;
    descripcion?: string | null | undefined;
    precio?: number | undefined;
}>, {
    nombre?: string | undefined;
    tipo?: "parte" | "estandar" | "especifico" | undefined;
    codigo?: string | null | undefined;
    stock?: number | undefined;
    stockMinimo?: number | undefined;
    descripcion?: string | null | undefined;
    precio?: number | undefined;
}, {
    nombre?: string | undefined;
    tipo?: "parte" | "estandar" | "especifico" | undefined;
    codigo?: string | null | undefined;
    stock?: number | undefined;
    stockMinimo?: number | undefined;
    descripcion?: string | null | undefined;
    precio?: number | undefined;
}>;
export declare const updateStockSchema: z.ZodObject<{
    delta: z.ZodNumber;
    motivo: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    delta: number;
    motivo?: string | undefined;
}, {
    delta: number;
    motivo?: string | undefined;
}>;
export declare const catalogItemQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
} & {
    search: z.ZodOptional<z.ZodString>;
    tipo: z.ZodOptional<z.ZodEnum<["parte", "estandar", "especifico"]>>;
    soloConStock: z.ZodOptional<z.ZodEffects<z.ZodEnum<["true", "false"]>, boolean, "true" | "false">>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    search?: string | undefined;
    tipo?: "parte" | "estandar" | "especifico" | undefined;
    soloConStock?: boolean | undefined;
}, {
    page?: number | undefined;
    pageSize?: number | undefined;
    search?: string | undefined;
    tipo?: "parte" | "estandar" | "especifico" | undefined;
    soloConStock?: "true" | "false" | undefined;
}>;
export type CreateCatalogItemInput = z.infer<typeof createCatalogItemSchema>;
export type UpdateCatalogItemInput = z.infer<typeof updateCatalogItemSchema>;
export type UpdateStockInput = z.infer<typeof updateStockSchema>;
export type CatalogItemQueryInput = z.infer<typeof catalogItemQuerySchema>;
