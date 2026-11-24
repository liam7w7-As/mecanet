import { z } from 'zod';
export declare const dpStageKeySchema: z.ZodEnum<["armador_desarme", "desab_prepar", "pintor", "armador_montaje", "detailer"]>;
export declare const dpStageStatusSchema: z.ZodEnum<["pendiente", "en_proceso", "completado"]>;
export declare const assignDpStageSchema: z.ZodObject<{
    assignedUserId: z.ZodNullable<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    assignedUserId: number | null;
}, {
    assignedUserId: number | null;
}>;
export declare const updateDpStageSchema: z.ZodEffects<z.ZodObject<{
    assignedUserId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    status: z.ZodOptional<z.ZodEnum<["pendiente", "en_proceso", "completado"]>>;
    note: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    status?: "pendiente" | "completado" | "en_proceso" | undefined;
    assignedUserId?: number | null | undefined;
    note?: string | null | undefined;
}, {
    status?: "pendiente" | "completado" | "en_proceso" | undefined;
    assignedUserId?: number | null | undefined;
    note?: string | null | undefined;
}>, {
    status?: "pendiente" | "completado" | "en_proceso" | undefined;
    assignedUserId?: number | null | undefined;
    note?: string | null | undefined;
}, {
    status?: "pendiente" | "completado" | "en_proceso" | undefined;
    assignedUserId?: number | null | undefined;
    note?: string | null | undefined;
}>;
export declare const updateDpStageStatusSchema: z.ZodObject<{
    status: z.ZodEnum<["pendiente", "en_proceso", "completado"]>;
    note: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    status: "pendiente" | "completado" | "en_proceso";
    note?: string | null | undefined;
}, {
    status: "pendiente" | "completado" | "en_proceso";
    note?: string | null | undefined;
}>;
export declare const reviewDpQualitySchema: z.ZodEffects<z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<["pendiente", "aprobado", "rechazado"]>>;
    note: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    status?: "pendiente" | "rechazado" | "aprobado" | undefined;
    note?: string | null | undefined;
}, {
    status?: "pendiente" | "rechazado" | "aprobado" | undefined;
    note?: string | null | undefined;
}>, {
    status?: "pendiente" | "rechazado" | "aprobado" | undefined;
    note?: string | null | undefined;
}, {
    status?: "pendiente" | "rechazado" | "aprobado" | undefined;
    note?: string | null | undefined;
}>;
export type AssignDpStageInput = z.infer<typeof assignDpStageSchema>;
export type UpdateDpStageInput = z.infer<typeof updateDpStageSchema>;
export type UpdateDpStageStatusInput = z.infer<typeof updateDpStageStatusSchema>;
export type ReviewDpQualityInput = z.infer<typeof reviewDpQualitySchema>;
