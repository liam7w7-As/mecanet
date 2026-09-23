import { z } from 'zod';
export declare const usernameSchema: z.ZodString;
export declare const createUserSchema: z.ZodObject<{
    nombre: z.ZodString;
    username: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
    roleId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    password: string;
    email: string;
    nombre: string;
    roleId: number;
    username: string;
}, {
    password: string;
    email: string;
    nombre: string;
    roleId: number;
    username: string;
}>;
export declare const updateUserSchema: z.ZodEffects<z.ZodObject<{
    nombre: z.ZodOptional<z.ZodString>;
    username: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    roleId: z.ZodOptional<z.ZodNumber>;
    activo: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    email?: string | undefined;
    nombre?: string | undefined;
    roleId?: number | undefined;
    username?: string | undefined;
    activo?: boolean | undefined;
}, {
    email?: string | undefined;
    nombre?: string | undefined;
    roleId?: number | undefined;
    username?: string | undefined;
    activo?: boolean | undefined;
}>, {
    email?: string | undefined;
    nombre?: string | undefined;
    roleId?: number | undefined;
    username?: string | undefined;
    activo?: boolean | undefined;
}, {
    email?: string | undefined;
    nombre?: string | undefined;
    roleId?: number | undefined;
    username?: string | undefined;
    activo?: boolean | undefined;
}>;
export declare const userQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
} & {
    search: z.ZodOptional<z.ZodString>;
    roleId: z.ZodOptional<z.ZodNumber>;
    activo: z.ZodOptional<z.ZodEffects<z.ZodEnum<["true", "false"]>, boolean, "true" | "false">>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    roleId?: number | undefined;
    activo?: boolean | undefined;
    search?: string | undefined;
}, {
    roleId?: number | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    activo?: "true" | "false" | undefined;
    search?: string | undefined;
}>;
export declare const changePasswordSchema: z.ZodObject<{
    passwordActual: z.ZodOptional<z.ZodString>;
    passwordNueva: z.ZodString;
}, "strip", z.ZodTypeAny, {
    passwordNueva: string;
    passwordActual?: string | undefined;
}, {
    passwordNueva: string;
    passwordActual?: string | undefined;
}>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UserQueryInput = z.infer<typeof userQuerySchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
