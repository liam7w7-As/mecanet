import { z } from 'zod';
export declare const SALES_ACCESS_SCOPE_TYPES: readonly ["work_order", "quotation"];
export type SalesAccessScopeType = (typeof SALES_ACCESS_SCOPE_TYPES)[number];
export declare const SALES_ACCESS_SCOPE_LABELS: Record<SalesAccessScopeType, string>;
export declare const createSalesAccessGrantSchema: z.ZodObject<{
    scopeType: z.ZodEnum<["work_order", "quotation"]>;
    targetId: z.ZodNumber;
    includeLinkedRecord: z.ZodDefault<z.ZodBoolean>;
    expiresAt: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>, Date | null, string | null | undefined>;
}, "strip", z.ZodTypeAny, {
    scopeType: "work_order" | "quotation";
    targetId: number;
    includeLinkedRecord: boolean;
    expiresAt: Date | null;
}, {
    scopeType: "work_order" | "quotation";
    targetId: number;
    includeLinkedRecord?: boolean | undefined;
    expiresAt?: string | null | undefined;
}>;
export type CreateSalesAccessGrantInput = z.infer<typeof createSalesAccessGrantSchema>;
export declare const createRecordSalesAccessGrantSchema: z.ZodObject<{
    userId: z.ZodNumber;
    includeLinkedRecord: z.ZodDefault<z.ZodBoolean>;
    expiresAt: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>, Date | null, string | null | undefined>;
}, "strip", z.ZodTypeAny, {
    includeLinkedRecord: boolean;
    expiresAt: Date | null;
    userId: number;
}, {
    userId: number;
    includeLinkedRecord?: boolean | undefined;
    expiresAt?: string | null | undefined;
}>;
export type CreateRecordSalesAccessGrantInput = z.infer<typeof createRecordSalesAccessGrantSchema>;
export declare const salesAccessGrantParamsSchema: z.ZodObject<{
    id: z.ZodNumber;
    grantId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    id: number;
    grantId: number;
}, {
    id: number;
    grantId: number;
}>;
