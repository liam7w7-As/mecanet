import { z } from 'zod';
export declare const updateWorkOrderPricePolicySchema: z.ZodObject<{
    approvalRequired: z.ZodBoolean;
}, "strict", z.ZodTypeAny, {
    approvalRequired: boolean;
}, {
    approvalRequired: boolean;
}>;
export type UpdateWorkOrderPricePolicyInput = z.infer<typeof updateWorkOrderPricePolicySchema>;
