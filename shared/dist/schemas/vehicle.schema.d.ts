import { z } from 'zod';
export declare const normalizeChilePatente: (value: string) => string;
export declare const isValidChilePatente: (value: string) => boolean;
export declare const createVehicleSchema: z.ZodObject<{
    patente: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
    marca: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    modelo: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    ano: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    color: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    vinChasis: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    motor: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    kilometraje: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    combustible: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    transmision: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    clientId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    patente: string;
    marca?: string | null | undefined;
    modelo?: string | null | undefined;
    ano?: number | null | undefined;
    color?: string | null | undefined;
    vinChasis?: string | null | undefined;
    motor?: string | null | undefined;
    kilometraje?: number | null | undefined;
    combustible?: string | null | undefined;
    transmision?: string | null | undefined;
    clientId?: number | null | undefined;
}, {
    patente: string;
    marca?: string | null | undefined;
    modelo?: string | null | undefined;
    ano?: number | null | undefined;
    color?: string | null | undefined;
    vinChasis?: string | null | undefined;
    motor?: string | null | undefined;
    kilometraje?: number | null | undefined;
    combustible?: string | null | undefined;
    transmision?: string | null | undefined;
    clientId?: number | null | undefined;
}>;
export declare const updateVehicleSchema: z.ZodEffects<z.ZodObject<{
    patente: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>;
    marca: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>>;
    modelo: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>>;
    ano: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    color: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>>;
    vinChasis: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>>;
    motor: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>>;
    kilometraje: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    combustible: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>>;
    transmision: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>>;
    clientId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
}, "strip", z.ZodTypeAny, {
    patente?: string | undefined;
    marca?: string | null | undefined;
    modelo?: string | null | undefined;
    ano?: number | null | undefined;
    color?: string | null | undefined;
    vinChasis?: string | null | undefined;
    motor?: string | null | undefined;
    kilometraje?: number | null | undefined;
    combustible?: string | null | undefined;
    transmision?: string | null | undefined;
    clientId?: number | null | undefined;
}, {
    patente?: string | undefined;
    marca?: string | null | undefined;
    modelo?: string | null | undefined;
    ano?: number | null | undefined;
    color?: string | null | undefined;
    vinChasis?: string | null | undefined;
    motor?: string | null | undefined;
    kilometraje?: number | null | undefined;
    combustible?: string | null | undefined;
    transmision?: string | null | undefined;
    clientId?: number | null | undefined;
}>, {
    patente?: string | undefined;
    marca?: string | null | undefined;
    modelo?: string | null | undefined;
    ano?: number | null | undefined;
    color?: string | null | undefined;
    vinChasis?: string | null | undefined;
    motor?: string | null | undefined;
    kilometraje?: number | null | undefined;
    combustible?: string | null | undefined;
    transmision?: string | null | undefined;
    clientId?: number | null | undefined;
}, {
    patente?: string | undefined;
    marca?: string | null | undefined;
    modelo?: string | null | undefined;
    ano?: number | null | undefined;
    color?: string | null | undefined;
    vinChasis?: string | null | undefined;
    motor?: string | null | undefined;
    kilometraje?: number | null | undefined;
    combustible?: string | null | undefined;
    transmision?: string | null | undefined;
    clientId?: number | null | undefined;
}>;
export declare const vehicleQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
} & {
    search: z.ZodOptional<z.ZodString>;
    clientId: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    search?: string | undefined;
    clientId?: number | undefined;
}, {
    page?: number | undefined;
    pageSize?: number | undefined;
    search?: string | undefined;
    clientId?: number | undefined;
}>;
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
export type VehicleQueryInput = z.infer<typeof vehicleQuerySchema>;
