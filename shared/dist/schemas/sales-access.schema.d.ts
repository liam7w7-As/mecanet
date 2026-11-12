import { z } from 'zod';
export declare const SALES_ACCESS_SCOPE_TYPES: readonly ["work_order", "quotation"];
export type SalesAccessScopeType = (typeof SALES_ACCESS_SCOPE_TYPES)[number];
export declare const SALES_ACCESS_MODES: readonly ["own", "selected", "all"];
export type SalesAccessMode = (typeof SALES_ACCESS_MODES)[number];
export declare const salesAccessRecordSchema: z.ZodObject<{
    scopeType: z.ZodEnum<["work_order", "quotation"]>;
    targetId: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    scopeType: "work_order" | "quotation";
    targetId: number;
}, {
    scopeType: "work_order" | "quotation";
    targetId: number;
}>;
export declare const updateSalesAccessSchema: z.ZodEffects<z.ZodEffects<z.ZodObject<{
    mode: z.ZodEnum<["own", "selected", "all"]>;
    records: z.ZodOptional<z.ZodArray<z.ZodObject<{
        scopeType: z.ZodEnum<["work_order", "quotation"]>;
        targetId: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        scopeType: "work_order" | "quotation";
        targetId: number;
    }, {
        scopeType: "work_order" | "quotation";
        targetId: number;
    }>, "many">>;
}, "strict", z.ZodTypeAny, {
    mode: "all" | "own" | "selected";
    records?: {
        scopeType: "work_order" | "quotation";
        targetId: number;
    }[] | undefined;
}, {
    mode: "all" | "own" | "selected";
    records?: {
        scopeType: "work_order" | "quotation";
        targetId: number;
    }[] | undefined;
}>, {
    mode: "all" | "own" | "selected";
    records?: {
        scopeType: "work_order" | "quotation";
        targetId: number;
    }[] | undefined;
}, {
    mode: "all" | "own" | "selected";
    records?: {
        scopeType: "work_order" | "quotation";
        targetId: number;
    }[] | undefined;
}>, {
    records?: {
        scopeType: "work_order" | "quotation";
        targetId: number;
    }[] | undefined;
    mode: "all" | "own" | "selected";
}, {
    mode: "all" | "own" | "selected";
    records?: {
        scopeType: "work_order" | "quotation";
        targetId: number;
    }[] | undefined;
}>;
export type UpdateSalesAccessInput = z.infer<typeof updateSalesAccessSchema>;
export declare const salesAccessRecordsQuerySchema: z.ZodObject<{
    scopeType: z.ZodEnum<["work_order", "quotation"]>;
    search: z.ZodOptional<z.ZodString>;
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    scopeType: "work_order" | "quotation";
    search?: string | undefined;
}, {
    scopeType: "work_order" | "quotation";
    page?: number | undefined;
    pageSize?: number | undefined;
    search?: string | undefined;
}>;
export type SalesAccessRecordsQuery = z.infer<typeof salesAccessRecordsQuerySchema>;
/** Checks only the authenticated seller's access to records open in the UI. */
export declare const salesAccessSessionQuerySchema: z.ZodObject<{
    workOrderIds: z.ZodOptional<z.ZodPipeline<z.ZodEffects<z.ZodString, number[], string>, z.ZodArray<z.ZodNumber, "many">>>;
    quotationIds: z.ZodOptional<z.ZodPipeline<z.ZodEffects<z.ZodString, number[], string>, z.ZodArray<z.ZodNumber, "many">>>;
}, "strip", z.ZodTypeAny, {
    workOrderIds?: number[] | undefined;
    quotationIds?: number[] | undefined;
}, {
    workOrderIds?: string | undefined;
    quotationIds?: string | undefined;
}>;
export type SalesAccessSessionQuery = z.infer<typeof salesAccessSessionQuerySchema>;
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
