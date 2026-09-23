import { z } from 'zod';
export declare const createWarehouseSchema: z.ZodObject<{
    codigo: z.ZodString;
    nombre: z.ZodString;
    direccion: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    activo: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    nombre: string;
    activo: boolean;
    codigo: string;
    direccion?: string | null | undefined;
}, {
    nombre: string;
    codigo: string;
    activo?: boolean | undefined;
    direccion?: string | null | undefined;
}>;
export declare const updateWarehouseSchema: z.ZodEffects<z.ZodObject<{
    nombre: z.ZodOptional<z.ZodString>;
    direccion: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    activo: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    nombre?: string | undefined;
    activo?: boolean | undefined;
    direccion?: string | null | undefined;
}, {
    nombre?: string | undefined;
    activo?: boolean | undefined;
    direccion?: string | null | undefined;
}>, {
    nombre?: string | undefined;
    activo?: boolean | undefined;
    direccion?: string | null | undefined;
}, {
    nombre?: string | undefined;
    activo?: boolean | undefined;
    direccion?: string | null | undefined;
}>;
export declare const warehouseQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
} & {
    search: z.ZodOptional<z.ZodString>;
    soloActivos: z.ZodOptional<z.ZodEffects<z.ZodEnum<["true", "false"]>, boolean, "true" | "false">>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    search?: string | undefined;
    soloActivos?: boolean | undefined;
}, {
    page?: number | undefined;
    pageSize?: number | undefined;
    search?: string | undefined;
    soloActivos?: "true" | "false" | undefined;
}>;
export declare const createStockMovementSchema: z.ZodObject<{
    catalogItemId: z.ZodNumber;
    warehouseId: z.ZodNumber;
    tipo: z.ZodEnum<["ingreso", "salida", "ajuste"]>;
    cantidad: z.ZodNumber;
    motivo: z.ZodString;
}, "strip", z.ZodTypeAny, {
    tipo: "ingreso" | "salida" | "ajuste";
    motivo: string;
    catalogItemId: number;
    cantidad: number;
    warehouseId: number;
}, {
    tipo: "ingreso" | "salida" | "ajuste";
    motivo: string;
    catalogItemId: number;
    cantidad: number;
    warehouseId: number;
}>;
export declare const createStockTransferSchema: z.ZodEffects<z.ZodObject<{
    catalogItemId: z.ZodNumber;
    originWarehouseId: z.ZodNumber;
    destinationWarehouseId: z.ZodNumber;
    cantidad: z.ZodNumber;
    motivo: z.ZodString;
}, "strip", z.ZodTypeAny, {
    motivo: string;
    catalogItemId: number;
    cantidad: number;
    originWarehouseId: number;
    destinationWarehouseId: number;
}, {
    motivo: string;
    catalogItemId: number;
    cantidad: number;
    originWarehouseId: number;
    destinationWarehouseId: number;
}>, {
    motivo: string;
    catalogItemId: number;
    cantidad: number;
    originWarehouseId: number;
    destinationWarehouseId: number;
}, {
    motivo: string;
    catalogItemId: number;
    cantidad: number;
    originWarehouseId: number;
    destinationWarehouseId: number;
}>;
export declare const stockMovementQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
} & {
    catalogItemId: z.ZodOptional<z.ZodNumber>;
    warehouseId: z.ZodOptional<z.ZodNumber>;
    tipo: z.ZodOptional<z.ZodEnum<["ingreso", "salida", "ajuste", "traslado_salida", "traslado_ingreso", "consumo_ot"]>>;
    fechaDesde: z.ZodOptional<z.ZodString>;
    fechaHasta: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    tipo?: "ingreso" | "salida" | "ajuste" | "traslado_salida" | "traslado_ingreso" | "consumo_ot" | undefined;
    catalogItemId?: number | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    warehouseId?: number | undefined;
}, {
    page?: number | undefined;
    pageSize?: number | undefined;
    tipo?: "ingreso" | "salida" | "ajuste" | "traslado_salida" | "traslado_ingreso" | "consumo_ot" | undefined;
    catalogItemId?: number | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    warehouseId?: number | undefined;
}>;
export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;
export type WarehouseQueryInput = z.infer<typeof warehouseQuerySchema>;
export type CreateStockMovementInput = z.infer<typeof createStockMovementSchema>;
export type CreateStockTransferInput = z.infer<typeof createStockTransferSchema>;
export type StockMovementQueryInput = z.infer<typeof stockMovementQuerySchema>;
