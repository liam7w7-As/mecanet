import { z } from 'zod';
export declare const updateRolePermissionsSchema: z.ZodEffects<z.ZodObject<{
    roleId: z.ZodNumber;
    permissionIds: z.ZodEffects<z.ZodArray<z.ZodNumber, "many">, number[], number[]>;
}, "strip", z.ZodTypeAny, {
    roleId: number;
    permissionIds: number[];
}, {
    roleId: number;
    permissionIds: number[];
}>, {
    roleId: number;
    permissionIds: number[];
}, {
    roleId: number;
    permissionIds: number[];
}>;
export declare const roleQuerySchema: z.ZodObject<{
    page: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    pageSize: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
} & {
    all: z.ZodOptional<z.ZodEffects<z.ZodEnum<["true", "false"]>, boolean, "true" | "false">>;
}, "strip", z.ZodTypeAny, {
    page?: number | undefined;
    pageSize?: number | undefined;
    all?: boolean | undefined;
}, {
    page?: number | undefined;
    pageSize?: number | undefined;
    all?: "true" | "false" | undefined;
}>;
export type UpdateRolePermissionsInput = z.infer<typeof updateRolePermissionsSchema>;
export type RoleQueryInput = z.infer<typeof roleQuerySchema>;
