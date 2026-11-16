import { z } from 'zod';
export declare const reviewWorkOrderQualitySchema: z.ZodDiscriminatedUnion<"decision", [z.ZodObject<{
    decision: z.ZodLiteral<"aprobar">;
    nota: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    decision: "aprobar";
    nota?: string | null | undefined;
}, {
    decision: "aprobar";
    nota?: string | null | undefined;
}>, z.ZodObject<{
    decision: z.ZodLiteral<"rechazar">;
    nota: z.ZodString;
    members: z.ZodOptional<z.ZodEffects<z.ZodArray<z.ZodObject<{
        userId: z.ZodNumber;
        specialtyId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        estimatedHours: z.ZodNullable<z.ZodNumber>;
    }, "strict", z.ZodTypeAny, {
        userId: number;
        estimatedHours: number | null;
        specialtyId?: number | null | undefined;
    }, {
        userId: number;
        estimatedHours: number | null;
        specialtyId?: number | null | undefined;
    }>, "many">, {
        userId: number;
        estimatedHours: number | null;
        specialtyId?: number | null | undefined;
    }[], {
        userId: number;
        estimatedHours: number | null;
        specialtyId?: number | null | undefined;
    }[]>>;
}, "strict", z.ZodTypeAny, {
    decision: "rechazar";
    nota: string;
    members?: {
        userId: number;
        estimatedHours: number | null;
        specialtyId?: number | null | undefined;
    }[] | undefined;
}, {
    decision: "rechazar";
    nota: string;
    members?: {
        userId: number;
        estimatedHours: number | null;
        specialtyId?: number | null | undefined;
    }[] | undefined;
}>]>;
export declare const confirmWorkOrderQualitySchema: z.ZodObject<{
    notas: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    notas?: string | null | undefined;
}, {
    notas?: string | null | undefined;
}>;
export type ReviewWorkOrderQualityInput = z.infer<typeof reviewWorkOrderQualitySchema>;
export type ConfirmWorkOrderQualityInput = z.infer<typeof confirmWorkOrderQualitySchema>;
